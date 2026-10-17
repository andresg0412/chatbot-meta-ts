// Cancelación automática de las citas Pendiente del día siguiente.
//   POST /v1/campaigns/cancelacion-automatica   body { origen?: 'cron' | 'manual' }   (el cron lo llama a las 13:10)
//
// El bot SOLO orquesta; la lógica de negocio vive en el backend (bandera, selección, frenos de seguridad, Globho,
// lista de espera). No se envía NINGÚN mensaje al paciente (decisión D2): este controlador no importa nada de
// WhatsApp. Diseño: proyecto-ips/docs/features/2026-10-17-cancelacion-automatica-pendientes.md, secciones 1 y 5.2.
//
// Respuestas:
//   - body inválido ............................ 400
//   - sin CANCELACION_AUTOMATICA_TOKEN ......... 200 { estado: 'no_iniciada', motivo: 'config_incompleta' } (no llama al backend)
//   - ya hay una corrida en curso (candado) .... 409 { estado: 'en_curso' }
//   - arranque ................................. 202 { aceptado: true } y el proceso sigue en segundo plano
// Sin token en este endpoint, igual que las otras campañas: el crontab está en git y no debe llevar secretos. Quien lo
// llame solo dispara la misma tarea con las mismas reglas del backend (hora mínima, una ejecución en curso a la vez,
// revalidación por cita). El token protege las rutas del backend, que es donde están los datos.

import {
    cancelarCitaAutomatica,
    finalizarCancelacionAutomatica,
    prepararCancelacionAutomatica,
    tokenCancelacionAutomatica,
} from '../services/apiService';
import type { OrigenCancelacionAutomatica } from '../services/apiService';
import { triggerCascadaTickNow } from '../utils/listaEsperaCascadaPoller';

/** Pausa entre una cita y la siguiente, para no saturar a Globho. Configurable con CANCELACION_AUTOMATICA_PAUSA_MS. */
export const PAUSA_MS_POR_DEFECTO = 500;

/** Candado en memoria: el bot corre en una sola instancia (PM2 fork), así que basta para evitar corridas solapadas. */
let enCurso = false;
export const cancelacionAutomaticaEnCurso = () => enCurso;

/** Milisegundos de pausa entre citas. Vacío o inválido = default; 0 la desactiva (útil en pruebas). */
export function pausaEntreCitasMs(): number {
    const crudo = (process.env.CANCELACION_AUTOMATICA_PAUSA_MS ?? '').trim();
    if (crudo === '') return PAUSA_MS_POR_DEFECTO;
    const valor = Number(crudo);
    return Number.isInteger(valor) && valor >= 0 ? valor : PAUSA_MS_POR_DEFECTO;
}

const dormir = (ms: number) => (ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

/** Resumen de una corrida. Solo conteos: nunca ids de pacientes ni datos personales. */
export interface ResumenCancelacionAutomatica {
    /** `sin_respuesta`: el backend no contestó o rechazó la llamada (token, red, 5xx). */
    estado: 'apagado' | 'sin_respuesta' | 'sin_candidatas' | 'abortada' | 'procesada';
    modo: string | null;
    candidatas: number;
    canceladas: number;
    simuladas: number;
    omitidas: number;
    errores: number;
    /** Motivo si el backend abortó la ejecución completa. */
    abortada: string | null;
}

const resumenVacio = (estado: ResumenCancelacionAutomatica['estado'], modo: string | null = null): ResumenCancelacionAutomatica => ({
    estado, modo, candidatas: 0, canceladas: 0, simuladas: 0, omitidas: 0, errores: 0, abortada: null,
});

/**
 * Una corrida completa: preparar → cancelar (una cita a la vez, en serie y con pausa) → finalizar → tick de la cascada.
 * Si el bot se cae a la mitad no pasa nada grave: cada cita se revalida en el backend y una nueva ejecución solo toma las
 * que sigan Pendiente. Exportada para poder probarla sin HTTP.
 */
export async function ejecutarCancelacionAutomatica(origen: OrigenCancelacionAutomatica): Promise<ResumenCancelacionAutomatica> {
    const preparada = await prepararCancelacionAutomatica(origen);
    if (!preparada) {
        console.error('[cancelacion-automatica] El backend no respondió a "preparar"; no se cancela nada.');
        return resumenVacio('sin_respuesta');
    }
    if (preparada.modo === 'apagado') {
        console.log('[cancelacion-automatica] Apagada (CANCELACION_AUTOMATICA_ENABLED=false en el backend). No se hace nada.');
        return resumenVacio('apagado', 'apagado');
    }

    const ejecucionId = preparada.ejecucion_id;
    const candidatas = preparada.candidatas ?? [];
    const omitidas = Object.values(preparada.omitidas ?? {}).reduce((s, n) => s + n, 0);

    if (preparada.abortada || candidatas.length === 0 || !ejecucionId) {
        // Una ejecución abortada o sin candidatas igual se cierra, para no dejarla abierta en el backend.
        if (ejecucionId) await finalizarCancelacionAutomatica(ejecucionId);
        const estado = preparada.abortada ? 'abortada' : 'sin_candidatas';
        console.log(
            `[cancelacion-automatica] modo=${preparada.modo} fecha=${preparada.fecha_objetivo} ${estado}` +
            `${preparada.abortada ? ` (${preparada.abortada})` : ''} omitidas=${omitidas} ${JSON.stringify(preparada.omitidas ?? {})}`
        );
        return { ...resumenVacio(estado, preparada.modo), omitidas, abortada: preparada.abortada };
    }

    const resumen: ResumenCancelacionAutomatica = { ...resumenVacio('procesada', preparada.modo), candidatas: candidatas.length, omitidas };
    const pausa = pausaEntreCitasMs();

    for (let i = 0; i < candidatas.length; i++) {
        const respuesta = await cancelarCitaAutomatica(ejecucionId, candidatas[i].agenda_id);
        if (!respuesta) {
            resumen.errores++; // el backend no contestó: la cita queda como estaba y la siguiente corrida la reintenta
        } else if (respuesta.modo === 'apagado') {
            // Alguien apagó la bandera a mitad de la corrida: no se sigue cancelando.
            console.warn('[cancelacion-automatica] La bandera se apagó durante la corrida; se detiene.');
            break;
        } else if (respuesta.resultado === 'cancelada') resumen.canceladas++;
        else if (respuesta.resultado === 'simulada') resumen.simuladas++;
        else if (respuesta.resultado === 'error') resumen.errores++;
        else resumen.omitidas++; // omitida al revalidar (se confirmó, ya no estaba Pendiente...)

        if (i < candidatas.length - 1) await dormir(pausa);
    }

    await finalizarCancelacionAutomatica(ejecucionId);

    // Las citas canceladas dejaron cupos: la cascada empieza a ofrecerlos sin esperar el sondeo de 60 s. En simulación
    // no se canceló nada, así que no hay nada que ofrecer. Es fire-and-forget y nunca lanza.
    if (resumen.canceladas > 0) triggerCascadaTickNow();

    console.log(
        `[cancelacion-automatica] modo=${resumen.modo} candidatas=${resumen.candidatas} canceladas=${resumen.canceladas} ` +
        `simuladas=${resumen.simuladas} omitidas=${resumen.omitidas} errores=${resumen.errores}`
    );
    return resumen;
}

function responder(res: any, status: number, cuerpo: Record<string, unknown>) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(cuerpo));
}

type Validacion = { ok: true; origen: OrigenCancelacionAutomatica } | { ok: false; error: string };

/** Acepta un cuerpo vacío o { origen?: 'cron' | 'manual' }; cualquier otro campo se rechaza. Default: 'cron'. */
export function validarSolicitudCancelacionAutomatica(body: unknown): Validacion {
    if (body === undefined || body === null || body === '') return { ok: true, origen: 'cron' };
    if (typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'El body debe ser un objeto JSON.' };
    const campos = body as Record<string, unknown>;
    const extra = Object.keys(campos).find((k) => k !== 'origen');
    if (extra) return { ok: false, error: `Campo no permitido: ${extra}` };
    if (campos.origen === undefined) return { ok: true, origen: 'cron' };
    if (campos.origen !== 'cron' && campos.origen !== 'manual') return { ok: false, error: "origen debe ser 'cron' o 'manual'." };
    return { ok: true, origen: campos.origen };
}

export const executeCancelacionAutomaticaCampaign = async (req: any, res: any) => {
    try {
        const validacion = validarSolicitudCancelacionAutomatica(req?.body);
        if (validacion.ok === false) return responder(res, 400, { error: validacion.error });

        // Sin token el backend rechazaría todo: se avisa de forma visible en el log del cron en vez de aceptar y fallar callado.
        if (!tokenCancelacionAutomatica()) {
            console.error('[cancelacion-automatica] CANCELACION_AUTOMATICA_TOKEN no está configurado; no se inicia la corrida.');
            return responder(res, 200, { estado: 'no_iniciada', motivo: 'config_incompleta' });
        }
        if (enCurso) return responder(res, 409, { estado: 'en_curso' });

        // El candado se toma de forma síncrona (antes de cualquier await) y se libera siempre, pase lo que pase.
        enCurso = true;
        ejecutarCancelacionAutomatica(validacion.origen)
            .catch((error) => console.error('[cancelacion-automatica] La corrida terminó con error:', (error as any)?.message ?? error))
            .finally(() => {
                enCurso = false;
            });
        return responder(res, 202, { aceptado: true });
    } catch (error) {
        console.error('[cancelacion-automatica] Error en el endpoint:', (error as any)?.message ?? error);
        return responder(res, 500, { error: 'Error interno ejecutando la cancelación automática' });
    }
};
