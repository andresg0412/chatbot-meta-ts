// 502 GLOBHO_ERROR al mover una cita: `reagendarCita` (menú) y `responderOfertaCupo` (cascada).
// Contrato: proyecto-ips/docs/features/2026-10-01-revision-pruebas-reales.md, anexo "aceptar oferta".
// Axios simulado: no se llama al backend, a Globho ni a Meta.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));
jest.mock('../../utils/metrics', () => ({
    metricCita: jest.fn(),
    metricError: jest.fn(),
    metricFlujoFinalizado: jest.fn(),
}));

import axios from 'axios';
import { reagendarCita, responderOfertaCupo } from '../apiService';
import { metricCita } from '../../utils/metrics';

const post = (axios as any).post as jest.Mock;

function errorHttp(status: number, body?: any) {
    const error: any = new Error(`Request failed with status code ${status}`);
    error.response = { status, data: body };
    return error;
}

function body502(restaurada?: boolean) {
    return {
        isError: true,
        cause: 'GLOBHO_ERROR',
        message: 'Error en Globho',
        code: 502,
        timestamp: '2026-10-02T04:22:14.000Z',
        data: restaurada === undefined ? {} : { cita_anterior_restaurada: restaurada },
    };
}

const BODY_REAGENDAR: any = { cita_anterior: { cita_id: 5206177 }, nueva_cita: { fecha_cita: '2026-10-10' } };

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    (console.error as jest.Mock).mockRestore();
});

describe('reagendarCita', () => {
    it('éxito: devuelve la cita y cuenta la métrica', async () => {
        const cita = { idAgenda: 'X', especialidad: 'E' };
        post.mockResolvedValueOnce({ status: 200, data: { code: 200, data: cita } });
        expect(await reagendarCita(BODY_REAGENDAR)).toEqual({ ok: true, cita });
        expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/chatbot\/reagendar$/), BODY_REAGENDAR);
        expect(metricCita).toHaveBeenCalledWith('reagendada');
    });

    it('200 sin data sigue siendo error (igual que antes, cuando devolvía null)', async () => {
        post.mockResolvedValueOnce({ status: 200, data: { code: 200, data: null } });
        expect(await reagendarCita(BODY_REAGENDAR)).toEqual({ ok: false, error: 'ERROR', code: 200 });
    });

    it('502 GLOBHO_ERROR con cita_anterior_restaurada=true', async () => {
        post.mockRejectedValueOnce(errorHttp(502, body502(true)));
        expect(await reagendarCita(BODY_REAGENDAR)).toEqual({
            ok: false, error: 'GLOBHO_ERROR', code: 502, citaAnteriorRestaurada: true,
        });
        expect(metricCita).not.toHaveBeenCalled();
    });

    it('502 GLOBHO_ERROR con cita_anterior_restaurada=false', async () => {
        post.mockRejectedValueOnce(errorHttp(502, body502(false)));
        expect(await reagendarCita(BODY_REAGENDAR)).toEqual({
            ok: false, error: 'GLOBHO_ERROR', code: 502, citaAnteriorRestaurada: false,
        });
    });

    it('502 GLOBHO_ERROR sin el campo → no restaurada', async () => {
        post.mockRejectedValueOnce(errorHttp(502, body502()));
        expect(await reagendarCita(BODY_REAGENDAR)).toMatchObject({ error: 'GLOBHO_ERROR', citaAnteriorRestaurada: false });
    });

    it('502 con otra cause → error genérico', async () => {
        post.mockRejectedValueOnce(errorHttp(502, { isError: true, cause: 'OTRA' }));
        expect(await reagendarCita(BODY_REAGENDAR)).toEqual({ ok: false, error: 'ERROR', code: 502 });
    });

    it('500 → error genérico', async () => {
        post.mockRejectedValueOnce(errorHttp(500, { isError: true, cause: 'INTERNAL' }));
        expect(await reagendarCita(BODY_REAGENDAR)).toEqual({ ok: false, error: 'ERROR', code: 500 });
    });

    it('error de red sin respuesta → error genérico sin code', async () => {
        post.mockRejectedValueOnce(new Error('ECONNREFUSED'));
        expect(await reagendarCita(BODY_REAGENDAR)).toEqual({ ok: false, error: 'ERROR' });
    });
});

describe('responderOfertaCupo', () => {
    it('éxito: igual que antes', async () => {
        const data = { nueva_fecha_cita: '2026-10-03', nueva_hora_cita: '07:00:00' };
        post.mockResolvedValueOnce({ status: 200, data: { code: 200, data } });
        expect(await responderOfertaCupo('1098768121', '573185215524', 'acepta')).toEqual({ ok: true, code: 200, data });
        expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/chatbot\/listaespera\/cascada\/respuesta$/), {
            documento: '1098768121', celular: '573185215524', respuesta: 'acepta',
        });
    });

    it('502 GLOBHO_ERROR con true: extrae cause y citaAnteriorRestaurada, conserva el body', async () => {
        const body = body502(true);
        post.mockRejectedValueOnce(errorHttp(502, body));
        expect(await responderOfertaCupo('d', 'c', 'acepta')).toEqual({
            ok: false, code: 502, data: body, cause: 'GLOBHO_ERROR', citaAnteriorRestaurada: true,
        });
    });

    it('502 GLOBHO_ERROR con false', async () => {
        post.mockRejectedValueOnce(errorHttp(502, body502(false)));
        expect(await responderOfertaCupo('d', 'c', 'acepta')).toMatchObject({
            ok: false, code: 502, cause: 'GLOBHO_ERROR', citaAnteriorRestaurada: false,
        });
    });

    it('500: sin citaAnteriorRestaurada', async () => {
        const body = { isError: true, cause: 'INTERNAL', code: 500 };
        post.mockRejectedValueOnce(errorHttp(500, body));
        const r = await responderOfertaCupo('d', 'c', 'acepta');
        expect(r).toEqual({ ok: false, code: 500, data: body, cause: 'INTERNAL' });
        expect(r).not.toHaveProperty('citaAnteriorRestaurada');
    });

    it('404 y 409 conservan code (los flujos los siguen distinguiendo)', async () => {
        post.mockRejectedValueOnce(errorHttp(404, { cause: 'SIN_OFERTA_ACTIVA' }));
        expect(await responderOfertaCupo('d', 'c', 'acepta')).toMatchObject({ ok: false, code: 404, cause: 'SIN_OFERTA_ACTIVA' });
        post.mockRejectedValueOnce(errorHttp(409, { cause: 'CUPO_YA_ASIGNADO' }));
        expect(await responderOfertaCupo('d', 'c', 'acepta')).toMatchObject({ ok: false, code: 409, cause: 'CUPO_YA_ASIGNADO' });
    });
});

// T-01 (informe QA, sección 10 "TB-03"): 502 POSTGRES_DESPUES_DE_GLOBHO, la cita SÍ quedó movida en Globho.
function body502Postgres(data: Record<string, unknown> = { cita_creada_en_globho: true, cita_anterior_restaurada: false }) {
    return {
        isError: true,
        cause: 'POSTGRES_DESPUES_DE_GLOBHO',
        message: 'La cita se movió en Globho pero no se registró en el sistema',
        code: 502,
        timestamp: '2026-10-03T15:00:00.000Z',
        data,
    };
}

describe('POSTGRES_DESPUES_DE_GLOBHO', () => {
    it('reagendarCita: lo distingue de GLOBHO_ERROR y de ERROR (sin horario: el contrato de reagendar no lo trae)', async () => {
        post.mockRejectedValueOnce(errorHttp(502, body502Postgres()));
        expect(await reagendarCita(BODY_REAGENDAR)).toEqual({ ok: false, error: 'POSTGRES_DESPUES_DE_GLOBHO', code: 502 });
        expect(metricCita).not.toHaveBeenCalled();
    });

    it('reagendarCita: si el backend manda nueva_fecha_cita/nueva_hora_cita, se devuelven', async () => {
        post.mockRejectedValueOnce(errorHttp(502, body502Postgres({
            cita_creada_en_globho: true, cita_anterior_restaurada: false, nueva_fecha_cita: '2026-10-10', nueva_hora_cita: '07:00:00',
        })));
        expect(await reagendarCita(BODY_REAGENDAR)).toEqual({
            ok: false, error: 'POSTGRES_DESPUES_DE_GLOBHO', code: 502, nuevaFechaCita: '2026-10-10', nuevaHoraCita: '07:00:00',
        });
    });

    it('reagendarCita: la misma cause con otro status no se reconoce (contrato: 502)', async () => {
        post.mockRejectedValueOnce(errorHttp(500, body502Postgres()));
        expect(await reagendarCita(BODY_REAGENDAR)).toEqual({ ok: false, error: 'ERROR', code: 500 });
    });

    it('responderOfertaCupo: extrae cause y el nuevo horario, conserva el body y no marca citaAnteriorRestaurada', async () => {
        const body = body502Postgres({
            cita_creada_en_globho: true, cita_anterior_restaurada: false, nueva_fecha_cita: '2026-10-10', nueva_hora_cita: '07:00:00',
        });
        post.mockRejectedValueOnce(errorHttp(502, body));
        const r = await responderOfertaCupo('d', 'c', 'acepta');
        expect(r).toEqual({
            ok: false, code: 502, data: body, cause: 'POSTGRES_DESPUES_DE_GLOBHO', nuevaFechaCita: '2026-10-10', nuevaHoraCita: '07:00:00',
        });
        expect(r).not.toHaveProperty('citaAnteriorRestaurada');
    });

    it('responderOfertaCupo: sin horario en data, no inventa campos', async () => {
        post.mockRejectedValueOnce(errorHttp(502, body502Postgres()));
        const r = await responderOfertaCupo('d', 'c', 'acepta');
        expect(r).toMatchObject({ ok: false, code: 502, cause: 'POSTGRES_DESPUES_DE_GLOBHO' });
        expect(r).not.toHaveProperty('nuevaFechaCita');
        expect(r).not.toHaveProperty('nuevaHoraCita');
    });
});
