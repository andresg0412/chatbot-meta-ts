// Mensajes y botones de la respuesta a la oferta de cupo con un toque (D1) y de la pregunta de seguir en la
// lista tras rechazar (D10): proyecto-ips/docs/features/2026-10-07-lista-espera-aceptacion-y-escalamientos.md.
//
// Regla de privacidad transversal de la lista de espera: ningún mensaje menciona la especialidad ni palabras
// como "psicología", "terapia" o "sesión". Solo profesional, fecha y hora.

import { formatearFechaLarga, formatearHoraHHMM } from './fechaHora';
import {
    TEXTO_BOTON_CONFIRMAR_OFERTA,
    TEXTO_BOTON_NO_CONFIRMAR_OFERTA,
    TEXTO_BOTON_SEGUIR_LISTA,
    TEXTO_BOTON_SALIR_LISTA,
} from '../templates/flujos/keywordsBotones';

/** Minutos que se le prometen al paciente para confirmar (D1/D2). Nunca se muestra más de esto. */
export const MINUTOS_CONFIRMAR_OFERTA = 10;

export const BOTONES_CONFIRMAR_OFERTA = [{ body: TEXTO_BOTON_CONFIRMAR_OFERTA }, { body: TEXTO_BOTON_NO_CONFIRMAR_OFERTA }];
export const BOTONES_POST_RECHAZO = [{ body: TEXTO_BOTON_SEGUIR_LISTA }, { body: TEXTO_BOTON_SALIR_LISTA }];

export interface CupoParaConfirmar {
    profesional?: string | null;
    fecha_cita?: string | null;
    hora_cita?: string | null;
}

/**
 * Minutos que se muestran: lo que de verdad le queda a la oferta, con tope en 10 (D1: "Tienes 10 minutos para
 * confirmar"). Sin el dato (backend anterior) se muestran 10. Siempre entre 1 y 10.
 */
export function minutosParaMostrar(minutosRestantes: unknown): number {
    const minutos = Number(minutosRestantes);
    if (!Number.isFinite(minutos) || minutos <= 0) return MINUTOS_CONFIRMAR_OFERTA;
    return Math.min(MINUTOS_CONFIRMAR_OFERTA, Math.max(1, Math.floor(minutos)));
}

/** Mensaje de confirmación: qué cupo es, que su cita actual se libera y cuánto tiempo tiene. */
export function mensajeConfirmarOferta(cupo: CupoParaConfirmar, minutosRestantes?: unknown): string {
    const minutos = minutosParaMostrar(minutosRestantes);
    const fecha = formatearFechaLarga(cupo.fecha_cita ?? undefined);
    const hora = formatearHoraHHMM(cupo.hora_cita ?? '');
    const profesional = typeof cupo.profesional === 'string' && cupo.profesional.trim() !== '' ? ` con ${cupo.profesional.trim()}` : '';
    const cuando = `${fecha ? fecha + ' ' : ''}${hora ? 'a las ' + hora : ''}`.trim();
    return (
        `Vas a adelantar tu cita para el ${cuando}${profesional}.\n\n` +
        'Al confirmar, tu cita actual quedará liberada para otra persona.\n\n' +
        `⏳ *Tienes ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} para confirmar.*\n\n` +
        '¿Quieres adelantar tu cita?'
    );
}

export const MENSAJE_PEDIR_DOCUMENTO_OFERTA_ACEPTAR = 'Para confirmar que el espacio es para ti, por favor digita tu número de documento 🔢:';
export const MENSAJE_PEDIR_DOCUMENTO_OFERTA_RECHAZAR = 'Entendido. Para registrar tu respuesta, por favor digita tu número de documento 🔢:';
export const MENSAJE_OFERTA_YA_RESPONDIDA = 'Ya registramos tu respuesta para ese espacio. Gracias. 😊';

export const MENSAJE_RECHAZO_SIGUE_EN_LISTA =
    'Entendido, gracias por avisarnos. Sigues en la lista de espera y te contactaremos si se libera otro espacio. 😊';

/** Pregunta tras rechazar (D10). Va con los botones BOTONES_POST_RECHAZO. */
export const MENSAJE_POST_RECHAZO =
    'Entendido, gracias por avisarnos. ¿Quieres seguir en la lista de espera para que te avisemos si se libera otro espacio?';
export const MENSAJE_POST_RECHAZO_SIGUE = 'Perfecto, sigues en la lista de espera y te avisaremos si se libera otro espacio. 😊';
export const MENSAJE_POST_RECHAZO_SALE = 'Listo, saliste de la lista de espera. Tu cita actual sigue firme. ¡Gracias por avisarnos! 😊';
export const MENSAJE_POST_RECHAZO_ERROR_SALIDA =
    'No pudimos sacarte de la lista de espera en este momento. Si quieres salir, escribe *Retirar lista de espera*.';
export const MENSAJE_POST_RECHAZO_ERROR_SIGUE = 'Sigues en la lista de espera y te avisaremos si se libera otro espacio. 😊';
