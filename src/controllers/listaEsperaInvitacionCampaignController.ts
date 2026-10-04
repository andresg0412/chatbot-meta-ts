// Endpoints de las campañas de invitación a la lista de espera:
//   POST /v1/campaigns/lista-espera-regularizacion
//     body { fecha_desde?: 'YYYY-MM-DD', fecha_hasta?: 'YYYY-MM-DD', limite?: 1..300 (50),
//            modo_previsualizacion?: boolean (false), origen?: 'manual' | 'cron' ('manual') }
//   POST /v1/campaigns/lista-espera-continua
//     body { modo_previsualizacion?: boolean }  (límite = LISTA_ESPERA_INVITACION_LIMITE_CONTINUA, origen 'cron',
//            no acepta fechas: 3.2 del requerimiento, "no aceptar un modo que envíe duplicados")
// Respuestas (proyecto-ips/docs/features/2026-10-04-campanas-invitacion-lista-espera-implementacion.md, 6.5):
//   - previsualización: 200 síncrono con el `data` de GET /candidatas (no exige el interruptor);
//   - interruptor apagado: 200 { estado: 'deshabilitada' } sin llamar al backend;
//   - kill switch apagado o sin NOMBRE_PLANTILLA_LE_INVITACION: 200 { estado: 'no_iniciada', motivo:
//     'bot_deshabilitado' | 'config_incompleta' } sin llamar al backend;
//   - campaña en curso (candado en memoria): 409 { estado: 'en_curso' };
//   - arranque: 202 { estado: 'iniciada', campana, limite } y el proceso sigue en segundo plano;
//   - body inválido: 400.
// Sin token (decisión P3); los topes están en el backend (MAX_POR_EJECUCION), el interruptor, la ventana de
// contacto y el candado (riesgo R4).

import { previsualizarInvitaciones } from '../services/apiService';
import type { CampanaTipoInvitacion, OrigenEjecucionInvitacion } from '../services/apiService';
import { isInvitacionListaEsperaEnabled } from '../utils/listaEsperaFlags';
import { esBotHabilitado } from '../services/citasService';
import {
    campanaInvitacionEnCurso,
    ejecutarCampanaInvitacion,
    limiteContinua,
    nombrePlantillaInvitacion,
    telefonosPilotoFormato57,
    LIMITE_DEFAULT_REGULARIZACION,
    LIMITE_MAXIMO_INVITACION,
} from '../templates/flujos/listaEspera/campanaInvitacion';
import type { ParametrosEjecucionInvitacion } from '../templates/flujos/listaEspera/campanaInvitacion';

const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function fechaValida(valor: string): boolean {
    if (!REGEX_FECHA.test(valor)) return false;
    const [y, m, d] = valor.split('-').map(Number);
    const fecha = new Date(Date.UTC(y, m - 1, d));
    return fecha.getUTCFullYear() === y && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}

function responder(res: any, status: number, cuerpo: Record<string, unknown>) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(cuerpo));
}

interface SolicitudValidada {
    previsualizacion: boolean;
    params: ParametrosEjecucionInvitacion;
}

type Validacion = { ok: true; valor: SolicitudValidada } | { ok: false; error: string };

function cuerpoComoObjeto(body: unknown): Record<string, unknown> | null {
    if (body === undefined || body === null || body === '') return {};
    if (typeof body !== 'object' || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
}

function validarModo(valor: unknown): boolean | null {
    if (valor === undefined) return false;
    return typeof valor === 'boolean' ? valor : null;
}

export function validarSolicitudRegularizacion(bodyCrudo: unknown): Validacion {
    const body = cuerpoComoObjeto(bodyCrudo);
    if (!body) return { ok: false, error: 'El body debe ser un objeto JSON.' };
    const permitidos = ['fecha_desde', 'fecha_hasta', 'limite', 'modo_previsualizacion', 'origen'];
    const extra = Object.keys(body).find((k) => !permitidos.includes(k));
    if (extra) return { ok: false, error: `Campo no permitido: ${extra}` };

    const previsualizacion = validarModo(body.modo_previsualizacion);
    if (previsualizacion === null) return { ok: false, error: 'modo_previsualizacion debe ser booleano.' };

    for (const campo of ['fecha_desde', 'fecha_hasta'] as const) {
        const valor = body[campo];
        if (valor !== undefined && (typeof valor !== 'string' || !fechaValida(valor))) {
            return { ok: false, error: `${campo} debe tener el formato YYYY-MM-DD.` };
        }
    }
    const fechaDesde = body.fecha_desde as string | undefined;
    const fechaHasta = body.fecha_hasta as string | undefined;
    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
        return { ok: false, error: 'fecha_desde no puede ser posterior a fecha_hasta.' };
    }

    let limite = LIMITE_DEFAULT_REGULARIZACION;
    if (body.limite !== undefined) {
        if (typeof body.limite !== 'number' || !Number.isInteger(body.limite) || body.limite < 1 || body.limite > LIMITE_MAXIMO_INVITACION) {
            return { ok: false, error: `limite debe ser un entero entre 1 y ${LIMITE_MAXIMO_INVITACION}.` };
        }
        limite = body.limite;
    }

    let origen: OrigenEjecucionInvitacion = 'manual';
    if (body.origen !== undefined) {
        if (body.origen !== 'manual' && body.origen !== 'cron') return { ok: false, error: "origen debe ser 'manual' o 'cron'." };
        origen = body.origen;
    }

    return {
        ok: true,
        valor: {
            previsualizacion,
            params: { limite, origen, fecha_desde: fechaDesde ?? null, fecha_hasta: fechaHasta ?? null },
        },
    };
}

export function validarSolicitudContinua(bodyCrudo: unknown): Validacion {
    const body = cuerpoComoObjeto(bodyCrudo);
    if (!body) return { ok: false, error: 'El body debe ser un objeto JSON.' };
    const extra = Object.keys(body).find((k) => k !== 'modo_previsualizacion');
    if (extra) return { ok: false, error: `Campo no permitido: ${extra} (la campaña continua solo acepta modo_previsualizacion).` };
    const previsualizacion = validarModo(body.modo_previsualizacion);
    if (previsualizacion === null) return { ok: false, error: 'modo_previsualizacion debe ser booleano.' };
    return { ok: true, valor: { previsualizacion, params: { limite: limiteContinua(), origen: 'cron' } } };
}

async function atender(tipo: CampanaTipoInvitacion, validacion: Validacion, res: any) {
    if (validacion.ok === false) return responder(res, 400, { error: validacion.error });
    const { previsualizacion, params } = validacion.valor;

    if (previsualizacion) {
        const pilotos = telefonosPilotoFormato57();
        const resultado = await previsualizarInvitaciones({
            campana_tipo: tipo,
            fecha_desde: params.fecha_desde ?? null,
            fecha_hasta: params.fecha_hasta ?? null,
            ...(pilotos.length > 0 ? { solo_telefonos: pilotos } : {}),
        });
        if (resultado.ok === true) return responder(res, 200, { ...(resultado.data ?? {}) });
        const status = resultado.code !== null && resultado.code >= 400 && resultado.code < 500 ? resultado.code : 502;
        return responder(res, status, { error: 'previsualizacion_fallida', cause: resultado.cause });
    }

    if (!isInvitacionListaEsperaEnabled()) return responder(res, 200, { estado: 'deshabilitada' });
    // Mismas condiciones del paso 1 del ejecutor, validadas ANTES del 202 para no anunciar una campaña
    // que no va a arrancar (QA T-09).
    if (!esBotHabilitado()) return responder(res, 200, { estado: 'no_iniciada', motivo: 'bot_deshabilitado' });
    if (!nombrePlantillaInvitacion()) return responder(res, 200, { estado: 'no_iniciada', motivo: 'config_incompleta' });
    if (campanaInvitacionEnCurso(tipo)) return responder(res, 409, { estado: 'en_curso' });

    // Toma el candado de forma síncrona (antes del primer await del ejecutor) y sigue en segundo plano.
    ejecutarCampanaInvitacion(tipo, params).catch((error) =>
        console.error(`[invitaciones] La campaña ${tipo} terminó con error:`, (error as any)?.message ?? error)
    );
    return responder(res, 202, { estado: 'iniciada', campana: tipo, limite: params.limite });
}

export const executeListaEsperaRegularizacionCampaign = async (req: any, res: any) => {
    try {
        return await atender('regularizacion', validarSolicitudRegularizacion(req?.body), res);
    } catch (error) {
        console.error('[invitaciones] Error en el endpoint de regularización:', (error as any)?.message ?? error);
        return responder(res, 500, { error: 'Error interno ejecutando campaña' });
    }
};

export const executeListaEsperaContinuaCampaign = async (req: any, res: any) => {
    try {
        return await atender('continua', validarSolicitudContinua(req?.body), res);
    } catch (error) {
        console.error('[invitaciones] Error en el endpoint de la campaña continua:', (error as any)?.message ?? error);
        return responder(res, 500, { error: 'Error interno ejecutando campaña' });
    }
};
