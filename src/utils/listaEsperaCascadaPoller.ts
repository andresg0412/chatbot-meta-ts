// Poller de la cascada de ofertas de cupo — Fase 2 de "lista de espera inteligente".
// Ver proyecto-ips/docs/features/2026-09-07-lista-espera-inteligente.md, secciones 13.4-a y 13.7, y
// proyecto-ips/docs/features/2026-09-26-lista-espera-runbook-produccion.md (B3, B6, B7, B9).
//
// Modelo "tick" (no push backend→bot, ver 13.4-a): este módulo sondea
// `POST /chatbot/listaespera/cascada/tick` cada `LISTA_ESPERA_CASCADA_POLL_INTERVAL_MS` (default 60s)
// y ejecuta la mensajería de WhatsApp que el backend le indique en cada acción devuelta. También
// expone `triggerCascadaTickNow()` para el "path rápido": una llamada inmediata y fire-and-forget
// disparada por los propios flujos de cancelar/reprogramar cita del bot justo después de que la
// llamada al backend haya respondido exitosamente (criterio de aceptación "cupo liberado por bot en
// menos de 30 segundos", sin depender del intervalo de 60s).

import {
    tickCascadaListaEspera,
    enviarPlantillaOfertaCupo,
    confirmarEnvioOfertaCupo,
    marcarFalloOfertaCupo,
    confirmarEscalamientoListaEspera,
} from '../services/apiService';
import { AccionCascada, AccionOfertar, AccionEscalar, AccionNotificarPausa } from '../interfaces/ICascadaListaEspera';
import { isCascadaEnabled, esTelefonoPiloto, hayListaPiloto } from './listaEsperaFlags';
import { normalizarTelefonoWhatsApp, enmascararTelefono } from './telefono';
import { formatearFechaLarga, formatearHoraHHMM, instanteBogota } from './fechaHora';
import { enviarAvisoAsesor } from './avisoAsesor';

const DEFAULT_POLL_INTERVAL_MS = 60000;

type SendRawMessage = (to: string, message: string) => Promise<any>;

let pollerStarted = false;
let cachedSendRaw: SendRawMessage | null = null;

/**
 * Modo observación (LISTA_ESPERA_CASCADA_ENABLED != 'true', default): el poller sigue llamando al
 * tick (para no perder visibilidad) pero NO envía nada por WhatsApp — ni la plantilla de oferta, ni el
 * aviso de escalamiento al asesor, ni el aviso de pausa al paciente (runbook B3) — y tampoco llama a
 * confirmar-envio / marcar-fallo / escalar/confirmar, para no dejar en el backend constancia de envíos
 * que no se hicieron. Efecto en el backend de no confirmar:
 * - 'ofertar': la oferta sigue 'en_cola' y el cupo 'en_oferta'; se vuelve a proponer en cada tick
 *   (hasta que la antelación baja de 1h y el propio backend escala el cupo).
 * - 'escalar': el cupo queda 'escalado' sin evento 'escalamiento_notificado', así que cada tick lo
 *   vuelve a devolver; al encender el interruptor se envía (y confirma) en el primer tick. Si para
 *   entonces el cupo ya pasó, el aviso lo indica como informativo.
 * - 'notificar_pausa': el backend ya pausó la inscripción y no vuelve a emitir la acción; en modo
 *   observación el aviso se pierde (en la práctica no ocurre: sin ofertas enviadas no hay expiraciones
 *   que lleven a una pausa).
 * Para no inundar el log cada 60s, cada acción observada se loguea una sola vez por proceso.
 * Ver docs/features/2026-09-07-lista-espera-inteligente.md, sección 13.8.
 */
const accionesObservadasLogueadas = new Set<string>();

function logObservacionUnaVez(clave: string, mensaje: string): void {
    if (accionesObservadasLogueadas.has(clave)) return;
    accionesObservadasLogueadas.add(clave);
    console.log(`[listaEsperaCascadaPoller] (LISTA_ESPERA_CASCADA_ENABLED != 'true', modo observación) ${mensaje}`);
}

async function procesarAccionOfertar(accion: AccionOfertar): Promise<void> {
    // Runbook B9: en logs, teléfono enmascarado y sin nombre del paciente.
    const telefonoLog = enmascararTelefono(accion.telefono_paciente);
    const descripcion =
        `cupo ${accion.cupo_liberado_id} -> lista_espera ${accion.lista_espera_id} (paciente ${accion.paciente_id}, ` +
        `tel ${telefonoLog}) para el ${accion.fecha_cita} ${formatearHoraHHMM(accion.hora_cita)} ` +
        `(nivel de cascada ${accion.nivel_cascada_origen}, ventana ${accion.ventana_respuesta_segundos}s)`;

    if (!isCascadaEnabled()) {
        logObservacionUnaVez(
            `ofertar:${accion.cupo_liberado_id}:${accion.lista_espera_id}`,
            `Acción 'ofertar' pendiente: ${descripcion}. No se envió ninguna plantilla ni se llamó a confirmar-envio/marcar-fallo.`
        );
        return;
    }

    // El backend puede mandar el teléfono ya normalizado (57XXXXXXXXXX), con 10 dígitos, con espacios/+,
    // o null/vacío si no es contactable. Se normaliza aquí; si no hay número utilizable no se envía y se
    // marca fallo para que la cascada avance al siguiente candidato (no penaliza al paciente).
    const telefonoDestino = normalizarTelefonoWhatsApp(accion.telefono_paciente);
    if (!telefonoDestino) {
        console.warn(`[listaEsperaCascadaPoller] Oferta no enviada: teléfono no contactable. ${descripcion}. Se marca fallo 'telefono_no_contactable'.`);
        await marcarFalloOfertaCupo(accion.cupo_liberado_id, accion.lista_espera_id, 'telefono_no_contactable');
        return;
    }

    // Runbook B7: con lista piloto, solo los números piloto reciben ofertas. Para el resto se llama a
    // marcar-fallo: el backend deja esa oferta en 'error' (solo para ESTE cupo), registra el evento
    // 'oferta_fallo_envio' con el motivo, no penaliza al paciente (no cuenta como "sin respuesta" ni
    // cambia su inscripción, que sigue 'activa') y el siguiente tick ofrece al siguiente de la fila o
    // escala el cupo ('fila_agotada'). Así la cascada no queda bloqueada esperando una oferta que
    // nunca se va a enviar. Ver proyecto-ips/backend CupoLiberadoService.marcarFalloEnvio().
    if (!esTelefonoPiloto(telefonoDestino)) {
        console.log(`[listaEsperaCascadaPoller] Oferta no enviada: número fuera de LISTA_ESPERA_TELEFONOS_PILOTO. ${descripcion}. Se marca fallo 'fuera_de_piloto'.`);
        await marcarFalloOfertaCupo(accion.cupo_liberado_id, accion.lista_espera_id, 'fuera_de_piloto');
        return;
    }

    // Ajuste 1 (ventana escalonada, docs/features/2026-09-28-ajustes-lista-espera.md 1.5.6-3): la
    // ventana es variable (900/600/420 s por defecto) y va en {{5}} de la plantilla. Si no es un entero
    // finito > 0 (backend viejo o dato corrupto) no se envía, para no mostrar "undefined minutos" al
    // paciente; se marca fallo para que la cascada no quede bloqueada.
    const ventanaSegundos = accion.ventana_respuesta_segundos;
    if (typeof ventanaSegundos !== 'number' || !Number.isInteger(ventanaSegundos) || ventanaSegundos <= 0) {
        console.warn(`[listaEsperaCascadaPoller] Oferta no enviada: ventana_respuesta_segundos inválida. ${descripcion}. Se marca fallo 'ventana_invalida'.`);
        await marcarFalloOfertaCupo(accion.cupo_liberado_id, accion.lista_espera_id, 'ventana_invalida');
        return;
    }
    const minutosVentana = Math.round(ventanaSegundos / 60);

    try {
        const resultado = await enviarPlantillaOfertaCupo(
            accion.nombre_paciente,
            telefonoDestino,
            accion.profesional,
            accion.fecha_cita,
            accion.hora_cita,
            minutosVentana
        );

        if (resultado.exito) {
            // Eco de la misma ventana (en segundos) cuyo equivalente en minutos se puso en {{5}}.
            const confirmado = await confirmarEnvioOfertaCupo(
                accion.cupo_liberado_id,
                accion.lista_espera_id,
                resultado.mensajeWaId,
                ventanaSegundos
            );
            if (!confirmado) {
                // Corrección R1/R2 (docs/features/2026-09-28-ajustes-lista-espera.md 1.13): confirmar-envio
                // no es reintentable. Ante un 409 el backend ya anuló la oferta (o era un duplicado); no se
                // reintenta ni se llama a marcar-fallo, porque la plantilla ya salió. El `cause` lo
                // registra confirmarEnvioOfertaCupo().
                console.error(
                    `[listaEsperaCascadaPoller] La plantilla de oferta se envió pero confirmar-envio no se ` +
                    `pudo confirmar para cupo ${accion.cupo_liberado_id}/lista_espera ${accion.lista_espera_id}. ` +
                    `No se reintenta ni se marca fallo (ver cause en el log de confirmar-envio).`
                );
            }
        } else {
            await marcarFalloOfertaCupo(accion.cupo_liberado_id, accion.lista_espera_id, 'envio_meta_fallido');
        }
    } catch (error: any) {
        console.error(`[listaEsperaCascadaPoller] Error inesperado procesando oferta del cupo ${accion.cupo_liberado_id}:`, error?.message ?? error);
        try {
            await marcarFalloOfertaCupo(accion.cupo_liberado_id, accion.lista_espera_id, 'excepcion_bot');
        } catch (error2: any) {
            console.error('[listaEsperaCascadaPoller] Error adicional marcando fallo de oferta tras excepción:', error2?.message ?? error2);
        }
    }
}

/**
 * Etiquetas legibles para recepción de los motivos de la acción 'escalar' (Ajuste 1,
 * docs/features/2026-09-28-ajustes-lista-espera.md 1.5.6-5). Sin mencionar especialidad (regla 9.1).
 * Un motivo que no esté aquí se muestra con su código tal cual.
 */
export const ETIQUETAS_MOTIVO_ESCALAMIENTO: Readonly<Record<string, string>> = {
    antelacion_critica:
        'Faltan 2 horas o menos para el cupo; no se ofreció automáticamente. Gestionar por llamada.',
    fuera_de_horario_antelacion_critica:
        'Cupo liberado fuera del horario de contacto y al abrir el horario quedarían 2 horas o menos; no se ofreció automáticamente.',
    fila_agotada: 'Ningún candidato de la lista de espera aceptó el cupo.',
    sin_candidatos: 'No hay pacientes en lista de espera elegibles para este cupo.',
    cascada_maxima: 'Se alcanzó el máximo de movimientos encadenados (3 niveles).',
};

const DOS_HORAS_MS = 2 * 60 * 60 * 1000;

function describirMotivoEscalamiento(motivo: string): string {
    const etiqueta = Object.prototype.hasOwnProperty.call(ETIQUETAS_MOTIVO_ESCALAMIENTO, motivo)
        ? ETIQUETAS_MOTIVO_ESCALAMIENTO[motivo]
        : undefined;
    return etiqueta ? `${etiqueta} (${motivo})` : `${motivo}`;
}

export function construirMensajeEscalamiento(accion: AccionEscalar): string {
    const instante = instanteBogota(accion.fecha_cita, accion.hora_cita);
    const ahora = Date.now();
    const vencido = instante !== null && instante <= ahora;
    const urgente = instante !== null && !vencido && instante - ahora <= DOS_HORAS_MS;
    const fecha = formatearFechaLarga(accion.fecha_cita) || accion.fecha_cita;
    return (
        (urgente ? '🚨 URGENTE: el cupo es en menos de 2 horas\n' : '') +
        (vencido ? 'ℹ️ (Informativo: la fecha y hora de este cupo ya pasaron)\n' : '') +
        '⚠️ Cupo de lista de espera sin asignar — requiere gestión manual de recepción\n' +
        `Profesional: ${accion.profesional}\n` +
        `Fecha y hora del cupo: ${fecha} ${formatearHoraHHMM(accion.hora_cita)}\n` +
        `Motivo: ${describirMotivoEscalamiento(accion.motivo)}\n` +
        `Candidatos contactados: ${accion.candidatos_contactados}\n` +
        `Respuestas — Aceptaron: ${accion.resumen_respuestas?.aceptaron ?? 0}, ` +
        `Rechazaron: ${accion.resumen_respuestas?.rechazaron ?? 0}, ` +
        `Sin respuesta: ${accion.resumen_respuestas?.sin_respuesta ?? 0}\n` +
        `Cupo liberado ID: ${accion.cupo_liberado_id}`
    );
}

async function procesarAccionEscalar(accion: AccionEscalar): Promise<void> {
    if (!isCascadaEnabled()) {
        // Runbook B3: en modo observación no se avisa al asesor ni se confirma el escalamiento.
        logObservacionUnaVez(
            `escalar:${accion.cupo_liberado_id}`,
            `Acción 'escalar' pendiente: cupo ${accion.cupo_liberado_id} (${accion.fecha_cita} ` +
            `${formatearHoraHHMM(accion.hora_cita)}, motivo ${accion.motivo}). No se avisó al asesor ni se llamó a escalar/confirmar.`
        );
        return;
    }

    const canalEscalamiento = process.env.CANAL_ESCALAMIENTO_LISTA_ESPERA;
    // Runbook B6: un aviso no entregado (canal vacío, error de Graph API o webhook 'failed', p. ej.
    // ventana de 24h cerrada) queda registrado en chat_stats como 'aviso_asesor_fallido'. Respecto del
    // backend se mantiene el comportamiento de siempre: se confirma el escalamiento tras el intento
    // (no se reintenta cada 60s, para no repetir el aviso ni llenar chat_stats de fallos repetidos).
    const entregado = await enviarAvisoAsesor({
        tipo: 'escalamiento_lista_espera',
        canal: canalEscalamiento,
        referencia: `cupo:${accion.cupo_liberado_id}`,
        mensaje: construirMensajeEscalamiento(accion)
    });
    if (!canalEscalamiento) {
        console.error(
            `[listaEsperaCascadaPoller] CANAL_ESCALAMIENTO_LISTA_ESPERA no está configurado en .env — no se ` +
            `pudo notificar a recepción automáticamente el cupo ${accion.cupo_liberado_id}.`
        );
    } else if (!entregado) {
        console.error(`[listaEsperaCascadaPoller] No se pudo entregar el aviso de escalamiento del cupo ${accion.cupo_liberado_id}.`);
    }

    try {
        await confirmarEscalamientoListaEspera(accion.cupo_liberado_id);
    } catch (error: any) {
        console.error(`[listaEsperaCascadaPoller] Error confirmando escalamiento del cupo ${accion.cupo_liberado_id}:`, error?.message ?? error);
    }
}

async function procesarAccionNotificarPausa(accion: AccionNotificarPausa, sendRaw: SendRawMessage): Promise<void> {
    // No requiere confirmación de vuelta al backend: el backend ya dejó la inscripción en 'pausada'.
    const telefonoLog = enmascararTelefono(accion.telefono_paciente);
    if (!isCascadaEnabled()) {
        logObservacionUnaVez(
            `pausa:${accion.lista_espera_id}`,
            `Acción 'notificar_pausa' pendiente: lista_espera ${accion.lista_espera_id} (tel ${telefonoLog}). No se envió el aviso al paciente.`
        );
        return;
    }

    const telefonoDestino = normalizarTelefonoWhatsApp(accion.telefono_paciente);
    if (!telefonoDestino) {
        console.warn(`[listaEsperaCascadaPoller] Aviso de pausa no enviado (teléfono no contactable) para lista_espera ${accion.lista_espera_id}.`);
        return;
    }
    if (!esTelefonoPiloto(telefonoDestino)) {
        console.log(`[listaEsperaCascadaPoller] Aviso de pausa no enviado: tel ${telefonoLog} fuera de LISTA_ESPERA_TELEFONOS_PILOTO (lista_espera ${accion.lista_espera_id}).`);
        return;
    }

    try {
        await sendRaw(
            telefonoDestino,
            `Hola ${accion.nombre_paciente}, por falta de respuesta saliste de la lista de espera para ` +
            'adelantar tu cita. Si quieres volver a inscribirte, agenda o consulta tu cita nuevamente y ' +
            'acepta la opción de avisos cuando se libere un espacio con el profesional que te atiende. ' +
            '¡Gracias por tu comprensión! 😊'
        );
    } catch (error: any) {
        console.error(`[listaEsperaCascadaPoller] Error notificando pausa de lista de espera a tel ${telefonoLog}:`, error?.message ?? error);
    }
}

async function procesarAccion(accion: AccionCascada, sendRaw: SendRawMessage): Promise<void> {
    switch (accion.tipo) {
        case 'ofertar':
            return procesarAccionOfertar(accion);
        case 'escalar':
            return procesarAccionEscalar(accion);
        case 'notificar_pausa':
            return procesarAccionNotificarPausa(accion, sendRaw);
        default:
            console.error('[listaEsperaCascadaPoller] Acción de cascada con tipo desconocido, se ignora:', (accion as any)?.tipo);
    }
}

async function runCascadaTick(sendRaw: SendRawMessage): Promise<void> {
    try {
        const acciones = await tickCascadaListaEspera();
        for (const accion of acciones) {
            // Se procesan secuencialmente (no Promise.all) para no disparar en paralelo múltiples
            // llamadas de confirmación sobre el mismo cupo/paciente si el tick devolviera más de una
            // acción relacionada — más simple de razonar, y el volumen esperado por tick es bajo.
            await procesarAccion(accion, sendRaw);
        }
    } catch (error: any) {
        console.error('[listaEsperaCascadaPoller] Error ejecutando tick de cascada de lista de espera:', error?.message ?? error);
    }
}

/**
 * Guarda de ejecución única (corrección R2, docs/features/2026-09-28-ajustes-lista-espera.md 1.13):
 * nunca corren dos ticks en paralelo dentro del proceso. La comparten el `setInterval` y
 * `triggerCascadaTickNow()`. Si llega una llamada mientras hay un tick en curso, se marca pendiente y se
 * ejecuta UN tick más al terminar (varias llamadas en ese lapso se agrupan en un solo tick extra), para
 * no perder el path rápido de "cupo liberado en menos de 30 s". PM2 corre en `fork` (un solo proceso),
 * así que un flag de módulo basta.
 */
let tickEnCurso = false;
let tickPendiente = false;

async function ejecutarTickSerializado(sendRaw: SendRawMessage): Promise<void> {
    if (tickEnCurso) {
        tickPendiente = true;
        return;
    }
    tickEnCurso = true;
    try {
        do {
            tickPendiente = false;
            await runCascadaTick(sendRaw);
        } while (tickPendiente);
    } finally {
        tickEnCurso = false;
    }
}

/**
 * Arranca el `setInterval` que sondea la cascada cada `LISTA_ESPERA_CASCADA_POLL_INTERVAL_MS` (default
 * 60000). Debe llamarse una sola vez, en el mismo bloque de `app.ts` donde ya se inicializa el resto
 * de sistemas proactivos (junto a `restoreActiveTimers()`).
 */
export function startCascadaPoller(sendRaw: SendRawMessage): void {
    cachedSendRaw = sendRaw;

    if (pollerStarted) {
        console.warn('[listaEsperaCascadaPoller] startCascadaPoller() ya había sido llamado; se ignora la llamada duplicada.');
        return;
    }
    pollerStarted = true;

    const intervalMs = Number(process.env.LISTA_ESPERA_CASCADA_POLL_INTERVAL_MS) || DEFAULT_POLL_INTERVAL_MS;
    console.log(
        `[listaEsperaCascadaPoller] Poller de cascada de lista de espera iniciado (cada ${intervalMs} ms, ` +
        `LISTA_ESPERA_CASCADA_ENABLED=${isCascadaEnabled()}, lista piloto ${hayListaPiloto() ? 'activa' : 'vacía (sin restricción)'}).`
    );

    setInterval(() => {
        ejecutarTickSerializado(sendRaw).catch((error) =>
            console.error('[listaEsperaCascadaPoller] Error inesperado en tick programado:', error?.message ?? error)
        );
    }, intervalMs);
}

/**
 * Path rápido (13.4-a): dispara un tick inmediato, fire-and-forget, sin esperar su resultado.
 * Pensado para llamarse justo después de que `cancelarCita()`/`reagendarCita()` del propio bot hayan
 * respondido exitosamente, para no depender del intervalo de 60s en el caso más común (cancelación
 * hecha por el propio paciente vía WhatsApp).
 */
export function triggerCascadaTickNow(): void {
    if (!cachedSendRaw) {
        console.error('[listaEsperaCascadaPoller] triggerCascadaTickNow() llamado antes de startCascadaPoller(); se ignora.');
        return;
    }
    ejecutarTickSerializado(cachedSendRaw).catch((error) =>
        console.error('[listaEsperaCascadaPoller] Error inesperado en tick inmediato (path rápido):', error?.message ?? error)
    );
}

/**
 * Retraso del path rápido (docs 2026-10-01-revision-pruebas-reales.md, B1/B5-2). Si el tick sale en el
 * mismo instante que la confirmación de cancelar/reprogramar, la plantilla de oferta (que va directo a
 * Graph, fuera de la cola del flujo) llega mezclada con "Tu cita ha sido cancelada" y el menú.
 *
 * `LISTA_ESPERA_RETRASO_OFERTA_SEG` (default 20) es la MISMA variable que usa el backend para no
 * ofertar cupos detectados hace menos de ese tiempo (así tampoco los oferta el poller de 60 s). El bot
 * espera ese tiempo más `MARGEN_RETRASO_OFERTA_MS`, para que el tick llegue cuando el backend ya
 * permite ofertar el cupo. Un valor inválido o negativo usa el default; 0 deja solo el margen.
 */
export const DEFAULT_RETRASO_OFERTA_SEG = 20;
export const MARGEN_RETRASO_OFERTA_MS = 5000;

export function obtenerRetrasoTickRapidoMs(): number {
    const raw = process.env.LISTA_ESPERA_RETRASO_OFERTA_SEG;
    const valor = raw !== undefined && raw.trim() !== '' ? Number(raw) : NaN;
    const segundos = Number.isFinite(valor) && valor >= 0 ? valor : DEFAULT_RETRASO_OFERTA_SEG;
    return Math.round(segundos * 1000) + MARGEN_RETRASO_OFERTA_MS;
}

/**
 * Programa el path rápido con retraso. Llamar DESPUÉS de enviar al paciente la confirmación de que su
 * cita se canceló/reprogramó. Fire-and-forget: nunca lanza. Si el proceso se reinicia antes de que
 * venza el timer, no se pierde nada: el poller de 60 s hace el mismo tick.
 */
export function programarTickCascadaRetrasado(): void {
    try {
        const retrasoMs = obtenerRetrasoTickRapidoMs();
        const timer = setTimeout(() => {
            try {
                triggerCascadaTickNow();
            } catch (error: any) {
                console.error('[listaEsperaCascadaPoller] Error en tick rápido retrasado:', error?.message ?? error);
            }
        }, retrasoMs);
        // No mantener vivo el proceso solo por este timer.
        (timer as any)?.unref?.();
    } catch (error: any) {
        console.error('[listaEsperaCascadaPoller] Error programando el tick rápido retrasado:', error?.message ?? error);
    }
}

/** Solo para pruebas: ejecuta un tick con el `sendRaw` dado, limpiando antes el registro de logs observados. */
export async function _runCascadaTickParaPruebas(sendRaw: SendRawMessage): Promise<void> {
    accionesObservadasLogueadas.clear();
    await runCascadaTick(sendRaw);
}

/** Solo para pruebas: ejecuta la guarda de ejecución única (mismo camino que setInterval/trigger). */
export function _ejecutarTickSerializadoParaPruebas(sendRaw: SendRawMessage): Promise<void> {
    return ejecutarTickSerializado(sendRaw);
}

/** Solo para pruebas: fija el `sendRaw` cacheado que usa `triggerCascadaTickNow()`, sin arrancar el setInterval. */
export function _setSendRawParaPruebas(sendRaw: SendRawMessage | null): void {
    cachedSendRaw = sendRaw;
}

/** Solo para pruebas: reinicia el estado del módulo (guarda, sendRaw cacheado, arranque y logs observados). */
export function _resetPollerParaPruebas(): void {
    tickEnCurso = false;
    tickPendiente = false;
    cachedSendRaw = null;
    pollerStarted = false;
    accionesObservadasLogueadas.clear();
}
