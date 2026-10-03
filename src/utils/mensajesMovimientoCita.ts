// Mensajes al paciente cuando Globho falla al mover una cita (HTTP 502, cause 'GLOBHO_ERROR').
// Los usan dos flujos: aceptar una oferta de cupo (`POST /chatbot/listaespera/cascada/respuesta`) y
// reprogramar desde el menú (`POST /chatbot/reagendar`). Contrato del backend: el body trae
// `data.cita_anterior_restaurada`:
// - `true`: la cita actual del paciente quedó como estaba.
// - `false` (o ausente): quedó inconsistente en Globho y hay que corregirla a mano.
// Ver proyecto-ips/docs/features/2026-10-01-revision-pruebas-reales.md, anexo "aceptar oferta", 6.P1.
//
// Privacidad (regla transversal): ningún mensaje menciona la especialidad ni el tipo de servicio.

import { formatearFechaLarga, formatearHoraHHMM } from './fechaHora';

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

// ---------------------------------------------------------------------------
// T-01 (informe QA, sección 10 "TB-03"): 502 `POSTGRES_DESPUES_DE_GLOBHO`. La cita SÍ quedó movida en
// Globho, pero no quedó registrada en nuestro sistema. No se invita a reintentar (un segundo intento
// movería otra vez una cita que ya se movió): se deriva al asesor. Contrato:
// `{ code:502, cause:'POSTGRES_DESPUES_DE_GLOBHO', data:{ cita_creada_en_globho:true,
//    cita_anterior_restaurada:false, [solo cascada: nueva_fecha_cita 'YYYY-MM-DD', nueva_hora_cita 'HH:mm:ss'] } }`.
// ---------------------------------------------------------------------------

export const CAUSE_POSTGRES_DESPUES_DE_GLOBHO = 'POSTGRES_DESPUES_DE_GLOBHO';

/** `true` si la respuesta del backend es el 502 "Globho movió la cita y falló Postgres" del contrato. */
export function esErrorPostgresTrasGlobho(code?: number, cause?: string | null): boolean {
    return code === 502 && cause === CAUSE_POSTGRES_DESPUES_DE_GLOBHO;
}

/**
 * Texto para el 502 POSTGRES_DESPUES_DE_GLOBHO. `fecha` 'YYYY-MM-DD' y `hora` 'HH:mm[:ss]' (se formatean
 * como fecha larga y HH:mm); si faltan, se omiten. Nunca invita a reintentar.
 */
export function mensajeCitaMovidaPendienteVerificacion(fecha?: unknown, hora?: unknown): string {
    const fechaLarga = formatearFechaLarga(fecha);
    const horaHHMM = formatearHoraHHMM(hora);
    const partes: string[] = [];
    if (fechaLarga) partes.push(`📅 ${fechaLarga}`);
    if (horaHHMM) partes.push(`🕐 ${horaHHMM}`);
    const horario = partes.length > 0 ? ` (${partes.join(' ')})` : '';
    return (
        `Tu cita sí quedó movida al nuevo horario${horario}, pero necesitamos verificarla en nuestro sistema. ` +
        'Un asesor la revisará; si quieres, comunícate con él:\n' +
        `👉 https://wa.me/${numeroAsesorHumano()}`
    );
}
