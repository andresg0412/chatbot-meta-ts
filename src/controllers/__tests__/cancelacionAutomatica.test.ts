// Cancelación automática de citas Pendiente de mañana: orquestación del bot.
// Diseño: proyecto-ips/docs/features/2026-10-17-cancelacion-automatica-pendientes.md, secciones 5 y 8.
//
// Se usa el apiService REAL con axios simulado: así se comprueba, además de la orquestación, que todas las llamadas
// van al backend (con el token en el header) y que NINGUNA sale hacia Meta/WhatsApp (decisión D2: no se avisa al paciente).
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));
jest.mock('../../utils/listaEsperaCascadaPoller', () => ({ triggerCascadaTickNow: jest.fn() }));

import axios from 'axios';
import { API_BACKEND_URL } from '../../services/apiService';
import { triggerCascadaTickNow } from '../../utils/listaEsperaCascadaPoller';
import {
    cancelacionAutomaticaEnCurso,
    ejecutarCancelacionAutomatica,
    executeCancelacionAutomaticaCampaign,
    validarSolicitudCancelacionAutomatica,
} from '../cancelacionAutomaticaCampaignController';

const post = (axios as any).post as jest.Mock;
const tick = triggerCascadaTickNow as jest.Mock;
const ENV_ORIGINAL = { ...process.env };
const TOKEN = 'token-secreto-de-prueba-0123456789';

const cand = (n: number) => ({ agenda_id: `AG00000${n}`, cita_id: 3460000 + n, fecha_cita: '2026-10-18', hora_cita: '07:00' });
const ok = (data: unknown) => ({ status: 200, data: { isError: false, data, code: 200 } });

interface Guion {
    preparar?: any;
    /** Resultado por agenda_id; si falta, 'cancelada'. Un Error se lanza como fallo HTTP. */
    cancelar?: Record<string, any>;
}

/** Simula el backend: responde según la URL. Devuelve las llamadas hechas para inspeccionarlas. */
function simularBackend(g: Guion) {
    post.mockImplementation(async (url: string, body: any) => {
        if (url.endsWith('/cancelacion-automatica/preparar')) return ok(g.preparar);
        if (url.endsWith('/cancelacion-automatica/cancelar')) {
            const r = g.cancelar?.[body.agenda_id] ?? { modo: 'activo', resultado: 'cancelada', motivo: null };
            if (r instanceof Error) throw r;
            return ok(r);
        }
        if (url.endsWith('/cancelacion-automatica/finalizar')) return ok({ ejecucion_id: body.ejecucion_id, estado: 'finalizada' });
        throw new Error(`URL inesperada: ${url}`);
    });
}

const preparada = (candidatas: any[], over: Record<string, unknown> = {}) => ({
    modo: 'activo', ejecucion_id: 'EJEC0001', fecha_objetivo: '2026-10-18', candidatas, omitidas: {}, abortada: null, ...over,
});

const llamadasA = (sufijo: string) => post.mock.calls.filter((c) => String(c[0]).endsWith(sufijo));

/** Espera a que termine la corrida en segundo plano que lanzó el endpoint. */
async function esperarFin() {
    for (let i = 0; i < 200 && cancelacionAutomaticaEnCurso(); i++) await new Promise((r) => setImmediate(r));
}

function respuesta() {
    const r: any = { status: 0, cuerpo: undefined as any };
    r.writeHead = (s: number) => { r.status = s; };
    r.end = (c: string) => { r.cuerpo = JSON.parse(c); };
    return r;
}

let log: jest.SpyInstance, warn: jest.SpyInstance, err: jest.SpyInstance;

beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ENV_ORIGINAL, CANCELACION_AUTOMATICA_TOKEN: TOKEN, CANCELACION_AUTOMATICA_PAUSA_MS: '0' };
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
    await esperarFin();
    jest.restoreAllMocks();
    process.env = { ...ENV_ORIGINAL };
});

describe('ejecutarCancelacionAutomatica', () => {
    it('modo apagado: no pide cancelar nada, no cierra nada y no dispara la cascada', async () => {
        simularBackend({ preparar: { modo: 'apagado', ejecucion_id: null, fecha_objetivo: null, candidatas: [], omitidas: {}, abortada: null } });

        const r = await ejecutarCancelacionAutomatica('cron');

        expect(r.estado).toBe('apagado');
        expect(post).toHaveBeenCalledTimes(1);
        expect(llamadasA('/cancelar')).toHaveLength(0);
        expect(llamadasA('/finalizar')).toHaveLength(0);
        expect(tick).not.toHaveBeenCalled();
    });

    it('una candidata cancelada: la cancela, cierra la ejecución, dispara la cascada UNA vez y no envía ningún WhatsApp', async () => {
        simularBackend({ preparar: preparada([cand(1)]) });

        const r = await ejecutarCancelacionAutomatica('cron');

        expect(r).toMatchObject({ estado: 'procesada', candidatas: 1, canceladas: 1, errores: 0 });
        expect(post.mock.calls.map((c) => String(c[0]))).toEqual([
            `${API_BACKEND_URL}/chatbot/cancelacion-automatica/preparar`,
            `${API_BACKEND_URL}/chatbot/cancelacion-automatica/cancelar`,
            `${API_BACKEND_URL}/chatbot/cancelacion-automatica/finalizar`,
        ]);
        expect(post.mock.calls[1][1]).toEqual({ ejecucion_id: 'EJEC0001', agenda_id: 'AG000001' });
        expect(post.mock.calls[2][1]).toEqual({ ejecucion_id: 'EJEC0001' });
        expect(tick).toHaveBeenCalledTimes(1);
        // D2: nada hacia Meta/WhatsApp.
        for (const [url] of post.mock.calls) expect(String(url)).not.toMatch(/graph\.facebook\.com|messages/);
        expect((axios as any).get).not.toHaveBeenCalled();
    });

    it('las tres llamadas al backend llevan el token en el header x-cancelacion-token', async () => {
        simularBackend({ preparar: preparada([cand(1)]) });
        await ejecutarCancelacionAutomatica('manual');
        expect(post).toHaveBeenCalledTimes(3);
        for (const llamada of post.mock.calls) expect(llamada[2].headers).toEqual({ 'x-cancelacion-token': TOKEN });
        expect(post.mock.calls[0][1]).toEqual({ origen: 'manual' });
    });

    it('cancela en serie y en el orden recibido; el tick de la cascada sale una sola vez al final', async () => {
        simularBackend({ preparar: preparada([cand(1), cand(2), cand(3)]) });
        const orden: string[] = [];
        post.mockImplementation(async (url: string, body: any) => {
            if (url.endsWith('/preparar')) return ok(preparada([cand(1), cand(2), cand(3)]));
            if (url.endsWith('/cancelar')) { orden.push(`cancelar:${body.agenda_id}`); return ok({ modo: 'activo', resultado: 'cancelada', motivo: null }); }
            orden.push('finalizar');
            return ok({});
        });
        tick.mockImplementation(() => orden.push('tick'));

        const r = await ejecutarCancelacionAutomatica('cron');

        expect(r.canceladas).toBe(3);
        expect(orden).toEqual(['cancelar:AG000001', 'cancelar:AG000002', 'cancelar:AG000003', 'finalizar', 'tick']);
    });

    it('simulación: registra las simuladas y NO dispara la cascada', async () => {
        simularBackend({
            preparar: preparada([cand(1), cand(2)], { modo: 'simulacion' }),
            cancelar: { AG000001: { modo: 'simulacion', resultado: 'simulada' }, AG000002: { modo: 'simulacion', resultado: 'simulada' } },
        });

        const r = await ejecutarCancelacionAutomatica('cron');

        expect(r).toMatchObject({ modo: 'simulacion', simuladas: 2, canceladas: 0 });
        expect(tick).not.toHaveBeenCalled();
    });

    it('cuenta aparte las omitidas al revalidar y los errores, y la cascada solo sale si algo se canceló', async () => {
        simularBackend({
            preparar: preparada([cand(1), cand(2), cand(3)]),
            cancelar: {
                AG000001: { modo: 'activo', resultado: 'omitida', motivo: 'confirmada_despues' },
                AG000002: { modo: 'activo', resultado: 'error', motivo: 'error_globho' },
                AG000003: { modo: 'activo', resultado: 'omitida', motivo: 'ya_no_pendiente' },
            },
        });

        const r = await ejecutarCancelacionAutomatica('cron');

        expect(r).toMatchObject({ canceladas: 0, errores: 1, omitidas: 2 });
        expect(tick).not.toHaveBeenCalled();
        expect(llamadasA('/finalizar')).toHaveLength(1);
    });

    it('si una llamada a cancelar falla por HTTP, cuenta el error, sigue con las demás y cierra la ejecución', async () => {
        simularBackend({
            preparar: preparada([cand(1), cand(2)]),
            cancelar: { AG000001: Object.assign(new Error('timeout'), { response: { status: 502, data: { cause: 'BAD_GATEWAY' } } }) },
        });

        const r = await ejecutarCancelacionAutomatica('cron');

        expect(r).toMatchObject({ canceladas: 1, errores: 1 });
        expect(llamadasA('/cancelar')).toHaveLength(2);
        expect(llamadasA('/finalizar')).toHaveLength(1);
        expect(tick).toHaveBeenCalledTimes(1);
    });

    it('ejecución abortada por el backend (p. ej. supera_maximo): no cancela, la cierra y lo informa', async () => {
        simularBackend({ preparar: preparada([], { abortada: 'supera_maximo', omitidas: { sin_aviso_confirmacion: 3 } }) });

        const r = await ejecutarCancelacionAutomatica('cron');

        expect(r).toMatchObject({ estado: 'abortada', abortada: 'supera_maximo', omitidas: 3 });
        expect(llamadasA('/cancelar')).toHaveLength(0);
        expect(llamadasA('/finalizar')).toHaveLength(1);
        expect(tick).not.toHaveBeenCalled();
    });

    it('sin candidatas: cierra la ejecución y termina', async () => {
        simularBackend({ preparar: preparada([]) });
        const r = await ejecutarCancelacionAutomatica('cron');
        expect(r.estado).toBe('sin_candidatas');
        expect(llamadasA('/cancelar')).toHaveLength(0);
        expect(llamadasA('/finalizar')).toHaveLength(1);
    });

    it('si el backend no responde a preparar (token malo, red, 5xx) no hace nada más', async () => {
        post.mockRejectedValue(Object.assign(new Error('x'), { response: { status: 401, data: { cause: 'UNAUTHORIZED' } } }));

        const r = await ejecutarCancelacionAutomatica('cron');

        expect(r.estado).toBe('sin_respuesta');
        expect(post).toHaveBeenCalledTimes(1);
        expect(tick).not.toHaveBeenCalled();
    });

    it('si la bandera se apaga a mitad de la corrida deja de cancelar, pero cierra la ejecución', async () => {
        simularBackend({
            preparar: preparada([cand(1), cand(2), cand(3)]),
            cancelar: { AG000002: { modo: 'apagado', resultado: null, motivo: null } },
        });

        const r = await ejecutarCancelacionAutomatica('cron');

        expect(r.canceladas).toBe(1);
        expect(llamadasA('/cancelar')).toHaveLength(2); // la tercera ya no se pide
        expect(llamadasA('/finalizar')).toHaveLength(1);
    });

    it('hace una pausa entre cita y cita (no después de la última)', async () => {
        process.env.CANCELACION_AUTOMATICA_PAUSA_MS = '40';
        simularBackend({ preparar: preparada([cand(1), cand(2), cand(3)]) });

        const t0 = Date.now();
        await ejecutarCancelacionAutomatica('cron');

        expect(Date.now() - t0).toBeGreaterThanOrEqual(70); // 2 pausas de 40 ms
    });
});

describe('seguridad del token', () => {
    it('sin CANCELACION_AUTOMATICA_TOKEN no llama al backend, ni siquiera a preparar', async () => {
        process.env.CANCELACION_AUTOMATICA_TOKEN = '   ';

        const r = await ejecutarCancelacionAutomatica('cron');

        expect(r.estado).toBe('sin_respuesta');
        expect(post).not.toHaveBeenCalled();
    });

    it('el token no aparece en ningún log, ni siquiera cuando el error de axios lo trae en su config', async () => {
        const errorAxios = Object.assign(new Error('Request failed with status code 401'), {
            response: { status: 401, data: { cause: 'UNAUTHORIZED' } },
            config: { headers: { 'x-cancelacion-token': TOKEN } },
        });
        post.mockRejectedValue(errorAxios);
        await ejecutarCancelacionAutomatica('cron');

        simularBackend({ preparar: preparada([cand(1)]), cancelar: { AG000001: errorAxios } });
        await ejecutarCancelacionAutomatica('cron');

        const impreso = [...log.mock.calls, ...warn.mock.calls, ...err.mock.calls].flat().map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n');
        expect(impreso.length).toBeGreaterThan(0);
        expect(impreso).not.toContain(TOKEN);
    });
});

describe('POST /v1/campaigns/cancelacion-automatica', () => {
    it('responde 202 { aceptado: true } enseguida y procesa en segundo plano', async () => {
        simularBackend({ preparar: preparada([cand(1)]) });
        const res = respuesta();

        await executeCancelacionAutomaticaCampaign({ body: { origen: 'cron' } }, res);

        expect(res.status).toBe(202);
        expect(res.cuerpo).toEqual({ aceptado: true });
        await esperarFin();
        expect(llamadasA('/cancelar')).toHaveLength(1);
        expect(tick).toHaveBeenCalledTimes(1);
    });

    it('dos llamadas seguidas: la segunda recibe 409 mientras la primera sigue en curso, y después se libera el candado', async () => {
        let liberar!: () => void;
        const bloqueo = new Promise<void>((r) => { liberar = r; });
        post.mockImplementation(async (url: string, body: any) => {
            if (url.endsWith('/preparar')) { await bloqueo; return ok(preparada([cand(1)])); }
            if (url.endsWith('/cancelar')) return ok({ modo: 'activo', resultado: 'cancelada', motivo: null });
            return ok({ ejecucion_id: body.ejecucion_id });
        });
        const a = respuesta();
        const b = respuesta();

        await executeCancelacionAutomaticaCampaign({ body: {} }, a);
        await executeCancelacionAutomaticaCampaign({ body: {} }, b);

        expect(a.status).toBe(202);
        expect(b.status).toBe(409);
        expect(b.cuerpo).toEqual({ estado: 'en_curso' });

        liberar();
        await esperarFin();
        expect(cancelacionAutomaticaEnCurso()).toBe(false);
        expect(llamadasA('/preparar')).toHaveLength(1); // la segunda nunca llegó al backend

        simularBackend({ preparar: preparada([]) });
        const c = respuesta();
        await executeCancelacionAutomaticaCampaign({ body: {} }, c);
        expect(c.status).toBe(202);
    });

    it('el candado se libera aunque la corrida falle con una excepción', async () => {
        post.mockImplementation(async () => { throw new Error('boom'); });
        const res = respuesta();
        await executeCancelacionAutomaticaCampaign({ body: {} }, res);
        await esperarFin();
        expect(cancelacionAutomaticaEnCurso()).toBe(false);
    });

    it('con el token vacío responde 200 no_iniciada/config_incompleta y no llama al backend', async () => {
        process.env.CANCELACION_AUTOMATICA_TOKEN = '';
        const res = respuesta();

        await executeCancelacionAutomaticaCampaign({ body: {} }, res);

        expect(res.status).toBe(200);
        expect(res.cuerpo).toEqual({ estado: 'no_iniciada', motivo: 'config_incompleta' });
        expect(post).not.toHaveBeenCalled();
        expect(cancelacionAutomaticaEnCurso()).toBe(false);
    });

    it.each([[{ origen: 'otro' }], [{ otro: 1 }], [[]], ['texto']])('body inválido %j → 400 sin llamar al backend', async (body) => {
        const res = respuesta();
        await executeCancelacionAutomaticaCampaign({ body }, res);
        expect(res.status).toBe(400);
        expect(post).not.toHaveBeenCalled();
    });

    it('acepta un body vacío (el cron manda {"origen":"cron"} pero un curl a mano puede no mandar nada)', async () => {
        simularBackend({ preparar: preparada([]) });
        const res = respuesta();
        await executeCancelacionAutomaticaCampaign({}, res);
        expect(res.status).toBe(202);
        await esperarFin();
        expect(post.mock.calls[0][1]).toEqual({ origen: 'cron' });
    });
});

describe('validarSolicitudCancelacionAutomatica', () => {
    it('origen por defecto "cron"; acepta "manual"', () => {
        expect(validarSolicitudCancelacionAutomatica(undefined)).toEqual({ ok: true, origen: 'cron' });
        expect(validarSolicitudCancelacionAutomatica({})).toEqual({ ok: true, origen: 'cron' });
        expect(validarSolicitudCancelacionAutomatica({ origen: 'manual' })).toEqual({ ok: true, origen: 'manual' });
    });
});
