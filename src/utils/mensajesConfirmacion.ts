// Mensajes y métricas de la respuesta a "Confirmar" / "Confirmo" / "Confirmo asistencia".
// Textos fijados en proyecto-ips/docs/features/2026-09-27-confirmar-cita-ya-confirmada.md, sección 4.6
// (decisiones 9.1 a 9.4). Funciones puras: no envían nada ni tocan el state; los flujos solo ejecutan
// lo que devuelven.
//
// Privacidad (regla transversal): ningún mensaje menciona la especialidad ni el tipo de servicio, aunque
// el backend la devuelva.

import type {
    FalloConfirmacion,
    ResultadoConfirmacion,
    ResultadoRespuestaRecordatorio,
} from '../services/apiService';
import { formatearFechaLarga, formatearHoraHHMM } from './fechaHora';

/** Camino A (plantillas actuales, `confirmarcitameta`) o camino B (botón "Confirmo asistencia"). */
export type CaminoConfirmacion = 'campahna' | 'recordatorio';

/** Reintentos del documento permitidos tras un CITA_NOT_FOUND / DOCUMENTO_INVALIDO (decisión 9.4). */
export const MAX_REINTENTOS_DOCUMENTO = 1;

export const MENSAJE_AGRADECIMIENTO_CONFIRMACION =
    'Gracias por confirmar tu cita. Si necesitas más ayuda, no dudes en preguntar. ¡Feliz día!';
export const MENSAJE_DOCUMENTO_REINTENTO =
    'No encontramos una cita pendiente con ese número de documento. Por favor verifica y escríbelo nuevamente.';
export const MENSAJE_DOCUMENTO_FINAL =
    'No encontramos una cita asociada a este número y documento. Si crees que es un error, escribe *hola* y elige *Chatear con agente* para que un asesor te ayude.';
export const MENSAJE_GLOBHO_ERROR =
    'No pudimos registrar tu confirmación en este momento. Si ya confirmaste tu cita con nuestro equipo, no necesitas hacer nada más. Si no, intenta de nuevo más tarde o escríbenos.';
export const MENSAJE_ERROR_CONFIRMACION =
    '❌ No pudimos procesar tu confirmación en este momento. Intenta nuevamente más tarde.';
/** Error técnico en los flujos de cancelar del recordatorio ("Necesito cancelar" / "No podré asistir"). */
export const MENSAJE_ERROR_RESPUESTA_RECORDATORIO =
    '❌ No pudimos procesar tu respuesta en este momento. Intenta nuevamente más tarde.';

export interface RespuestaConfirmacion {
    /** Mensajes a enviar, en orden. */
    mensajes: string[];
    /** 'reintentar': volver a pedir el documento (mismo tipo de flujo); 'fin': cerrar el flujo. */
    siguiente: 'fin' | 'reintentar';
}

/**
 * " del 28 de septiembre de 2026 a las 10:00", o '' si falta la fecha o la hora (así el mensaje queda
 * "Tu cita ya se encuentra confirmada", sin dobles espacios).
 */
export function fraseFechaHora(fecha?: string, hora?: string): string {
    const fechaLarga = formatearFechaLarga(fecha);
    const horaCorta = formatearHoraHHMM(hora);
    if (!fechaLarga || !horaCorta) return '';
    return ` del ${fechaLarga} a las ${horaCorta}`;
}

/**
 * Qué decir y qué hacer después según el resultado del backend.
 * @param intentosPrevios reintentos de documento ya consumidos en esta conversación (0 la primera vez).
 */
export function construirRespuestaConfirmacion(
    resultado: ResultadoConfirmacion,
    camino: CaminoConfirmacion,
    intentosPrevios: number
): RespuestaConfirmacion {
    const frase = fraseFechaHora(resultado.fecha_cita, resultado.hora_cita);

    if (resultado.ok) {
        if (resultado.estado === 'ya_confirmada') {
            return {
                siguiente: 'fin',
                mensajes: [
                    camino === 'recordatorio'
                        ? `😊 ¡Gracias por avisarnos! Tu cita${frase} ya está confirmada. No necesitas hacer nada más. ¡Te esperamos!`
                        : `😊 Tu cita${frase} ya se encuentra confirmada. No necesitas hacer nada más. ¡Te esperamos!`,
                ],
            };
        }
        return {
            siguiente: 'fin',
            mensajes:
                camino === 'recordatorio'
                    ? [`✅ ¡Listo! Tu cita${frase} quedó confirmada. Te esperamos. 😊`]
                    : [`✅ ¡Tu cita${frase} ha sido confirmada exitosamente!`, MENSAJE_AGRADECIMIENTO_CONFIRMACION],
        };
    }

    // Rama de fallo. Se compara con `=== false` y se nombra aparte porque tsconfig.json no es `strict`
    // (sin strictNullChecks la unión discriminada no se estrecha en la rama `else` de `if (x.ok)`).
    if (resultado.ok === false) return respuestaFallo(resultado, frase, intentosPrevios);
    return { siguiente: 'fin', mensajes: [MENSAJE_ERROR_CONFIRMACION] };
}

function respuestaFallo(resultado: FalloConfirmacion, frase: string, intentosPrevios: number): RespuestaConfirmacion {
    switch (resultado.causa) {
        case 'CITA_CANCELADA':
            return {
                siguiente: 'fin',
                mensajes: [`Tu cita${frase} figura como cancelada. Si deseas agendar una nueva, escribe *hola*.`],
            };
        case 'CITA_REPROGRAMADA':
            return {
                siguiente: 'fin',
                mensajes: [`Tu cita${frase} fue reprogramada. Si tienes dudas sobre tu nueva fecha, escribe *hola* para consultarla.`],
            };
        case 'CITA_PASADA':
            return {
                siguiente: 'fin',
                mensajes: [`La hora de tu cita${frase} ya pasó. Si necesitas una nueva cita, escribe *hola*.`],
            };
        case 'CITA_NOT_FOUND':
        case 'DOCUMENTO_INVALIDO':
            return intentosPrevios < MAX_REINTENTOS_DOCUMENTO
                ? { siguiente: 'reintentar', mensajes: [MENSAJE_DOCUMENTO_REINTENTO] }
                : { siguiente: 'fin', mensajes: [MENSAJE_DOCUMENTO_FINAL] };
        case 'GLOBHO_ERROR':
            return { siguiente: 'fin', mensajes: [MENSAJE_GLOBHO_ERROR] };
        case 'ERROR':
        default:
            return { siguiente: 'fin', mensajes: [MENSAJE_ERROR_CONFIRMACION] };
    }
}

/** Adapta la respuesta de `responderRecordatorio(..., 'confirma')` al mismo resultado del camino A. */
export function resultadoConfirmacionDesdeRecordatorio(resp: ResultadoRespuestaRecordatorio): ResultadoConfirmacion {
    if (resp.ok === false) return resp;
    const { estado_resultado, fecha_cita, hora_cita } = resp.data;
    const resultado: ResultadoConfirmacion = {
        ok: true,
        estado: estado_resultado === 'ya_confirmada' ? 'ya_confirmada' : 'confirmada',
    };
    if (fecha_cita) resultado.fecha_cita = fecha_cita;
    if (hora_cita) resultado.hora_cita = hora_cita;
    return resultado;
}

/** `estado`/`resultado` de la métrica de las campañas (`campahna_envio` / `campahna_recordatorio`). */
export function metricaConfirmacionCampahna(resultado: ResultadoConfirmacion): { estado: string; resultado: string } {
    if (resultado.ok) {
        return resultado.estado === 'ya_confirmada'
            ? { estado: 'ya_confirmado', resultado: 'exitoso' }
            : { estado: 'confirmado', resultado: 'exitoso' };
    }
    if (resultado.ok === false) return { estado: 'no_confirmado', resultado: resultado.causa.toLowerCase() };
    return { estado: 'no_confirmado', resultado: 'error' };
}

/** `resultado` de la métrica `recordatorio_respuesta` (accion 'confirma'). */
export function metricaConfirmacionRecordatorio(resultado: ResultadoConfirmacion): string {
    if (resultado.ok) return resultado.estado === 'ya_confirmada' ? 'ya_confirmada' : 'exitoso';
    if (resultado.ok === false) return resultado.causa.toLowerCase();
    return 'error';
}
