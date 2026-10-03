// Mensajes al paciente cuando Globho falla al mover una cita (HTTP 502, cause 'GLOBHO_ERROR').
// Los usan dos flujos: aceptar una oferta de cupo (`POST /chatbot/listaespera/cascada/respuesta`) y
// reprogramar desde el menú (`POST /chatbot/reagendar`). Contrato del backend: el body trae
// `data.cita_anterior_restaurada`:
// - `true`: la cita actual del paciente quedó como estaba.
// - `false` (o ausente): quedó inconsistente en Globho y hay que corregirla a mano.
// Ver proyecto-ips/docs/features/2026-10-01-revision-pruebas-reales.md, anexo "aceptar oferta", 6.P1.
//
// Privacidad (regla transversal): ningún mensaje menciona la especialidad ni el tipo de servicio.

export const CAUSE_GLOBHO_ERROR = 'GLOBHO_ERROR';

export const MENSAJE_MOVIMIENTO_CITA_RESTAURADA =
    'No pudimos mover tu cita en este momento; tu cita actual sigue igual. Intenta de nuevo en unos minutos.';

/** Mismo número y fallback que `templates/flujos/pasoAgente/index.ts`. Se lee en cada llamada. */
export function numeroAsesorHumano(): string {
    return process.env.NUMERO_ASESOR_HUMANO || '573158070460';
}

export function mensajeMovimientoCitaNoRestaurada(): string {
    return (
        'No pudimos mover tu cita en este momento y necesitamos revisarla con nuestro equipo. ' +
        'Por favor comunícate con recepción o con un asesor para que te ayuden:\n' +
        `👉 https://wa.me/${numeroAsesorHumano()}`
    );
}

/** `true` si la respuesta del backend es el 502 de Globho del contrato. */
export function esErrorGlobhoMovimiento(code?: number, cause?: string | null): boolean {
    return code === 502 && cause === CAUSE_GLOBHO_ERROR;
}

/** Texto para el 502 GLOBHO_ERROR. Solo `true` estricto cuenta como restaurada. */
export function mensajeErrorGlobhoMovimiento(citaAnteriorRestaurada?: boolean | null): string {
    return citaAnteriorRestaurada === true
        ? MENSAJE_MOVIMIENTO_CITA_RESTAURADA
        : mensajeMovimientoCitaNoRestaurada();
}
