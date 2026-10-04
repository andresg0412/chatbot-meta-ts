// Trazabilidad completa de usuarios ("migas de pan") — lado del bot.
// Contrato: proyecto-ips/docs/features/2026-09-29-trazabilidad-usuarios.md, secciones 4.3.1 y 11
// (la sección 11 manda).
//
// Qué hace este módulo:
// - `trackEvento()` arma un EventoV2 y lo encola en memoria. Es SÍNCRONO y NUNCA lanza: un fallo de
//   telemetría jamás debe afectar la conversación con el paciente.
// - La cola se envía por lotes a `POST {API_BACKEND_URL}/stats/batch` (sin headers de autenticación,
//   decisión P3) cada `TRAZABILIDAD_FLUSH_MS` (default 5000) o al llegar a 50 eventos.
// - Si el backend falla (500, 429, red, timeout) el lote vuelve a la cola y se reintenta con backoff
//   exponencial. El backend es idempotente por `evento_uid`, así que reenviar es seguro.
// - Si la cola supera `TRAZABILIDAD_MAX_COLA` (default 5000) o el proceso se apaga (SIGTERM/SIGINT),
//   los eventos pendientes se escriben en `src/utils/trazabilidadSpool.jsonl` (en .gitignore) y se
//   reenvían al arrancar (`iniciarTrazabilidad`) y cuando el backend vuelve a responder.
// - Todo lo anterior solo ocurre con `TRAZABILIDAD_V2_ENABLED=true`. Apagado (default), `trackEvento`
//   no hace nada y el bot sigue registrando únicamente los eventos legados por `POST /stats`.
//
// Privacidad (P7, decisión de German): NUNCA se encola texto libre del paciente. Solo ids del catálogo,
// enums, contadores, el documento validado y etiquetas de botón/lista definidas por la IPS.
//
// PM2 en `fork` es obligatorio: la cola y el spool viven en un solo proceso. En `cluster` habría dos
// colas y dos spools escribiendo el mismo archivo.

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { obtenerPaso, PasoId } from '../constants/pasosTrazabilidad';
import { isValidDocumentNumber, sanitizeString } from './sanitize';

// ---------------------------------------------------------------------------
// Tipos del contrato (sección 11.1 / 11.2)
// ---------------------------------------------------------------------------

export type OrigenEvento = 'usuario' | 'bot' | 'campana' | 'sistema' | 'backend';
// 'le_invit_reg' / 'le_invit_cont': campañas de invitación a la lista de espera (regularización y continua).
// Códigos cortos porque `chat_stats.campana` y `envios_whatsapp.campana` son VARCHAR(20) (C10 de
// proyecto-ips/docs/features/2026-10-04-campanas-invitacion-lista-espera-implementacion.md).
export type CampanaTraza =
    | 'daily'
    | 'reminder'
    | 'execute'
    | 'recuperacion'
    | 'conasistencia'
    | 'oferta_cupo'
    | 'aviso_asesor'
    | 'le_invit_reg'
    | 'le_invit_cont';
export type ValorMetadata = string | number | boolean | null;
export type MetadataEvento = Record<string, ValorMetadata>;

export interface EventoV2 {
    evento_uid: string;
    v: 2;
    tipo_evento: string;
    ocurrido_at: string;
    telefono: string | null;
    sesion_id?: string | null;
    flujo?: string | null;
    paso?: string | null;
    resultado?: string | null;
    origen?: OrigenEvento;
    documento?: string | null;
    /** Id interno VARCHAR(8) de `agenda` (agenda.agenda_id). No es el id de Globho. */
    agenda_id?: string | null;
    cita_id_externa?: number | null;
    campana?: CampanaTraza | null;
    campana_ejecucion_id?: string | null;
    wa_message_id?: string | null;
    duracion_ms?: number | null;
    metadata?: MetadataEvento;
}

/**
 * Lo que recibe `trackEvento`: el bot completa `evento_uid`, `v`, `ocurrido_at`, `sesion_id` y
 * `documento` (estos dos desde la sesión activa del teléfono, salvo que se pasen explícitos; pasar
 * `sesion_id: null` desactiva ese enriquecimiento).
 */
export type EventoEntrada = Omit<Partial<EventoV2>, 'v' | 'metadata' | 'telefono'> & {
    tipo_evento: string;
    telefono?: string | null;
    metadata?: Record<string, unknown>;
};

export type MotivoFinSesion =
    | 'completado'
    | 'salir'
    | 'timeout'
    | 'timeout_12h'
    | 'rate_limit'
    | 'kill_switch'
    | 'crisis'
    | 'no_acepta_politicas'
    | 'reinicio_bot';

export type DisparadorSesion = 'welcome' | 'keyword' | 'respuesta_plantilla';
export type ResultadoPaso = 'mostrado' | 'ok' | 'invalido' | 'error';
export type ResultadoFin =
    | 'cita_creada'
    | 'cita_cancelada'
    | 'cita_reprogramada'
    | 'derivado_agente'
    | 'fuera_horario'
    | 'error_backend'
    | 'informativo'
    | 'cita_confirmada'
    // T-01: la cita quedó movida en Globho pero no en Postgres (502 POSTGRES_DESPUES_DE_GLOBHO); queda
    // para revisión de un asesor. No es ni éxito ni error recuperable.
    | 'revision_manual';
export type ResultadoIdentificacion = 'encontrado' | 'nuevo' | 'no_encontrado';
export type ResultadoRespuestaCampana =
    | 'confirmo'
    | 'cancelar'
    | 'no_asistira'
    | 'otro_momento'
    | 'finalizo'
    | 'acepta_cupo'
    | 'rechaza_cupo'
    // Botones de la invitación a la lista de espera ("Sí, quiero recibir avisos" / "No, gracias").
    | 'acepta_invitacion'
    | 'rechaza_invitacion';

/** Resultado de un envío saliente a Graph API (plantilla o texto). */
export interface ResultadoEnvioMeta {
    exito: boolean;
    mensajeWaId?: string;
    errorCode?: string;
    errorTitulo?: string;
}

// ---------------------------------------------------------------------------
// Configuración (se lee de process.env en cada llamada, igual que el resto de flags del bot)
// ---------------------------------------------------------------------------

export const TAMANO_FLUSH = 50;
export const MAX_EVENTOS_POR_LOTE = 100;
const TIMEOUT_HTTP_MS = 10000;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 60000;
const FALLO_BACKEND_TTL_MS = 30000;
const REGEX_TIPO_EVENTO = /^[a-z0-9_]{3,60}$/;
const REGEX_CLAVE_METADATA = /^[a-z0-9_]{1,40}$/;
const MAX_CLAVES_METADATA = 30;
const MAX_LARGO_STRING_METADATA = 100;
const REGEX_AGENDA_ID = /^[A-Za-z0-9]{1,8}$/;
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTrazabilidadV2Enabled(): boolean {
    return process.env.TRAZABILIDAD_V2_ENABLED === 'true';
}

function enteroPositivoEnv(nombre: string, porDefecto: number, minimo: number): number {
    const valor = Number(process.env[nombre]);
    if (!Number.isFinite(valor) || valor <= 0) return porDefecto;
    return Math.max(minimo, Math.floor(valor));
}

export function flushMs(): number {
    return enteroPositivoEnv('TRAZABILIDAD_FLUSH_MS', 5000, 250);
}

export function maxCola(): number {
    return enteroPositivoEnv('TRAZABILIDAD_MAX_COLA', 5000, 1);
}

function urlBatch(): string | null {
    const base = process.env.API_BACKEND_URL;
    if (!base) return null;
    return `${base.replace(/\/+$/, '')}/stats/batch`;
}

// ---------------------------------------------------------------------------
// Sesión: acceso indirecto (lo registra proactiveSessionManager.ts al cargarse). Así este módulo no
// importa el gestor de sesiones (evita el ciclo trazabilidad → sesiones → apiService → trazabilidad)
// y las pruebas que simulan el gestor de sesiones no se rompen.
// ---------------------------------------------------------------------------

export interface InfoSesionTraza {
    sesionId: string;
    documento?: string;
    ultimoFlujo?: string;
    ultimoPaso?: string;
}

export interface ActualizacionSesionTraza {
    ultimoFlujo?: string;
    ultimoPaso?: string;
    documento?: string;
    finNegocio?: string;
    /** true = la sesión entró a un paso sustantivo no final: un timeout posterior vuelve a ser abandono. */
    limpiarFinNegocio?: boolean;
}

export interface ProveedorSesionTraza {
    /** Sesión ACTIVA del teléfono, o null. */
    obtener(telefono: string): InfoSesionTraza | null;
    actualizar(telefono: string, cambios: ActualizacionSesionTraza): void;
    registrarMensaje(telefono: string): void;
    cerrar(telefono: string, motivo: MotivoFinSesion): void;
    asegurar(telefono: string, disparador: DisparadorSesion): void;
}

let proveedorSesion: ProveedorSesionTraza | null = null;

export function registrarProveedorSesion(proveedor: ProveedorSesionTraza | null): void {
    proveedorSesion = proveedor;
}

export function obtenerSesionTraza(telefono: string | null | undefined): InfoSesionTraza | null {
    if (!telefono || !proveedorSesion) return null;
    try {
        return proveedorSesion.obtener(telefono);
    } catch {
        return null;
    }
}

function actualizarSesionTraza(telefono: string | null | undefined, cambios: ActualizacionSesionTraza): void {
    if (!telefono || !proveedorSesion) return;
    try {
        proveedorSesion.actualizar(telefono, cambios);
    } catch (error) {
        console.warn('[trazabilidad] No se pudo actualizar la sesión:', (error as any)?.message ?? error);
    }
}

/** Suma un mensaje entrante al contador de la sesión activa. */
export function registrarMensajeSesionTraza(telefono: string | null | undefined): void {
    if (!telefono || !proveedorSesion) return;
    try {
        proveedorSesion.registrarMensaje(telefono);
    } catch {
        /* nunca lanza */
    }
}

/**
 * Cierra la sesión con un motivo, SOLO con TRAZABILIDAD_V2_ENABLED=true. Se usa en los cierres que no
 * existían antes de esta funcionalidad (crisis, kill switch, respuestas a campaña), para que con el
 * interruptor apagado el comportamiento externo (conteo de `chat_abandonado`) sea el de siempre.
 */
export function cerrarSesionTraza(telefono: string | null | undefined, motivo: MotivoFinSesion): void {
    if (!isTrazabilidadV2Enabled() || !telefono || !proveedorSesion) return;
    try {
        proveedorSesion.cerrar(telefono, motivo);
    } catch (error) {
        console.warn('[trazabilidad] No se pudo cerrar la sesión:', (error as any)?.message ?? error);
    }
}

/** Abre una sesión si no hay una activa, SOLO con TRAZABILIDAD_V2_ENABLED=true (ver cerrarSesionTraza). */
export function asegurarSesionTraza(telefono: string | null | undefined, disparador: DisparadorSesion): void {
    if (!isTrazabilidadV2Enabled() || !telefono || !proveedorSesion) return;
    try {
        proveedorSesion.asegurar(telefono, disparador);
    } catch (error) {
        console.warn('[trazabilidad] No se pudo abrir la sesión:', (error as any)?.message ?? error);
    }
}

// ---------------------------------------------------------------------------
// Construcción del evento
// ---------------------------------------------------------------------------

/** Aplica las reglas de metadata del contrato (11.1): claves por patrón, máx. 30, solo primitivos, strings ≤ 100. */
export function sanitizarMetadata(metadata: Record<string, unknown> | undefined | null): MetadataEvento | undefined {
    if (!metadata || typeof metadata !== 'object') return undefined;
    const resultado: MetadataEvento = {};
    let claves = 0;
    for (const [clave, valor] of Object.entries(metadata)) {
        if (claves >= MAX_CLAVES_METADATA) break;
        if (!REGEX_CLAVE_METADATA.test(clave)) continue;
        if (valor === undefined) continue;
        if (valor === null || typeof valor === 'boolean') {
            resultado[clave] = valor as boolean | null;
        } else if (typeof valor === 'number') {
            if (!Number.isFinite(valor)) continue;
            resultado[clave] = valor;
        } else if (typeof valor === 'string') {
            resultado[clave] = valor.slice(0, MAX_LARGO_STRING_METADATA);
        } else {
            continue; // objetos y arrays se descartan
        }
        claves++;
    }
    return claves > 0 ? resultado : undefined;
}

function construirEvento(entrada: EventoEntrada): EventoV2 | null {
    const tipo = entrada?.tipo_evento;
    if (typeof tipo !== 'string' || !REGEX_TIPO_EVENTO.test(tipo)) {
        console.warn(`[trazabilidad] tipo_evento inválido, evento descartado: ${String(tipo).slice(0, 60)}`);
        return null;
    }

    const telefono = entrada.telefono === undefined || entrada.telefono === null || entrada.telefono === ''
        ? null
        : String(entrada.telefono);

    let sesionId = entrada.sesion_id;
    let documento = entrada.documento;
    if (sesionId === undefined) {
        const info = obtenerSesionTraza(telefono);
        sesionId = info?.sesionId ?? null;
        if (documento === undefined && info?.documento) documento = info.documento;
    }

    const evento: EventoV2 = {
        evento_uid: entrada.evento_uid && REGEX_UUID.test(entrada.evento_uid) ? entrada.evento_uid : randomUUID(),
        v: 2,
        tipo_evento: tipo,
        ocurrido_at: entrada.ocurrido_at ?? new Date().toISOString(),
        telefono,
    };
    if (sesionId) evento.sesion_id = sesionId;
    if (entrada.flujo) evento.flujo = entrada.flujo;
    if (entrada.paso) evento.paso = entrada.paso;
    if (entrada.resultado) evento.resultado = entrada.resultado;
    if (entrada.origen) evento.origen = entrada.origen;
    if (documento) evento.documento = documento;
    if (entrada.agenda_id !== undefined && entrada.agenda_id !== null && REGEX_AGENDA_ID.test(String(entrada.agenda_id))) {
        evento.agenda_id = String(entrada.agenda_id);
    }
    if (typeof entrada.cita_id_externa === 'number' && Number.isFinite(entrada.cita_id_externa)) {
        evento.cita_id_externa = entrada.cita_id_externa;
    }
    if (entrada.campana) evento.campana = entrada.campana;
    if (entrada.campana_ejecucion_id) evento.campana_ejecucion_id = entrada.campana_ejecucion_id;
    if (entrada.wa_message_id) evento.wa_message_id = entrada.wa_message_id;
    if (typeof entrada.duracion_ms === 'number' && Number.isFinite(entrada.duracion_ms)) {
        evento.duracion_ms = Math.max(0, Math.round(entrada.duracion_ms));
    }
    const metadata = sanitizarMetadata(entrada.metadata);
    if (metadata) evento.metadata = metadata;
    return evento;
}

/**
 * Registra un evento de trazabilidad. Síncrono, nunca lanza. Con TRAZABILIDAD_V2_ENABLED distinto de
 * 'true' no hace nada.
 */
export function trackEvento(entrada: EventoEntrada): void {
    try {
        if (!isTrazabilidadV2Enabled()) return;
        const evento = construirEvento(entrada);
        if (!evento) return;
        encolar(evento);
    } catch (error) {
        console.warn('[trazabilidad] Evento descartado por error inesperado:', (error as any)?.message ?? error);
    }
}

/**
 * Evento legado (`chat_*`, `campahna_*`, `recuperacion_*`, etc.) enviado por la cola V2: mismo
 * `tipo_evento`, misma metadata e `id_usuario` = el identificador de siempre (teléfono o pseudo-usuario
 * `EJECUCION_*`). Los envíos de campaña no se asocian a la sesión del paciente (no son parte de su
 * conversación); las respuestas `estado='confirmado'` sí.
 */
export function trackEventoLegado(
    tipoEvento: string,
    idUsuario: string | null | undefined,
    metadata: Record<string, unknown>,
    extra?: Omit<EventoEntrada, 'tipo_evento' | 'telefono' | 'metadata'>
): void {
    const esEnvioCampana = /^campahna_/.test(tipoEvento) && metadata?.estado !== 'confirmado';
    trackEvento({
        ...(esEnvioCampana ? { sesion_id: null } : {}),
        ...(extra ?? {}),
        tipo_evento: tipoEvento,
        telefono: idUsuario ?? null,
        metadata,
    });
}

// ---------------------------------------------------------------------------
// Atajos
// ---------------------------------------------------------------------------

type OrigenTelefono = string | null | undefined | { from?: string | null };

function telefonoDe(origen: OrigenTelefono): string | null {
    if (origen && typeof origen === 'object') return origen.from ? String(origen.from) : null;
    return origen ? String(origen) : null;
}

/**
 * Flujo que va en el evento: el explícito si se pasa; si no, el del catálogo; para los pasos `comun.*`
 * (y 'comun' en general) el flujo en curso de la sesión ('cancelar' o 'reprogramar').
 */
export function flujoDeEvento(paso: string, telefono: string | null, flujoExplicito?: string | null): string | null {
    if (flujoExplicito) return flujoExplicito;
    const definicion = obtenerPaso(paso);
    if (!definicion) return null;
    if (definicion.flujo !== 'comun') return definicion.flujo;
    const enCurso = obtenerSesionTraza(telefono)?.ultimoFlujo;
    return enCurso && enCurso !== 'comun' ? enCurso : null;
}

/** Traduce `state.flujoSeleccionadoMenu` de los pasos comunes al flujo del catálogo. */
export function flujoDesdeSeleccionMenu(flujoSeleccionadoMenu: unknown): string | undefined {
    if (flujoSeleccionadoMenu === 'cancelarCita') return 'cancelar';
    if (flujoSeleccionadoMenu === 'reprogramarCita') return 'reprogramar';
    return undefined;
}

/** Flujos de navegación: pasar por ellos no cambia si la sesión ya tuvo un final de negocio. */
const FLUJOS_NAVEGACION = new Set(['inicio', 'politicas', 'menu', 'comun', 'legado']);

/** `flujo_paso`: el paciente llegó a un paso del catálogo. Actualiza último flujo/paso de la sesión. */
export function trackPaso(
    origen: OrigenTelefono,
    paso: PasoId,
    resultado: ResultadoPaso = 'mostrado',
    opciones?: { flujo?: string; metadata?: Record<string, unknown> }
): void {
    try {
        const telefono = telefonoDe(origen);
        const flujo = flujoDeEvento(paso, telefono, opciones?.flujo);
        const definicion = obtenerPaso(paso);
        const reabreSesion = !!definicion && !definicion.es_final && !FLUJOS_NAVEGACION.has(definicion.flujo);
        actualizarSesionTraza(telefono, {
            ...(flujo ? { ultimoFlujo: flujo } : {}),
            ultimoPaso: paso,
            ...(reabreSesion ? { limpiarFinNegocio: true } : {}),
        });
        trackEvento({
            tipo_evento: 'flujo_paso',
            telefono,
            flujo,
            paso,
            resultado,
            origen: 'bot',
            metadata: opciones?.metadata,
        });
    } catch {
        /* nunca lanza */
    }
}

/** `msg_no_entendido`: opción inválida dentro de un paso. NUNCA lleva el texto del paciente (P7). */
export function trackNoEntendido(
    origen: OrigenTelefono,
    paso: PasoId | string | null | undefined,
    intento: number = 1,
    opciones?: { flujo?: string; contexto?: string }
): void {
    try {
        const telefono = telefonoDe(origen);
        const flujo = paso ? flujoDeEvento(paso, telefono, opciones?.flujo) : opciones?.flujo ?? null;
        trackEvento({
            tipo_evento: 'msg_no_entendido',
            telefono,
            flujo,
            paso: paso ?? null,
            origen: 'usuario',
            metadata: { intento, ...(opciones?.contexto ? { contexto: opciones.contexto } : {}) },
        });
    } catch {
        /* nunca lanza */
    }
}

/** `flujo_fin`: final de negocio. Marca la sesión como "con final de negocio" (ver sesión, timeout). */
export function trackFin(
    origen: OrigenTelefono,
    flujo: string,
    resultado: ResultadoFin,
    opciones?: { citaIdExterna?: unknown; agendaId?: unknown; paso?: PasoId; metadata?: Record<string, unknown> }
): void {
    try {
        const telefono = telefonoDe(origen);
        const citaId = Number(opciones?.citaIdExterna);
        actualizarSesionTraza(telefono, { finNegocio: resultado });
        trackEvento({
            tipo_evento: 'flujo_fin',
            telefono,
            flujo,
            paso: opciones?.paso ?? null,
            resultado,
            origen: 'bot',
            ...(opciones?.citaIdExterna !== undefined && opciones?.citaIdExterna !== null && Number.isFinite(citaId)
                ? { cita_id_externa: citaId }
                : {}),
            ...(typeof opciones?.agendaId === 'string' ? { agenda_id: opciones.agendaId } : {}),
            metadata: opciones?.metadata,
        });
    } catch {
        /* nunca lanza */
    }
}

/** Normaliza un documento: solo se acepta si cumple el formato de documento del bot (alfanumérico 5-20). */
export function normalizarDocumentoTraza(documento: unknown): string | null {
    const limpio = sanitizeString(typeof documento === 'string' ? documento : String(documento ?? ''), 20);
    return isValidDocumentNumber(limpio) ? limpio : null;
}

/**
 * `identificacion`: el paciente dio su documento. El documento se guarda en la sesión para que lo
 * hereden los eventos siguientes (P1). Si el valor no tiene forma de documento no se registra nada
 * (así nunca viaja texto libre por este camino).
 */
export function trackIdentificacion(
    origen: OrigenTelefono,
    documento: unknown,
    resultado: ResultadoIdentificacion,
    paso: PasoId,
    opciones?: { flujo?: string }
): void {
    try {
        const telefono = telefonoDe(origen);
        const doc = normalizarDocumentoTraza(documento);
        if (!doc) return;
        actualizarSesionTraza(telefono, { documento: doc });
        trackEvento({
            tipo_evento: 'identificacion',
            telefono,
            documento: doc,
            flujo: flujoDeEvento(paso, telefono, opciones?.flujo),
            paso,
            resultado,
            origen: 'usuario',
        });
    } catch {
        /* nunca lanza */
    }
}

// Fallos del backend: apiService anota el último fallo por endpoint (status HTTP y `cause`), y el flujo,
// que sí conoce teléfono/flujo/paso, lo convierte en `backend_error`. Se consume una sola vez.
const fallosBackend = new Map<string, { httpStatus: number | null; cause: string | null; at: number }>();

/** Lo llama apiService en sus `catch`. Solo guarda status y `cause` (nunca el body ni datos personales). */
export function registrarFalloBackend(endpoint: string, error: any): void {
    try {
        const httpStatus = typeof error?.response?.status === 'number' ? error.response.status : null;
        const causeRaw = error?.response?.data?.cause ?? error?.code ?? null;
        const cause = typeof causeRaw === 'string' ? causeRaw.slice(0, 60) : null;
        fallosBackend.set(endpoint, { httpStatus, cause, at: Date.now() });
    } catch {
        /* nunca lanza */
    }
}

function tomarFalloBackend(endpoint: string): { httpStatus: number | null; cause: string | null } | null {
    const fallo = fallosBackend.get(endpoint);
    if (!fallo) return null;
    fallosBackend.delete(endpoint);
    if (Date.now() - fallo.at > FALLO_BACKEND_TTL_MS) return null;
    return { httpStatus: fallo.httpStatus, cause: fallo.cause };
}

/**
 * `backend_error` visto por el bot. `endpoint` es el path sin query (p. ej. '/chatbot/agendar').
 * Por defecto solo se emite si apiService anotó un fallo reciente de ese endpoint (así un "no
 * encontrado" legítimo no se cuenta como error). Con `siempre: true` se emite igual (para llamadas
 * cuyo null/false solo puede significar error).
 */
export function trackErrorBackend(
    origen: OrigenTelefono,
    paso: PasoId | null,
    endpoint: string,
    opciones?: { siempre?: boolean; flujo?: string; cause?: string; httpStatus?: number | null }
): void {
    try {
        const fallo = tomarFalloBackend(endpoint);
        if (!fallo && !opciones?.siempre) return;
        const telefono = telefonoDe(origen);
        trackEvento({
            tipo_evento: 'backend_error',
            telefono,
            flujo: paso ? flujoDeEvento(paso, telefono, opciones?.flujo) : opciones?.flujo ?? null,
            paso,
            origen: 'bot',
            metadata: {
                endpoint,
                http_status: opciones?.httpStatus ?? fallo?.httpStatus ?? null,
                cause: opciones?.cause ?? fallo?.cause ?? null,
            },
        });
    } catch {
        /* nunca lanza */
    }
}

/**
 * `campana_respuesta`: respuesta ESPERADA a una campaña (botón o palabra del flujo de respuesta, tabla
 * de 11.2). Se emite una sola vez, al entrar al flujo y antes de pedir el documento. Es lo único que
 * marca un envío como respondido (P2). Abre sesión 'respuesta_plantilla' si no hay una activa.
 */
export function trackRespuestaCampana(
    origen: OrigenTelefono,
    campana: CampanaTraza | null,
    resultado: ResultadoRespuestaCampana,
    paso: PasoId
): void {
    try {
        const telefono = telefonoDe(origen);
        asegurarSesionTraza(telefono, 'respuesta_plantilla');
        const flujo = flujoDeEvento(paso, telefono);
        trackEvento({
            tipo_evento: 'campana_respuesta',
            telefono,
            campana,
            resultado,
            flujo,
            paso,
            origen: 'usuario',
        });
        trackPaso(telefono, paso, 'mostrado');
    } catch {
        /* nunca lanza */
    }
}

/**
 * Igual que `trackRespuestaCampana`, pero para flujos que se re-invocan a sí mismos con `gotoFlow`
 * cuando el documento es inválido: si `state[claveReintento]` es true, es un reintento (no una
 * respuesta nueva) y solo se limpia la marca. El flujo pone la marca antes de su `gotoFlow`.
 */
export async function trackRespuestaCampanaUnaVez(
    origen: OrigenTelefono,
    state: any,
    claveReintento: string,
    campana: CampanaTraza | null,
    resultado: ResultadoRespuestaCampana,
    paso: PasoId
): Promise<void> {
    try {
        if (state?.getMyState?.()?.[claveReintento]) {
            await state.update({ [claveReintento]: false });
            return;
        }
        trackRespuestaCampana(origen, campana, resultado, paso);
    } catch {
        /* nunca lanza */
    }
}

// ---------------------------------------------------------------------------
// Campañas y envíos salientes
// ---------------------------------------------------------------------------

/** Emite `campana_ejecucion{inicio}` y devuelve el `campana_ejecucion_id` de la corrida. */
export function iniciarEjecucionCampana(campana: CampanaTraza, origenEjecucion?: string): string {
    const id = randomUUID();
    trackEvento({
        tipo_evento: 'campana_ejecucion',
        telefono: null,
        sesion_id: null,
        campana,
        campana_ejecucion_id: id,
        resultado: 'inicio',
        origen: 'campana',
        metadata: { origen: origenEjecucion ?? null },
    });
    return id;
}

/** Emite `campana_ejecucion{fin}` con los conteos de la corrida. */
export function finalizarEjecucionCampana(
    campana: CampanaTraza,
    campanaEjecucionId: string,
    conteos: { total: number; exitosos: number; errores: number; origen?: string }
): void {
    trackEvento({
        tipo_evento: 'campana_ejecucion',
        telefono: null,
        sesion_id: null,
        campana,
        campana_ejecucion_id: campanaEjecucionId,
        resultado: 'fin',
        origen: 'campana',
        metadata: {
            total: conteos.total,
            exitosos: conteos.exitosos,
            errores: conteos.errores,
            origen: conteos.origen ?? null,
        },
    });
}

/**
 * `wa_envio`: cada plantilla o texto saliente enviado directo a Graph API. `agendaId` es el id interno
 * de la cita (`cita.cita_id` de las campañas, que el backend llena con `agenda.agenda_id`, NO con el id
 * de Globho): va en el campo de primer nivel `agenda_id` (contrato revisado), no en `cita_id_externa`.
 */
export function trackEnvioWhatsApp(params: {
    telefono: string | null | undefined;
    campana: CampanaTraza;
    campanaEjecucionId?: string;
    plantilla?: string | null;
    tipoEnvio: 'plantilla' | 'texto';
    resultado: ResultadoEnvioMeta;
    agendaId?: string | null;
    citaIdExterna?: number | null;
}): void {
    try {
        trackEvento({
            tipo_evento: 'wa_envio',
            telefono: params.telefono ?? null,
            sesion_id: null,
            campana: params.campana,
            campana_ejecucion_id: params.campanaEjecucionId ?? null,
            wa_message_id: params.resultado.mensajeWaId ?? null,
            resultado: params.resultado.exito ? 'aceptado' : 'rechazado_api',
            origen: 'campana',
            ...(typeof params.citaIdExterna === 'number' ? { cita_id_externa: params.citaIdExterna } : {}),
            ...(params.agendaId ? { agenda_id: String(params.agendaId) } : {}),
            metadata: {
                plantilla: params.plantilla ?? null,
                tipo_envio: params.tipoEnvio,
                error_code: params.resultado.errorCode ?? null,
                error_titulo: params.resultado.errorTitulo ?? null,
            },
        });
    } catch {
        /* nunca lanza */
    }
}

// ---------------------------------------------------------------------------
// UUID v5 (RFC 4122, SHA-1) para `wa_estado`: el mismo webhook reenviado por Meta produce el mismo
// `evento_uid` y el backend lo cuenta como duplicado.
// ---------------------------------------------------------------------------

/** Namespace URL de RFC 4122 (contrato 11.2). */
export const NAMESPACE_WA_ESTADO = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

export function uuidV5(nombre: string, namespace: string = NAMESPACE_WA_ESTADO): string {
    const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
    if (ns.length !== 16) throw new Error('namespace UUID inválido');
    const hash = createHash('sha1').update(ns).update(Buffer.from(nombre, 'utf8')).digest();
    const bytes = Buffer.from(hash.subarray(0, 16));
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// ---------------------------------------------------------------------------
// Cola, envío por lotes, backoff y spool
// ---------------------------------------------------------------------------

let cola: EventoV2[] = [];
let loteEnVuelo: EventoV2[] | null = null;
let fallosConsecutivos = 0;
let noAntesDe = 0;
let intervalo: NodeJS.Timeout | null = null;
let rutaSpool = path.join(__dirname, 'trazabilidadSpool.jsonl');

function asegurarIntervalo(): void {
    if (intervalo) return;
    intervalo = setInterval(() => {
        flushTrazabilidad().catch(() => undefined);
    }, flushMs());
    // No mantiene vivo el proceso por sí solo (ni a Jest).
    if (typeof intervalo.unref === 'function') intervalo.unref();
}

function encolar(evento: EventoV2): void {
    cola.push(evento);
    asegurarIntervalo();
    if (cola.length > maxCola()) {
        volcarColaASpool();
        return;
    }
    if (cola.length >= TAMANO_FLUSH) {
        flushTrazabilidad().catch(() => undefined);
    }
}

function backoffMs(fallos: number): number {
    return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, fallos - 1));
}

type ResultadoLote = 'ok' | 'reintentar' | 'descartar';

async function enviarLote(url: string, lote: EventoV2[]): Promise<ResultadoLote> {
    try {
        // Sin headers de autenticación (decisión P3 de German).
        const response = await axios.post(url, { eventos: lote }, { timeout: TIMEOUT_HTTP_MS });
        const rechazados = response?.data?.data?.rechazados;
        if (Array.isArray(rechazados) && rechazados.length > 0) {
            const motivos = rechazados.slice(0, 5).map((r: any) => `${r?.evento_uid}:${r?.motivo}`).join(', ');
            console.warn(`[trazabilidad] El backend rechazó ${rechazados.length} evento(s) del lote: ${motivos}`);
        }
        return 'ok';
    } catch (error: any) {
        const status: number | undefined = error?.response?.status;
        if (status === 400 || status === 413) {
            // El body no cumple el contrato: reintentarlo no lo arregla. Se descarta con aviso.
            console.error(`[trazabilidad] Lote de ${lote.length} evento(s) descartado: el backend respondió ${status}.`);
            return 'descartar';
        }
        // 5xx, 404 (backend sin el endpoint todavía), 429, red o timeout: se reintenta el lote entero
        // (el backend es idempotente por evento_uid).
        console.warn(`[trazabilidad] Falló el envío del lote (${status ?? error?.code ?? 'sin respuesta'}); se reintenta con backoff.`);
        return 'reintentar';
    }
}

/**
 * Envía la cola por lotes de hasta 100 eventos. Un solo envío a la vez. Respeta el backoff tras un
 * fallo. Nunca lanza.
 */
export async function flushTrazabilidad(): Promise<void> {
    try {
        if (loteEnVuelo) return;
        if (Date.now() < noAntesDe) return;
        const url = urlBatch();
        if (!url) return;
        while (cola.length > 0) {
            const lote = cola.splice(0, MAX_EVENTOS_POR_LOTE);
            loteEnVuelo = lote;
            let resultado: ResultadoLote;
            try {
                resultado = await enviarLote(url, lote);
            } finally {
                loteEnVuelo = null;
            }
            if (resultado === 'reintentar') {
                cola.unshift(...lote);
                fallosConsecutivos++;
                noAntesDe = Date.now() + backoffMs(fallosConsecutivos);
                if (cola.length > maxCola()) volcarColaASpool();
                return;
            }
            fallosConsecutivos = 0;
            noAntesDe = 0;
        }
        // Backend disponible y cola vacía: si quedó algo en el spool (caída anterior), se retoma.
        if (hayEventosEnSpool()) reenviarSpool();
    } catch (error) {
        loteEnVuelo = null;
        console.warn('[trazabilidad] Error inesperado en flush:', (error as any)?.message ?? error);
    }
}

function escribirEnSpool(eventos: EventoV2[]): void {
    if (eventos.length === 0) return;
    fs.appendFileSync(rutaSpool, eventos.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf-8');
}

function volcarColaASpool(): void {
    const pendientes = cola;
    cola = [];
    try {
        escribirEnSpool(pendientes);
        console.warn(`[trazabilidad] ${pendientes.length} evento(s) pasados al spool (${path.basename(rutaSpool)}).`);
    } catch (error) {
        // Sin disco: se conservan en memoria los más recientes hasta el tope (se pierden los más viejos).
        cola = pendientes.slice(-maxCola());
        console.error('[trazabilidad] No se pudo escribir el spool:', (error as any)?.message ?? error);
    }
}

function hayEventosEnSpool(): boolean {
    try {
        return fs.existsSync(rutaSpool) && fs.statSync(rutaSpool).size > 0;
    } catch {
        return false;
    }
}

function esEventoV2(valor: any): valor is EventoV2 {
    return !!valor
        && typeof valor === 'object'
        && valor.v === 2
        && typeof valor.evento_uid === 'string'
        && REGEX_UUID.test(valor.evento_uid)
        && typeof valor.tipo_evento === 'string'
        && REGEX_TIPO_EVENTO.test(valor.tipo_evento)
        && typeof valor.ocurrido_at === 'string';
}

/**
 * Pasa el spool a la cola (hasta el tope; el resto vuelve al spool) y borra el archivo. Devuelve cuántos
 * eventos se encolaron. Nunca lanza.
 */
export function reenviarSpool(): number {
    try {
        if (!hayEventosEnSpool()) return 0;
        const contenido = fs.readFileSync(rutaSpool, 'utf-8');
        fs.unlinkSync(rutaSpool);
        const eventos: EventoV2[] = [];
        for (const linea of contenido.split('\n')) {
            if (!linea.trim()) continue;
            try {
                const valor = JSON.parse(linea);
                if (esEventoV2(valor)) eventos.push(valor);
            } catch {
                /* línea corrupta (p. ej. apagado a mitad de escritura): se descarta */
            }
        }
        const cupo = Math.max(0, maxCola() - cola.length);
        const aCola = eventos.slice(0, cupo);
        const resto = eventos.slice(cupo);
        cola.push(...aCola);
        if (resto.length > 0) escribirEnSpool(resto);
        if (aCola.length > 0) asegurarIntervalo();
        return aCola.length;
    } catch (error) {
        console.error('[trazabilidad] No se pudo leer el spool:', (error as any)?.message ?? error);
        return 0;
    }
}

/** Escribe en el spool, de forma síncrona, todo lo pendiente (incluido el lote en vuelo). */
export function volcarPendientesAlApagar(): number {
    try {
        const pendientes = [...(loteEnVuelo ?? []), ...cola];
        cola = [];
        escribirEnSpool(pendientes);
        return pendientes.length;
    } catch (error) {
        console.error('[trazabilidad] No se pudo volcar la cola al apagar:', (error as any)?.message ?? error);
        return 0;
    }
}

let apagadoRegistrado = false;

/**
 * Registra el volcado de la cola al spool en SIGTERM/SIGINT (lo que manda PM2 al reiniciar). Después
 * de volcar se re-emite la misma señal, así el proceso termina exactamente como terminaba antes.
 */
export function registrarFlushAlApagar(): void {
    if (apagadoRegistrado) return;
    apagadoRegistrado = true;
    for (const senal of ['SIGTERM', 'SIGINT'] as const) {
        process.once(senal, () => {
            const volcados = volcarPendientesAlApagar();
            if (volcados > 0) console.log(`[trazabilidad] ${volcados} evento(s) guardados en el spool antes de apagar (${senal}).`);
            process.kill(process.pid, senal);
        });
    }
}

/**
 * Arranque (app.ts): con TRAZABILIDAD_V2_ENABLED=true reenvía el spool de una ejecución anterior,
 * arranca el intervalo de flush y registra el volcado al apagar. Apagado, no hace nada.
 */
export function iniciarTrazabilidad(): void {
    if (!isTrazabilidadV2Enabled()) {
        console.log('[trazabilidad] TRAZABILIDAD_V2_ENABLED != true: solo se registran los eventos legados (POST /stats).');
        return;
    }
    const recuperados = reenviarSpool();
    asegurarIntervalo();
    registrarFlushAlApagar();
    console.log(`[trazabilidad] Activa (lotes a /stats/batch cada ${flushMs()} ms). Eventos recuperados del spool: ${recuperados}.`);
}

// ---------------------------------------------------------------------------
// Solo para pruebas
// ---------------------------------------------------------------------------

export function _estadoParaPruebas() {
    return { cola: [...cola], enVuelo: loteEnVuelo, fallosConsecutivos, noAntesDe, rutaSpool };
}

export function _resetParaPruebas(opciones?: { rutaSpool?: string }): void {
    cola = [];
    loteEnVuelo = null;
    fallosConsecutivos = 0;
    noAntesDe = 0;
    fallosBackend.clear();
    if (intervalo) clearInterval(intervalo);
    intervalo = null;
    if (opciones?.rutaSpool) rutaSpool = opciones.rutaSpool;
}
