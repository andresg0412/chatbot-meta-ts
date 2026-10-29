// Historial de mensajes para el panel (solo lectura). Diseño:
// proyecto-ips/docs/features/2026-10-29-historial-mensajes-panel.md, sección 5.
//
// Captura el TEXTO de lo que escriben los pacientes y de lo que responde el bot y lo manda por lotes a
// `POST {API_BACKEND_URL}/historial/batch` (tabla aislada `mensajes_conversacion`; no va a `chat_stats`: P7 sigue
// vigente para la trazabilidad). Es una cola SEPARADA de trazabilidad.ts (otro endpoint, otro token, otro spool, otra
// bandera) con el mismo diseño: en memoria, por lotes, con backoff y spool en disco.
//
// Reglas que no se rompen:
//  - Todo es fire-and-forget: `registrarMensaje` y compañía son síncronas, NUNCA lanzan y nunca se espera nada de
//    ellas en un flujo. Con la bandera apagada no hacen nada (y no se hace ninguna petición).
//  - Orden: dentro del mismo milisegundo el panel ordena por `id` (orden de inserción). La cola es FIFO en un solo
//    proceso, y el spool se vuelve a anteponer a la cola antes de reenviar, así que el orden se conserva. Esto
//    depende de PM2 en `fork` (ya obligatorio: en `cluster` habría dos colas y dos spools sobre el mismo archivo).
//  - Un 400/413 del backend descarta el lote (reintentarlo no lo arregla); 5xx, 429, 401/503 (token mal puesto),
//    red y timeout se reintentan con backoff (el backend es idempotente por `mensaje_uid`).
//  - El spool contiene texto de pacientes: permisos 0600, tope de tamaño (descarta lo más viejo) y está en .gitignore.
//  - Los estados de entrega de Meta salen DESPUÉS de los mensajes en cada flush (así el UPDATE del backend encuentra
//    la fila saliente) y no se guardan en disco: son solo los "chulitos".

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { obtenerSesionTraza, uuidV5 } from './trazabilidad';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

export type DireccionHistorial = 'entrante' | 'saliente' | 'sistema';
export type OrigenHistorial = 'paciente' | 'bot_flujo' | 'campana' | 'crisis' | 'sistema';
export type TipoHistorial =
    | 'texto' | 'boton' | 'lista' | 'plantilla' | 'imagen' | 'audio' | 'video' | 'documento'
    | 'ubicacion' | 'sticker' | 'contacto' | 'reaccion' | 'botones' | 'lista_opciones' | 'evento' | 'otro';

export interface MensajeHistorialV1 {
    mensaje_uid: string;
    v: 1;
    direccion: DireccionHistorial;
    origen: OrigenHistorial;
    tipo: TipoHistorial;
    telefono: string;
    texto?: string | null;
    contenido?: Record<string, unknown> | null;
    wa_message_id?: string | null;
    plantilla?: string | null;
    campana?: string | null;
    sesion_id?: string | null;
    flujo?: string | null;
    paso?: string | null;
    estado_envio?: 'aceptado' | 'error_api' | null;
    error_code?: string | null;
    en_blacklist?: boolean | null;
    ocurrido_at: string;
}

export type MensajeEntrada = Omit<MensajeHistorialV1, 'mensaje_uid' | 'v' | 'ocurrido_at'> & {
    mensaje_uid?: string;
    ocurrido_at?: string;
};

interface EstadoPendiente {
    wa_message_id: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    ocurrido_at: string;
    error_code: string | null;
}

export const MAX_TEXTO = 4096;
const MAX_CONTENIDO_CHARS = 7000; // por debajo de los 8192 que acepta el backend
const LOTE_MAX_MENSAJES = 100;
const LOTE_MAX_ESTADOS = 200;
const TIMEOUT_HTTP_MS = 5000;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 60000;
const MAX_ESTADOS_EN_COLA = 2000;
const MAX_SPOOL_BYTES_POR_DEFECTO = 20 * 1024 * 1024;

export function isHistorialEnabled(): boolean {
    return process.env.HISTORIAL_MENSAJES_ENABLED === 'true';
}

function enteroPositivoEnv(nombre: string, porDefecto: number, minimo: number): number {
    const valor = Number(process.env[nombre]);
    if (!Number.isFinite(valor) || valor <= 0) return porDefecto;
    return Math.max(minimo, Math.floor(valor));
}

export const historialFlushMs = () => enteroPositivoEnv('HISTORIAL_FLUSH_MS', 1500, 250);
export const historialLoteMax = () => Math.min(LOTE_MAX_MENSAJES, enteroPositivoEnv('HISTORIAL_LOTE_MAX', 25, 1));
export const historialMaxCola = () => enteroPositivoEnv('HISTORIAL_MAX_COLA', 3000, 1);
const maxSpoolBytes = () => enteroPositivoEnv('HISTORIAL_MAX_SPOOL_MB', 20, 1) * 1024 * 1024 || MAX_SPOOL_BYTES_POR_DEFECTO;

function token(): string {
    return (process.env.HISTORIAL_MENSAJES_TOKEN ?? '').trim();
}

function urlBase(): string | null {
    const base = process.env.API_BACKEND_URL;
    return base ? `${base.replace(/\/+$/, '')}/historial` : null;
}

// ---------------------------------------------------------------------------
// Utilidades de forma de datos
// ---------------------------------------------------------------------------

/** Trunca a MAX_TEXTO caracteres dejando "[…]" al final. Nada si no hay texto. */
export function truncarTexto(valor: unknown): string | null {
    if (valor === null || valor === undefined) return null;
    const s = String(valor);
    if (s === '') return null;
    return s.length > MAX_TEXTO ? `${s.slice(0, MAX_TEXTO - 3)}[…]` : s;
}

/** Limita el `contenido` serializado: si se pasa, se reemplaza por una marca (no se pierde el mensaje). */
export function limitarContenido(contenido: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
    if (!contenido || typeof contenido !== 'object') return null;
    try {
        const json = JSON.stringify(contenido);
        if (json.length <= MAX_CONTENIDO_CHARS) return contenido;
        return { truncado: true, largo_original: json.length };
    } catch {
        return null;
    }
}

const corto = (v: unknown, max: number): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v);
    if (s === '') return null;
    return s.length > max ? s.slice(0, max) : s;
};

// ---------------------------------------------------------------------------
// Cola, envío por lotes, backoff y spool
// ---------------------------------------------------------------------------

let cola: MensajeHistorialV1[] = [];
let colaEstados: EstadoPendiente[] = [];
let loteEnVuelo: MensajeHistorialV1[] | null = null;
let enviando = false;
let fallosConsecutivos = 0;
let noAntesDe = 0;
let intervalo: NodeJS.Timeout | null = null;
let avisoConfigEmitido = false;
let rutaSpool = path.join(__dirname, 'historialSpool.jsonl');

/** Habilitada de verdad: bandera, token y URL del backend. Avisa una sola vez si falta algo. */
function activa(): boolean {
    if (!isHistorialEnabled()) return false;
    if (token() && urlBase()) return true;
    if (!avisoConfigEmitido) {
        avisoConfigEmitido = true;
        console.warn('[historial] HISTORIAL_MENSAJES_ENABLED=true pero falta HISTORIAL_MENSAJES_TOKEN o API_BACKEND_URL: no se captura nada.');
    }
    return false;
}

function asegurarIntervalo(): void {
    if (intervalo) return;
    intervalo = setInterval(() => {
        flushHistorial().catch(() => undefined);
    }, historialFlushMs());
    if (typeof intervalo.unref === 'function') intervalo.unref();
}

function backoffMs(fallos: number): number {
    return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, fallos - 1));
}

function encolar(mensaje: MensajeHistorialV1): void {
    cola.push(mensaje);
    asegurarIntervalo();
    if (cola.length > historialMaxCola()) {
        volcarColaASpool();
        return;
    }
    if (cola.length >= historialLoteMax()) {
        flushHistorial().catch(() => undefined);
    }
}

type ResultadoEnvio = 'ok' | 'reintentar' | 'descartar';

async function postHistorial(ruta: 'batch' | 'estados', cuerpo: unknown, cantidad: number): Promise<ResultadoEnvio> {
    try {
        await axios.post(`${urlBase()}/${ruta}`, cuerpo, {
            timeout: TIMEOUT_HTTP_MS,
            headers: { 'x-historial-token': token() },
        });
        return 'ok';
    } catch (error: any) {
        const status: number | undefined = error?.response?.status;
        if (status === 400 || status === 413) {
            // Nunca se loguea el contenido: puede ser texto de un paciente.
            console.error(`[historial] Lote de ${cantidad} (${ruta}) descartado: el backend respondió ${status}.`);
            return 'descartar';
        }
        console.warn(`[historial] Falló el envío (${ruta}, ${status ?? error?.code ?? 'sin respuesta'}); se reintenta con backoff.`);
        return 'reintentar';
    }
}

/**
 * Envía la cola: primero los mensajes (antes, lo que haya en el spool), después los estados de entrega. Un solo envío
 * a la vez, respetando el backoff tras un fallo. Nunca lanza.
 */
export async function flushHistorial(): Promise<void> {
    try {
        if (!activa()) return;
        if (enviando) return;
        if (Date.now() < noAntesDe) return;
        enviando = true;
        try {
            // El spool contiene lo más viejo: se antepone para que el orden de inserción sea el de captura.
            if (hayEnSpool()) anteponerSpoolALaCola();
            while (cola.length > 0) {
                const lote = cola.splice(0, LOTE_MAX_MENSAJES);
                loteEnVuelo = lote;
                let resultado: ResultadoEnvio;
                try {
                    resultado = await postHistorial('batch', { mensajes: lote }, lote.length);
                } finally {
                    loteEnVuelo = null;
                }
                if (resultado === 'reintentar') {
                    cola.unshift(...lote);
                    fallosConsecutivos++;
                    noAntesDe = Date.now() + backoffMs(fallosConsecutivos);
                    if (cola.length > historialMaxCola()) volcarColaASpool();
                    return; // los estados esperan: sin la fila saliente en la base no habría qué actualizar
                }
                fallosConsecutivos = 0;
                noAntesDe = 0;
            }
            while (colaEstados.length > 0) {
                const lote = colaEstados.splice(0, LOTE_MAX_ESTADOS);
                const resultado = await postHistorial('estados', { estados: lote }, lote.length);
                if (resultado === 'reintentar') {
                    colaEstados.unshift(...lote);
                    fallosConsecutivos++;
                    noAntesDe = Date.now() + backoffMs(fallosConsecutivos);
                    return;
                }
                fallosConsecutivos = 0;
                noAntesDe = 0;
            }
        } finally {
            enviando = false;
        }
    } catch (error) {
        enviando = false;
        loteEnVuelo = null;
        console.warn('[historial] Error inesperado en flush:', (error as any)?.message ?? error);
    }
}

// --- Spool en disco (texto de pacientes: 0600, con tope, en .gitignore) ---

function hayEnSpool(): boolean {
    try {
        return fs.existsSync(rutaSpool) && fs.statSync(rutaSpool).size > 0;
    } catch {
        return false;
    }
}

/** Escribe líneas al final del spool respetando el tope (si se pasa, descarta las más viejas) y 0600. */
function escribirEnSpool(mensajes: MensajeHistorialV1[]): void {
    if (mensajes.length === 0) return;
    const nuevas = mensajes.map((m) => JSON.stringify(m));
    const tope = maxSpoolBytes();
    let existentes: string[] = [];
    try {
        if (fs.existsSync(rutaSpool)) existentes = fs.readFileSync(rutaSpool, 'utf-8').split('\n').filter((l) => l.trim());
    } catch {
        existentes = [];
    }
    let todas = [...existentes, ...nuevas];
    let bytes = todas.reduce((n, l) => n + Buffer.byteLength(l) + 1, 0);
    let descartadas = 0;
    while (bytes > tope && todas.length > 1) {
        const quitada = todas.shift() as string;
        bytes -= Buffer.byteLength(quitada) + 1;
        descartadas++;
    }
    fs.writeFileSync(rutaSpool, todas.join('\n') + '\n', { encoding: 'utf-8', mode: 0o600 });
    try {
        fs.chmodSync(rutaSpool, 0o600);
    } catch {
        /* Windows: sin permisos POSIX */
    }
    if (descartadas > 0) console.error(`[historial] El spool superó ${Math.round(tope / 1048576)} MB: se descartaron ${descartadas} mensaje(s) viejos.`);
}

function volcarColaASpool(): void {
    const pendientes = cola;
    cola = [];
    try {
        escribirEnSpool(pendientes);
        console.warn(`[historial] ${pendientes.length} mensaje(s) pasados al spool (${path.basename(rutaSpool)}).`);
    } catch (error) {
        // Sin disco: se conservan en memoria los más recientes hasta el tope.
        cola = pendientes.slice(-historialMaxCola());
        console.error('[historial] No se pudo escribir el spool:', (error as any)?.message ?? error);
    }
}

function esMensajeV1(valor: any): valor is MensajeHistorialV1 {
    return !!valor && typeof valor === 'object' && valor.v === 1
        && typeof valor.mensaje_uid === 'string' && typeof valor.telefono === 'string'
        && typeof valor.ocurrido_at === 'string' && typeof valor.tipo === 'string';
}

/** Lee el spool, lo borra y lo pone AL FRENTE de la cola (es lo más viejo). Devuelve cuántos recuperó. */
function anteponerSpoolALaCola(): number {
    try {
        if (!hayEnSpool()) return 0;
        const contenido = fs.readFileSync(rutaSpool, 'utf-8');
        fs.unlinkSync(rutaSpool);
        const recuperados: MensajeHistorialV1[] = [];
        for (const linea of contenido.split('\n')) {
            if (!linea.trim()) continue;
            try {
                const valor = JSON.parse(linea);
                if (esMensajeV1(valor)) recuperados.push(valor);
            } catch {
                /* línea corrupta (apagado a mitad de escritura): se descarta */
            }
        }
        cola = [...recuperados, ...cola];
        return recuperados.length;
    } catch (error) {
        console.error('[historial] No se pudo leer el spool:', (error as any)?.message ?? error);
        return 0;
    }
}

/** Escribe en el spool, de forma síncrona, todo lo pendiente (incluido el lote en vuelo). */
export function volcarHistorialAlApagar(): number {
    try {
        const pendientes = [...(loteEnVuelo ?? []), ...cola];
        cola = [];
        escribirEnSpool(pendientes);
        return pendientes.length;
    } catch (error) {
        console.error('[historial] No se pudo volcar la cola al apagar:', (error as any)?.message ?? error);
        return 0;
    }
}

let apagadoRegistrado = false;

/** Volcado de la cola al spool en SIGTERM/SIGINT; re-emite la señal para que el proceso termine como antes. */
function registrarVolcadoAlApagar(): void {
    if (apagadoRegistrado) return;
    apagadoRegistrado = true;
    for (const senal of ['SIGTERM', 'SIGINT'] as const) {
        process.once(senal, () => {
            const volcados = volcarHistorialAlApagar();
            if (volcados > 0) console.log(`[historial] ${volcados} mensaje(s) guardados en el spool antes de apagar (${senal}).`);
            process.kill(process.pid, senal);
        });
    }
}

/** Arranque (app.ts): con la bandera encendida arranca el flush y el volcado al apagar; el spool se retoma solo. */
export function iniciarHistorial(): void {
    if (!isHistorialEnabled()) {
        console.log('[historial] HISTORIAL_MENSAJES_ENABLED != true: no se captura el historial de mensajes.');
        return;
    }
    if (!activa()) return;
    asegurarIntervalo();
    registrarVolcadoAlApagar();
    console.log(`[historial] Activo (lotes a /historial/batch cada ${historialFlushMs()} ms, spool ${hayEnSpool() ? 'con pendientes' : 'vacío'}).`);
}

// ---------------------------------------------------------------------------
// Registro (API pública; síncrona y sin excepciones)
// ---------------------------------------------------------------------------

/** Encola un mensaje. Con la bandera apagada no hace nada. NUNCA lanza. */
export function registrarMensaje(entrada: MensajeEntrada): void {
    try {
        if (!activa()) return;
        const telefono = String(entrada.telefono ?? '').replace(/\D/g, '');
        if (!telefono) return;
        const sesion = obtenerSesionTraza(telefono);
        encolar({
            mensaje_uid: entrada.mensaje_uid ?? randomUUID(),
            v: 1,
            direccion: entrada.direccion,
            origen: entrada.origen,
            tipo: entrada.tipo,
            telefono,
            texto: truncarTexto(entrada.texto),
            contenido: limitarContenido(entrada.contenido),
            wa_message_id: corto(entrada.wa_message_id, 100),
            plantilla: corto(entrada.plantilla, 100),
            campana: corto(entrada.campana, 20),
            sesion_id: corto(entrada.sesion_id ?? sesion?.sesionId, 40),
            flujo: corto(entrada.flujo ?? sesion?.ultimoFlujo, 40),
            paso: corto(entrada.paso ?? sesion?.ultimoPaso, 60),
            estado_envio: entrada.estado_envio ?? null,
            error_code: corto(entrada.error_code, 20),
            en_blacklist: entrada.en_blacklist ?? null,
            ocurrido_at: entrada.ocurrido_at ?? new Date().toISOString(),
        });
    } catch (error) {
        console.warn('[historial] Error registrando mensaje:', (error as any)?.message ?? error);
    }
}

/** Línea de contexto en la conversación (crisis activada, aviso al asesor...). Nunca lanza. */
export function registrarEventoSistema(telefono: string | null | undefined, texto: string, origen: 'crisis' | 'sistema' = 'sistema'): void {
    if (!telefono) return;
    registrarMensaje({ direccion: 'sistema', origen, tipo: 'evento', telefono, texto });
}

/** Encola un estado de entrega de Meta (sent/delivered/read/failed). Nunca lanza. */
export function registrarEstadoMeta(waMessageId: string | null | undefined, status: string, ocurridoAt?: string, errorCode?: string | null): void {
    try {
        if (!activa()) return;
        if (!waMessageId || !['sent', 'delivered', 'read', 'failed'].includes(status)) return;
        colaEstados.push({
            wa_message_id: waMessageId.slice(0, 100),
            status: status as EstadoPendiente['status'],
            ocurrido_at: ocurridoAt ?? new Date().toISOString(),
            error_code: errorCode ? String(errorCode).slice(0, 20) : null,
        });
        if (colaEstados.length > MAX_ESTADOS_EN_COLA) colaEstados.splice(0, colaEstados.length - MAX_ESTADOS_EN_COLA);
        asegurarIntervalo();
    } catch (error) {
        console.warn('[historial] Error registrando estado:', (error as any)?.message ?? error);
    }
}

// ---------------------------------------------------------------------------
// Traducción: mensaje entrante (ctx de @builderbot/provider-meta)
// ---------------------------------------------------------------------------

interface BotConBlacklist {
    dynamicBlacklist?: { checkIf?: (numero: string) => boolean };
}

/**
 * Qué guarda cada tipo de entrante. @builderbot/provider-meta NO expone el id del medio ni el mime (solo una `url`
 * temporal de Graph con credenciales, que no se guarda: D8 sin descargar archivos) ni el id del botón interactivo
 * (solo su título), así que de la multimedia quedan el tipo y el caption.
 */
export function traducirEntrante(ctx: any): Pick<MensajeHistorialV1, 'tipo' | 'texto' | 'contenido'> {
    const tipoProvider = typeof ctx?.type === 'string' ? ctx.type : '';
    const cuerpo = typeof ctx?.body === 'string' ? ctx.body : '';
    switch (tipoProvider) {
        case 'text':
            return { tipo: 'texto', texto: cuerpo, contenido: null };
        case 'button': {
            // Botón de plantilla: body = texto del botón; payload = valor configurado en el envío (p. ej. LEREC:<id>:C).
            const payload = typeof ctx?.payload === 'string' ? ctx.payload : null;
            return { tipo: 'boton', texto: cuerpo || payload, contenido: payload ? { payload } : null };
        }
        case 'interactive': {
            if (ctx?.nfm_reply) return { tipo: 'otro', texto: null, contenido: { tipo_original: 'nfm_reply' } };
            if (typeof ctx?.title_list_reply === 'string' && ctx.title_list_reply) {
                return { tipo: 'lista', texto: ctx.title_list_reply, contenido: cuerpo ? { id: cuerpo } : null };
            }
            const titulo = typeof ctx?.title_button_reply === 'string' && ctx.title_button_reply ? ctx.title_button_reply : cuerpo;
            return { tipo: 'boton', texto: titulo || null, contenido: null };
        }
        case 'image':
        case 'video':
            return { tipo: tipoProvider === 'image' ? 'imagen' : 'video', texto: typeof ctx?.caption === 'string' ? ctx.caption : null, contenido: null };
        case 'document':
            return { tipo: 'documento', texto: typeof ctx?.caption === 'string' ? ctx.caption : null, contenido: null };
        case 'audio':
            return { tipo: 'audio', texto: null, contenido: null };
        case 'sticker':
            return { tipo: 'sticker', texto: null, contenido: null };
        case 'location':
            // Solo la marca: las coordenadas de un paciente son un dato personal que no se guarda.
            return { tipo: 'ubicacion', texto: null, contenido: null };
        case 'contacts':
            return { tipo: 'contacto', texto: null, contenido: null };
        default:
            return { tipo: 'otro', texto: null, contenido: tipoProvider ? { tipo_original: tipoProvider } : null };
    }
}

/** Hora del mensaje según Meta (`ctx.timestamp`, segundos); si no es creíble, la hora de recepción. */
function momentoEntrante(ctx: any): string {
    const segundos = Number(ctx?.timestamp);
    if (Number.isFinite(segundos) && segundos > 0) {
        const ms = segundos * 1000;
        if (Math.abs(Date.now() - ms) < 24 * 3600 * 1000) return new Date(ms).toISOString();
    }
    return new Date().toISOString();
}

/**
 * Listener de `adapterProvider.on('message')`. Va justo después del interceptor de crisis (así `en_blacklist` ya
 * refleja un bloqueo de este mismo mensaje) y antes de createBot. Captura también a los números bloqueados por
 * crisis. Un reintento del webhook de Meta produce el mismo `mensaje_uid` (UUIDv5 de `in:<message_id>`). Nunca lanza.
 */
export function crearListenerHistorial(getBot: () => BotConBlacklist | undefined) {
    return function capturarMensajeEntrante(ctx: any): void {
        try {
            if (!isHistorialEnabled()) return;
            const from: string | undefined = ctx?.from;
            if (!from) return;
            let enBlacklist: boolean | null = null;
            try {
                const lista = getBot()?.dynamicBlacklist;
                if (typeof lista?.checkIf === 'function') enBlacklist = !!lista.checkIf.call(lista, from);
            } catch {
                enBlacklist = null;
            }
            const messageId = typeof ctx?.message_id === 'string' && ctx.message_id ? ctx.message_id : null;
            registrarMensaje({
                mensaje_uid: messageId ? uuidV5(`in:${messageId}`) : undefined,
                direccion: 'entrante',
                origen: 'paciente',
                telefono: from,
                wa_message_id: messageId,
                en_blacklist: enBlacklist,
                ocurrido_at: momentoEntrante(ctx),
                ...traducirEntrante(ctx),
            });
        } catch (error) {
            console.warn('[historial] Error capturando mensaje entrante:', (error as any)?.message ?? error);
        }
    };
}

// ---------------------------------------------------------------------------
// Traducción: body de Graph (salientes)
// ---------------------------------------------------------------------------

export interface ContextoSaliente {
    origen?: OrigenHistorial;
    campana?: string | null;
    plantilla?: string | null;
}

export interface ResultadoSaliente {
    waMessageId: string | null;
    estado: 'aceptado' | 'error_api';
    errorCode?: string | null;
    ocurridoAt?: string;
}

const titulosBotones = (botones: any): string[] =>
    (Array.isArray(botones) ? botones : []).map((b: any) => String(b?.reply?.title ?? b?.title ?? '')).filter(Boolean);

/** Tipo de Graph → tipo del historial (los valores deben ser los del CHECK de mensajes_conversacion). */
const TIPO_POR_MEDIO_GRAPH: Record<'image' | 'video' | 'audio' | 'document', TipoHistorial> = {
    image: 'imagen',
    video: 'video',
    audio: 'audio',
    document: 'documento',
};

/** Convierte el body de una petición a Graph en un mensaje del historial (sin teléfono resuelto ni uid). */
export function traducirBodyGraph(body: any): Pick<MensajeHistorialV1, 'tipo' | 'texto' | 'contenido' | 'plantilla'> {
    const tipo = typeof body?.type === 'string' ? body.type : '';
    switch (tipo) {
        case 'text':
            return { tipo: 'texto', texto: body?.text?.body ?? null, contenido: null, plantilla: null };
        case 'interactive': {
            const it = body?.interactive ?? {};
            const header = it?.header?.image?.link || it?.header?.video?.link ? { header: it.header.type } : {};
            if (it.type === 'button') {
                return { tipo: 'botones', texto: it?.body?.text ?? null, contenido: { botones: titulosBotones(it?.action?.buttons), ...header }, plantilla: null };
            }
            if (it.type === 'list') {
                const secciones = (Array.isArray(it?.action?.sections) ? it.action.sections : []).map((s: any) => ({
                    titulo: s?.title ?? null,
                    filas: (Array.isArray(s?.rows) ? s.rows : []).map((r: any) => String(r?.title ?? '')),
                }));
                return { tipo: 'lista_opciones', texto: it?.body?.text ?? null, contenido: { boton: it?.action?.button ?? null, secciones }, plantilla: null };
            }
            if (it.type === 'cta_url') {
                return { tipo: 'botones', texto: it?.body?.text ?? null, contenido: { botones: [it?.action?.parameters?.display_text ?? ''], url: it?.action?.parameters?.url ?? null }, plantilla: null };
            }
            return { tipo: 'otro', texto: it?.body?.text ?? null, contenido: { tipo_original: `interactive:${it?.type ?? ''}` }, plantilla: null };
        }
        case 'image':
        case 'video':
        case 'audio':
        case 'document': {
            const medio = body?.[tipo] ?? {};
            const archivo = medio.filename ?? (typeof medio.link === 'string' ? medio.link.split('?')[0].split('/').pop() : null) ?? null;
            return {
                tipo: TIPO_POR_MEDIO_GRAPH[tipo],
                texto: medio.caption ?? null,
                contenido: archivo ? { archivo } : null,
                plantilla: null,
            };
        }
        case 'template': {
            const t = body?.template ?? {};
            const componentes: any[] = Array.isArray(t.components) ? t.components : [];
            const parametros = componentes
                .filter((c) => c?.type === 'body')
                .flatMap((c) => (Array.isArray(c?.parameters) ? c.parameters : []))
                .map((p: any) => (p?.type === 'text' ? String(p.text ?? '') : `(${p?.type ?? ''})`));
            const botones = componentes
                .filter((c) => c?.type === 'button')
                .map((c) => ({ indice: c?.index ?? null, payload: c?.parameters?.[0]?.payload ?? null }));
            return {
                tipo: 'plantilla',
                texto: null,
                contenido: { idioma: t?.language?.code ?? null, parametros, ...(botones.length ? { botones } : {}) },
                plantilla: typeof t.name === 'string' ? t.name : null,
            };
        }
        case 'location':
            return { tipo: 'ubicacion', texto: body?.location?.name ?? null, contenido: null, plantilla: null };
        case 'reaction':
            return { tipo: 'reaccion', texto: body?.reaction?.emoji ?? null, contenido: null, plantilla: null };
        default:
            return { tipo: 'otro', texto: null, contenido: tipo ? { tipo_original: tipo } : null, plantilla: null };
    }
}

/** Registra un mensaje saliente a partir del body enviado a Graph. NUNCA lanza. */
export function registrarSalienteDesdeBody(body: any, resultado: ResultadoSaliente, ctx: ContextoSaliente = {}): void {
    try {
        if (!isHistorialEnabled() || !body) return;
        const traducido = traducirBodyGraph(body);
        registrarMensaje({
            direccion: 'saliente',
            origen: ctx.origen ?? 'bot_flujo',
            telefono: String(body.to ?? ''),
            wa_message_id: resultado.waMessageId,
            estado_envio: resultado.estado,
            error_code: resultado.errorCode ?? null,
            campana: ctx.campana ?? null,
            ocurrido_at: resultado.ocurridoAt,
            ...traducido,
            plantilla: ctx.plantilla ?? traducido.plantilla,
        });
    } catch (error) {
        console.warn('[historial] Error registrando mensaje saliente:', (error as any)?.message ?? error);
    }
}

/** Código de error de Graph (`error.code`) de una excepción de axios, si existe. */
export function codigoErrorGraph(err: any): string | null {
    const c = err?.response?.data?.error?.code;
    return c !== undefined && c !== null ? String(c) : (err?.code ? String(err.code) : null);
}

/**
 * Envuelve `sendMessageToApi` del provider (una vez, en la instancia) para capturar los salientes del flujo. El error
 * original se RELANZA y la respuesta se devuelve intacta: al flujo no le cambia nada. Si el provider no expone la
 * función (cambio de versión de @builderbot), se avisa y se sigue SIN capturar salientes: nunca tumba el bot.
 */
export function envolverEnvioProvider(provider: any): boolean {
    try {
        if (typeof provider?.sendMessageToApi !== 'function') {
            console.error('[historial] El provider no expone sendMessageToApi (¿cambió la versión de @builderbot/provider-meta?): no se capturan los mensajes salientes.');
            return false;
        }
        const original = provider.sendMessageToApi.bind(provider);
        provider.sendMessageToApi = async (body: any) => {
            const inicio = new Date().toISOString();
            try {
                const data = await original(body);
                registrarSalienteDesdeBody(body, { waMessageId: data?.messages?.[0]?.id ?? null, estado: 'aceptado', ocurridoAt: inicio });
                return data;
            } catch (err) {
                registrarSalienteDesdeBody(body, { waMessageId: null, estado: 'error_api', errorCode: codigoErrorGraph(err), ocurridoAt: inicio });
                throw err; // el comportamiento del provider no cambia
            }
        };
        return true;
    } catch (error) {
        console.error('[historial] No se pudo envolver sendMessageToApi:', (error as any)?.message ?? error);
        return false;
    }
}

// ---------------------------------------------------------------------------
// Solo para pruebas
// ---------------------------------------------------------------------------

export function _estadoParaPruebas() {
    return { cola: [...cola], estados: [...colaEstados], enVuelo: loteEnVuelo, fallosConsecutivos, noAntesDe, rutaSpool };
}

export function _resetParaPruebas(opciones?: { rutaSpool?: string }): void {
    cola = [];
    colaEstados = [];
    loteEnVuelo = null;
    enviando = false;
    fallosConsecutivos = 0;
    noAntesDe = 0;
    avisoConfigEmitido = false;
    if (intervalo) clearInterval(intervalo);
    intervalo = null;
    if (opciones?.rutaSpool) rutaSpool = opciones.rutaSpool;
}
