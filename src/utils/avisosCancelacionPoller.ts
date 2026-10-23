// Poller de los avisos de cita cancelada al paciente.
// Diseño: proyecto-ips/docs/features/2026-10-23-avisos-cancelacion-paciente.md, sección 5.
//
// Mismo modelo que la cascada de la lista de espera (el backend nunca llama al bot): cada
// `AVISOS_CANCELACION_POLL_INTERVAL_MS` (default 60 s) se pide al backend la bandeja de avisos listos
// (`POST /chatbot/avisos-cancelacion/reservar`), se envía la plantilla de cada uno y se reporta el resultado
// (`/resultado`). El backend decide qué se envía y cuándo (banderas, horario, descartes); aquí solo se envía.
//
// Un aviso reservado nunca se vuelve a entregar: si el bot se cae entre el envío y el reporte, el backend lo da por
// fallido a los 15 minutos. Es preferible no avisar a avisar dos veces.
//
// La cancelación automática llama a `triggerAvisosCancelacionNow()` al terminar su corrida, para que el paciente
// reciba el aviso sin esperar el siguiente sondeo.

import {
    AvisoCancelacionReservado,
    enviarPlantillaAvisoCancelacion,
    registrarResultadoAvisoCancelacion,
    reservarAvisosCancelacion,
    tokenCancelacionAutomatica,
} from '../services/apiService';

export const DEFAULT_POLL_INTERVAL_MS = 60_000;
/** Avisos que se piden por sondeo. Con el intervalo de 60 s alcanza de sobra para un día normal. */
export const LIMITE_POR_SONDEO = 20;
/** Pausa entre un envío y el siguiente, para no disparar ráfagas a Meta. */
export const PAUSA_ENTRE_ENVIOS_MS = 300;
/** Espera antes de reintentar UNA vez el reporte de un resultado que no llegó al backend. */
export const ESPERA_REINTENTO_REPORTE_MS = 2_000;

const dormir = (ms: number) => (ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

let pollerIniciado = false;
let sinTokenLogueado = false;

/** Resumen de un sondeo, sin datos personales. */
export interface ResumenSondeoAvisos {
    reservados: number;
    enviados: number;
    fallidos: number;
    descartados: number;
}

/** Reporta el resultado; si el backend no contesta, lo reintenta una vez. */
async function reportar(
    avisoId: string,
    resultado: 'enviado' | 'fallido' | 'descartado',
    detalle: { motivo?: string; waMessageId?: string; errorCode?: string },
    esperaReintentoMs: number
): Promise<void> {
    if (await registrarResultadoAvisoCancelacion(avisoId, resultado, detalle)) return;
    await dormir(esperaReintentoMs);
    if (!(await registrarResultadoAvisoCancelacion(avisoId, resultado, detalle))) {
        console.error(`[avisos-cancelacion] No se pudo reportar el resultado '${resultado}' del aviso ${avisoId}; el backend lo cerrará como fallido.`);
    }
}

/** Envía un aviso reservado y reporta qué pasó. Nunca lanza. */
async function procesarAviso(aviso: AvisoCancelacionReservado, esperaReintentoMs: number): Promise<'enviado' | 'fallido' | 'descartado'> {
    try {
        const r = await enviarPlantillaAvisoCancelacion(aviso);
        if (r.exito) {
            await reportar(aviso.aviso_id, 'enviado', { waMessageId: r.mensajeWaId }, esperaReintentoMs);
            return 'enviado';
        }
        if (r.errorCode === 'telefono_invalido') {
            await reportar(aviso.aviso_id, 'descartado', { motivo: 'telefono_invalido' }, esperaReintentoMs);
            return 'descartado';
        }
        await reportar(aviso.aviso_id, 'fallido', { motivo: 'error_meta', errorCode: r.errorCode }, esperaReintentoMs);
        return 'fallido';
    } catch (error: any) {
        console.error(`[avisos-cancelacion] Error inesperado con el aviso ${aviso?.aviso_id}:`, error?.message ?? error);
        await reportar(aviso.aviso_id, 'fallido', { motivo: 'error_bot' }, esperaReintentoMs);
        return 'fallido';
    }
}

/** Un sondeo completo. Exportado para probarlo sin temporizadores. */
export async function sondearAvisosCancelacion(
    opciones: { pausaMs?: number; esperaReintentoMs?: number } = {}
): Promise<ResumenSondeoAvisos> {
    const resumen: ResumenSondeoAvisos = { reservados: 0, enviados: 0, fallidos: 0, descartados: 0 };
    if (!tokenCancelacionAutomatica()) {
        if (!sinTokenLogueado) {
            sinTokenLogueado = true;
            console.error('[avisos-cancelacion] CANCELACION_AUTOMATICA_TOKEN no está configurado: no se envían avisos de cita cancelada.');
        }
        return resumen;
    }
    const pausaMs = opciones.pausaMs ?? PAUSA_ENTRE_ENVIOS_MS;
    const esperaReintentoMs = opciones.esperaReintentoMs ?? ESPERA_REINTENTO_REPORTE_MS;

    const data = await reservarAvisosCancelacion(LIMITE_POR_SONDEO);
    const avisos = data?.avisos ?? [];
    resumen.reservados = avisos.length;
    for (let i = 0; i < avisos.length; i++) {
        const resultado = await procesarAviso(avisos[i], esperaReintentoMs);
        if (resultado === 'enviado') resumen.enviados++;
        else if (resultado === 'descartado') resumen.descartados++;
        else resumen.fallidos++;
        if (i < avisos.length - 1) await dormir(pausaMs);
    }
    const descartadosBackend = Object.values(data?.descartados ?? {}).reduce((s, n) => s + n, 0);
    if (avisos.length > 0 || descartadosBackend > 0) {
        console.log(
            `[avisos-cancelacion] reservados=${resumen.reservados} enviados=${resumen.enviados} fallidos=${resumen.fallidos} ` +
            `descartados=${resumen.descartados} descartados_backend=${JSON.stringify(data?.descartados ?? {})}`
        );
    }
    return resumen;
}

/**
 * Guarda de ejecución única (mismo patrón que la cascada): nunca corren dos sondeos a la vez. Una llamada que llega
 * durante un sondeo deja pendiente UNO más al terminar.
 */
let sondeoEnCurso = false;
let sondeoPendiente = false;

async function sondearSerializado(): Promise<void> {
    if (sondeoEnCurso) {
        sondeoPendiente = true;
        return;
    }
    sondeoEnCurso = true;
    try {
        do {
            sondeoPendiente = false;
            await sondearAvisosCancelacion();
        } while (sondeoPendiente);
    } finally {
        sondeoEnCurso = false;
    }
}

/** Arranca el sondeo periódico. Se llama una sola vez desde app.ts. */
export function startAvisosCancelacionPoller(): void {
    if (pollerIniciado) return;
    pollerIniciado = true;
    const crudo = Number(process.env.AVISOS_CANCELACION_POLL_INTERVAL_MS);
    const intervaloMs = Number.isInteger(crudo) && crudo >= 10_000 ? crudo : DEFAULT_POLL_INTERVAL_MS;
    console.log(`[avisos-cancelacion] Poller de avisos de cita cancelada iniciado (cada ${intervaloMs} ms).`);
    setInterval(() => {
        sondearSerializado().catch((error) => console.error('[avisos-cancelacion] Error en el sondeo programado:', error?.message ?? error));
    }, intervaloMs);
}

/** Sondeo inmediato, fire-and-forget. Nunca lanza. */
export function triggerAvisosCancelacionNow(): void {
    sondearSerializado().catch((error) => console.error('[avisos-cancelacion] Error en el sondeo inmediato:', error?.message ?? error));
}

/** Solo para pruebas: ejecuta la guarda de ejecución única. */
export function _sondearSerializadoParaPruebas(): Promise<void> {
    return sondearSerializado();
}

/** Solo para pruebas: reinicia el estado del módulo. */
export function _resetAvisosPollerParaPruebas(): void {
    pollerIniciado = false;
    sinTokenLogueado = false;
    sondeoEnCurso = false;
    sondeoPendiente = false;
}
