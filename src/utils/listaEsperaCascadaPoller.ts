// Poller de la cascada de ofertas de cupo — Fase 2 de "lista de espera inteligente".
// Ver proyecto-ips/docs/features/2026-09-07-lista-espera-inteligente.md, secciones 13.4-a y 13.7.
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

const DEFAULT_POLL_INTERVAL_MS = 60000;

type SendRawMessage = (to: string, message: string) => Promise<any>;

let pollerStarted = false;
let cachedSendRaw: SendRawMessage | null = null;

/**
 * Bandera de seguridad (default apagada): mientras la plantilla `oferta_cupo_disponible` no esté
 * aprobada por Meta, el motor de cascada puede desplegarse igual en modo "observar sin actuar" —
 * sigue llamando al tick (para no perder visibilidad de lo que pasaría) pero NO envía la plantilla
 * de oferta ni llama a los endpoints de confirmación de envío/fallo asociados a esa acción. Ver
 * docs/features/2026-09-07-lista-espera-inteligente.md, sección 13.8.
 */
function isCascadaEnabled(): boolean {
    return process.env.LISTA_ESPERA_CASCADA_ENABLED === 'true';
}

async function procesarAccionOfertar(accion: AccionOfertar): Promise<void> {
    if (!isCascadaEnabled()) {
        console.log(
            `[listaEsperaCascadaPoller] (LISTA_ESPERA_CASCADA_ENABLED != 'true', modo observación) ` +
            `Acción 'ofertar' pendiente: cupo ${accion.cupo_liberado_id} -> paciente ${accion.paciente_id} ` +
            `(${accion.nombre_paciente}, ${accion.telefono_paciente}) para ${accion.profesional} el ` +
            `${accion.fecha_cita} ${accion.hora_cita} (nivel de cascada ${accion.nivel_cascada_origen}). ` +
            `No se envió ninguna plantilla ni se llamó a confirmar-envio/marcar-fallo.`
        );
        return;
    }

    try {
        const resultado = await enviarPlantillaOfertaCupo(
            accion.nombre_paciente,
            accion.telefono_paciente,
            accion.profesional,
            accion.fecha_cita,
            accion.hora_cita
        );

        if (resultado.exito) {
            const confirmado = await confirmarEnvioOfertaCupo(
                accion.cupo_liberado_id,
                accion.lista_espera_id,
                resultado.mensajeWaId
            );
            if (!confirmado) {
                console.error(
                    `[listaEsperaCascadaPoller] La plantilla de oferta se envió pero confirmar-envio no se ` +
                    `pudo confirmar para cupo ${accion.cupo_liberado_id}/lista_espera ${accion.lista_espera_id} ` +
                    `(posible carrera con otro tick, backend caído, u OFERTA_NO_DISPONIBLE). Se reevaluará en ` +
                    `el próximo tick.`
                );
            }
        } else {
            await marcarFalloOfertaCupo(accion.cupo_liberado_id, accion.lista_espera_id, 'envio_meta_fallido');
        }
    } catch (error) {
        console.error(`[listaEsperaCascadaPoller] Error inesperado procesando oferta del cupo ${accion.cupo_liberado_id}:`, error);
        try {
            await marcarFalloOfertaCupo(accion.cupo_liberado_id, accion.lista_espera_id, 'excepcion_bot');
        } catch (error2) {
            console.error('[listaEsperaCascadaPoller] Error adicional marcando fallo de oferta tras excepción:', error2);
        }
    }
}

async function procesarAccionEscalar(accion: AccionEscalar, sendRaw: SendRawMessage): Promise<void> {
    const canalEscalamiento = process.env.CANAL_ESCALAMIENTO_LISTA_ESPERA;
    const mensajeResumen =
        '⚠️ Cupo de lista de espera sin asignar — requiere gestión manual de recepción\n' +
        `Profesional: ${accion.profesional}\n` +
        `Fecha y hora del cupo: ${accion.fecha_cita} ${accion.hora_cita}\n` +
        `Motivo: ${accion.motivo}\n` +
        `Candidatos contactados: ${accion.candidatos_contactados}\n` +
        `Respuestas — Aceptaron: ${accion.resumen_respuestas.aceptaron}, ` +
        `Rechazaron: ${accion.resumen_respuestas.rechazaron}, ` +
        `Sin respuesta: ${accion.resumen_respuestas.sin_respuesta}\n` +
        `Cupo liberado ID: ${accion.cupo_liberado_id}`;

    // Mismo patrón defensivo que CANAL_ESCALAMIENTO_CRISIS (ver src/utils/crisisProtocol.ts): si el
    // canal no está configurado, solo se loguea y se sigue — no bloquea el resto del motor de cascada.
    if (canalEscalamiento) {
        try {
            await sendRaw(canalEscalamiento, mensajeResumen);
        } catch (error) {
            console.error('[listaEsperaCascadaPoller] Error notificando escalamiento al canal configurado:', error);
        }
    } else {
        console.error(
            `[listaEsperaCascadaPoller] CANAL_ESCALAMIENTO_LISTA_ESPERA no está configurado en .env — no se ` +
            `pudo notificar a recepción automáticamente. Detalle del escalamiento:\n${mensajeResumen}`
        );
    }

    try {
        await confirmarEscalamientoListaEspera(accion.cupo_liberado_id);
    } catch (error) {
        console.error(`[listaEsperaCascadaPoller] Error confirmando escalamiento del cupo ${accion.cupo_liberado_id}:`, error);
    }
}

async function procesarAccionNotificarPausa(accion: AccionNotificarPausa, sendRaw: SendRawMessage): Promise<void> {
    // No requiere confirmación de vuelta al backend: el backend ya dejó la inscripción en 'pausada'.
    try {
        await sendRaw(
            accion.telefono_paciente,
            `Hola ${accion.nombre_paciente}, por falta de respuesta saliste de la lista de espera para ` +
            'adelantar tu cita. Si quieres volver a inscribirte, agenda o consulta tu cita nuevamente y ' +
            'acepta la opción de avisos cuando se libere un espacio con el profesional que te atiende. ' +
            '¡Gracias por tu comprensión! 😊'
        );
    } catch (error) {
        console.error(`[listaEsperaCascadaPoller] Error notificando pausa de lista de espera a ${accion.telefono_paciente}:`, error);
    }
}

async function procesarAccion(accion: AccionCascada, sendRaw: SendRawMessage): Promise<void> {
    switch (accion.tipo) {
        case 'ofertar':
            return procesarAccionOfertar(accion);
        case 'escalar':
            return procesarAccionEscalar(accion, sendRaw);
        case 'notificar_pausa':
            return procesarAccionNotificarPausa(accion, sendRaw);
        default:
            console.error('[listaEsperaCascadaPoller] Acción de cascada con tipo desconocido, se ignora:', accion);
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
    } catch (error) {
        console.error('[listaEsperaCascadaPoller] Error ejecutando tick de cascada de lista de espera:', error);
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
        `LISTA_ESPERA_CASCADA_ENABLED=${isCascadaEnabled()}).`
    );

    setInterval(() => {
        runCascadaTick(sendRaw).catch((error) =>
            console.error('[listaEsperaCascadaPoller] Error inesperado en tick programado:', error)
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
    runCascadaTick(cachedSendRaw).catch((error) =>
        console.error('[listaEsperaCascadaPoller] Error inesperado en tick inmediato (path rápido):', error)
    );
}
