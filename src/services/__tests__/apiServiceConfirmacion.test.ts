// Mapeo de respuestas de `confirmarcitameta` y `recordatorios/responder` a resultados con detalle
// (proyecto-ips/docs/features/2026-09-27-confirmar-cita-ya-confirmada.md, 4.3 y 4.6). Axios simulado:
// no se llama al backend.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

import axios from 'axios';
import { confirmarCitaCampahna, responderRecordatorio, consultarCitasRecordatorio, TIMEOUT_BACKEND_RECORDATORIOS_MS } from '../apiService';

const post = (axios as any).post as jest.Mock;

/** Error con la forma de un AxiosError con respuesta HTTP. */
function errorHttp(status: number, body?: any) {
    const error: any = new Error(`Request failed with status code ${status}`);
    error.response = { status, data: body };
    return error;
}

const DETALLE = { fecha_cita: '2026-09-28', hora_cita: '10:00:00', especialidad: 'X' };

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    (console.error as jest.Mock).mockRestore();
});

describe('confirmarCitaCampahna', () => {
    it('envía {celular, documento} a /chatbot/confirmarcitameta', async () => {
        post.mockResolvedValueOnce({ data: { code: 200, data: { estado_resultado: 'confirmada' } } });
        await confirmarCitaCampahna('573001234567', '1234567890');
        expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/chatbot\/confirmarcitameta$/), {
            celular: '573001234567',
            documento: '1234567890',
        });
    });

    it('200 confirmada con detalle', async () => {
        post.mockResolvedValueOnce({
            data: { code: 200, isError: false, data: { cita_id: '1', estado_resultado: 'confirmada', ...DETALLE } },
        });
        expect(await confirmarCitaCampahna('c', 'd')).toEqual({ ok: true, estado: 'confirmada', ...DETALLE });
    });

    it('200 ya_confirmada', async () => {
        post.mockResolvedValueOnce({ data: { code: 200, data: { cita_id: '1', estado_resultado: 'ya_confirmada', ...DETALLE } } });
        expect(await confirmarCitaCampahna('c', 'd')).toEqual({ ok: true, estado: 'ya_confirmada', ...DETALLE });
    });

    it('200 sin estado_resultado (backend viejo, data primitivo) → confirmada', async () => {
        post.mockResolvedValueOnce({ data: { code: 200, data: '3465294' } });
        expect(await confirmarCitaCampahna('c', 'd')).toEqual({ ok: true, estado: 'confirmada' });
    });

    it('200 sin estado_resultado (backend viejo, data objeto) → confirmada', async () => {
        post.mockResolvedValueOnce({ data: { code: 200, data: { cita_id: '1', celular: 'c' } } });
        expect(await confirmarCitaCampahna('c', 'd')).toEqual({ ok: true, estado: 'confirmada' });
    });

    it.each(['CITA_CANCELADA', 'CITA_REPROGRAMADA', 'CITA_PASADA'])('404 %s con data', async (cause) => {
        post.mockRejectedValueOnce(errorHttp(404, { isError: true, code: 404, cause, data: DETALLE }));
        expect(await confirmarCitaCampahna('c', 'd')).toEqual({ ok: false, causa: cause, ...DETALLE });
    });

    it('404 CITA_NOT_FOUND sin data', async () => {
        post.mockRejectedValueOnce(errorHttp(404, { isError: true, code: 404, cause: 'CITA_NOT_FOUND' }));
        expect(await confirmarCitaCampahna('c', 'd')).toEqual({ ok: false, causa: 'CITA_NOT_FOUND' });
    });

    it('404 sin cause → CITA_NOT_FOUND', async () => {
        post.mockRejectedValueOnce(errorHttp(404, { isError: true, code: 404 }));
        expect(await confirmarCitaCampahna('c', 'd')).toEqual({ ok: false, causa: 'CITA_NOT_FOUND' });
    });

    it('404 con cause desconocida → CITA_NOT_FOUND', async () => {
        post.mockRejectedValueOnce(errorHttp(404, { cause: 'OTRA_COSA' }));
        expect(await confirmarCitaCampahna('c', 'd')).toEqual({ ok: false, causa: 'CITA_NOT_FOUND' });
    });

    it('400 (validación de Fastify) → DOCUMENTO_INVALIDO', async () => {
        post.mockRejectedValueOnce(errorHttp(400, { statusCode: 400, error: 'Bad Request', message: 'body/documento must NOT have fewer than 5 characters' }));
        expect(await confirmarCitaCampahna('c', 'd')).toEqual({ ok: false, causa: 'DOCUMENTO_INVALIDO' });
    });

    it('502 GLOBHO_ERROR', async () => {
        post.mockRejectedValueOnce(errorHttp(502, { isError: true, code: 502, cause: 'GLOBHO_ERROR' }));
        expect(await confirmarCitaCampahna('c', 'd')).toEqual({ ok: false, causa: 'GLOBHO_ERROR' });
    });

    it('502 sin cause → ERROR', async () => {
        post.mockRejectedValueOnce(errorHttp(502, 'Bad Gateway'));
        expect(await confirmarCitaCampahna('c', 'd')).toEqual({ ok: false, causa: 'ERROR' });
    });

    it('500 INTERNAL_SERVER_ERROR → ERROR', async () => {
        post.mockRejectedValueOnce(errorHttp(500, { isError: true, code: 500, cause: 'INTERNAL_SERVER_ERROR' }));
        expect(await confirmarCitaCampahna('c', 'd')).toEqual({ ok: false, causa: 'ERROR' });
    });

    it('error de red (sin response) → ERROR', async () => {
        const error: any = new Error('connect ECONNREFUSED');
        error.code = 'ECONNREFUSED';
        post.mockRejectedValueOnce(error);
        expect(await confirmarCitaCampahna('c', 'd')).toEqual({ ok: false, causa: 'ERROR' });
    });

    it('2xx con code distinto de 200 → ERROR', async () => {
        post.mockResolvedValueOnce({ data: { code: 500 } });
        expect(await confirmarCitaCampahna('c', 'd')).toEqual({ ok: false, causa: 'ERROR' });
    });
});

describe('responderRecordatorio', () => {
    it('envía {celular, documento, respuesta} a /chatbot/recordatorios/responder', async () => {
        post.mockResolvedValueOnce({ data: { code: 200, data: { accion: 'confirma', persistido: true } } });
        await responderRecordatorio('573001234567', '1234567890', 'confirma');
        expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/chatbot\/recordatorios\/responder$/), {
            celular: '573001234567',
            documento: '1234567890',
            respuesta: 'confirma',
        }, { timeout: TIMEOUT_BACKEND_RECORDATORIOS_MS });
    });

    it('con cita_id lo envía en el body (TB-05)', async () => {
        post.mockResolvedValueOnce({ data: { code: 200, data: { accion: 'no_asistira', persistido: true } } });
        await responderRecordatorio('573001234567', '1234567890', 'no_asistira', 'A9897918');
        expect(post).toHaveBeenCalledWith(expect.any(String), {
            celular: '573001234567', documento: '1234567890', respuesta: 'no_asistira', cita_id: 'A9897918',
        }, { timeout: TIMEOUT_BACKEND_RECORDATORIOS_MS });
    });

    it('payload de confirmación omite documento y envía via=payload', async () => {
        post.mockResolvedValueOnce({ data: { code: 200, data: { accion: 'confirma', persistido: true } } });
        await responderRecordatorio('573001234567', '', 'confirma', 'A9897918', 'payload');
        expect(post).toHaveBeenCalledWith(expect.any(String), {
            celular: '573001234567', respuesta: 'confirma', cita_id: 'A9897918', via: 'payload',
        }, { timeout: TIMEOUT_BACKEND_RECORDATORIOS_MS });
    });

    it('200 del contrato TB-05 (ya_cancelada) se devuelve completo', async () => {
        const data = { cita_id: 'A9897918', agenda_id_externa: 5206177, fecha_cita: '2026-10-10', hora_cita: '07:50',
            profesional: 'Ana Pérez', estado_resultado: 'ya_cancelada', accion: 'no_asistira', agenda_id: 'A9897918', persistido: true };
        post.mockResolvedValueOnce({ data: { isError: false, code: 200, data } });
        expect(await responderRecordatorio('c', 'd', 'no_asistira', 'A9897918')).toEqual({ ok: true, data });
    });

    it('409 CITA_AMBIGUA → citas del backend', async () => {
        const cita = { cita_id: 'A9897918', agenda_id_externa: 5206177, fecha_cita: '2026-10-10', hora_cita: '07:50',
            profesional: 'Ana Pérez', tipo_recordatorio: '24h', estado_agenda: 'Pendiente' };
        post.mockRejectedValueOnce(errorHttp(409, { isError: true, cause: 'CITA_AMBIGUA', data: { origen: 'recordatorio', citas: [cita, { sin: 'id' }] } }));
        expect(await responderRecordatorio('c', 'd', 'confirma')).toEqual({ ok: false, causa: 'CITA_AMBIGUA', citas: [cita] });
    });

    it.each(['OTRO_PACIENTE', 'NO_ACTIVA', 'PASADA'])('409 CITA_NO_VALIDA motivo %s', async (motivo) => {
        post.mockRejectedValueOnce(errorHttp(409, { isError: true, cause: 'CITA_NO_VALIDA', data: { motivo } }));
        expect(await responderRecordatorio('c', 'd', 'no_asistira', 'X')).toEqual({ ok: false, causa: 'CITA_NO_VALIDA', motivo });
    });

    it('409 RESPUESTA_EN_PROCESO', async () => {
        post.mockRejectedValueOnce(errorHttp(409, { isError: true, cause: 'RESPUESTA_EN_PROCESO' }));
        expect(await responderRecordatorio('c', 'd', 'no_asistira', 'X')).toEqual({ ok: false, causa: 'RESPUESTA_EN_PROCESO' });
    });

    it('409 sin cause conocida → CITA_NO_VALIDA sin motivo', async () => {
        post.mockRejectedValueOnce(errorHttp(409, {}));
        expect(await responderRecordatorio('c', 'd', 'confirma', 'X')).toEqual({ ok: false, causa: 'CITA_NO_VALIDA', motivo: null });
    });

    it('502 GLOBHO_ERROR (confirma) → GLOBHO_ERROR', async () => {
        post.mockRejectedValueOnce(errorHttp(502, { isError: true, cause: 'GLOBHO_ERROR' }));
        expect(await responderRecordatorio('c', 'd', 'confirma', 'X')).toEqual({ ok: false, causa: 'GLOBHO_ERROR' });
    });

    it('timeout de axios → ERROR', async () => {
        const error: any = new Error('timeout of 25000ms exceeded');
        error.code = 'ECONNABORTED';
        post.mockRejectedValueOnce(error);
        expect(await responderRecordatorio('c', 'd', 'no_asistira', 'X')).toEqual({ ok: false, causa: 'ERROR' });
    });

    it('200 con estado_resultado', async () => {
        const data = { accion: 'confirma', agenda_id: 'A1', persistido: true, estado_resultado: 'ya_confirmada', fecha_cita: '2026-09-28', hora_cita: '10:00:00' };
        post.mockResolvedValueOnce({ data: { code: 200, data } });
        expect(await responderRecordatorio('c', 'd', 'confirma')).toEqual({ ok: true, data });
    });

    it('200 sin estado_resultado (backend viejo)', async () => {
        const data = { accion: 'no_asistira', agenda_id: 'A1', persistido: false };
        post.mockResolvedValueOnce({ data: { code: 200, data } });
        expect(await responderRecordatorio('c', 'd', 'no_asistira')).toEqual({ ok: true, data });
    });

    it('200 sin data → ERROR', async () => {
        post.mockResolvedValueOnce({ data: { code: 200 } });
        expect(await responderRecordatorio('c', 'd', 'confirma')).toEqual({ ok: false, causa: 'ERROR' });
    });

    it.each(['CITA_CANCELADA', 'CITA_REPROGRAMADA', 'CITA_PASADA'])('404 %s con fecha y hora', async (cause) => {
        post.mockRejectedValueOnce(errorHttp(404, { isError: true, cause, data: DETALLE }));
        expect(await responderRecordatorio('c', 'd', 'confirma')).toEqual({ ok: false, causa: cause, ...DETALLE });
    });

    it('404 CITA_NOT_FOUND', async () => {
        post.mockRejectedValueOnce(errorHttp(404, { isError: true, cause: 'CITA_NOT_FOUND' }));
        expect(await responderRecordatorio('c', 'd', 'confirma')).toEqual({ ok: false, causa: 'CITA_NOT_FOUND' });
    });

    it('404 sin cause → CITA_NOT_FOUND', async () => {
        post.mockRejectedValueOnce(errorHttp(404, {}));
        expect(await responderRecordatorio('c', 'd', 'confirma')).toEqual({ ok: false, causa: 'CITA_NOT_FOUND' });
    });

    it('400 → DOCUMENTO_INVALIDO', async () => {
        post.mockRejectedValueOnce(errorHttp(400, { statusCode: 400 }));
        expect(await responderRecordatorio('c', 'd', 'confirma')).toEqual({ ok: false, causa: 'DOCUMENTO_INVALIDO' });
    });

    it('500 (incluye fallos de Globho en este endpoint) → ERROR', async () => {
        post.mockRejectedValueOnce(errorHttp(500, { isError: true, cause: 'INTERNAL_SERVER_ERROR' }));
        expect(await responderRecordatorio('c', 'd', 'no_asistira')).toEqual({ ok: false, causa: 'ERROR' });
    });

    it('error de red → ERROR', async () => {
        post.mockRejectedValueOnce(new Error('timeout of 10000ms exceeded'));
        expect(await responderRecordatorio('c', 'd', 'confirma')).toEqual({ ok: false, causa: 'ERROR' });
    });
});

describe('consultarCitasRecordatorio (TB-05)', () => {
    const cita = { cita_id: 'A9897918', agenda_id_externa: 5206177, fecha_cita: '2026-10-10', hora_cita: '07:50',
        profesional: 'Ana Pérez', tipo_recordatorio: '24h', estado_agenda: 'Pendiente' };

    it('envía {documento, celular} con timeout y devuelve origen y citas', async () => {
        post.mockResolvedValueOnce({ status: 200, data: { isError: false, code: 200, data: { origen: 'recordatorio', citas: [cita] } } });
        expect(await consultarCitasRecordatorio('1098768121', '573001112233')).toEqual({ ok: true, origen: 'recordatorio', citas: [cita] });
        expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/chatbot\/recordatorios\/citas$/),
            { documento: '1098768121', celular: '573001112233' }, { timeout: TIMEOUT_BACKEND_RECORDATORIOS_MS });
    });

    it('lista vacía → ok con 0 citas', async () => {
        post.mockResolvedValueOnce({ status: 200, data: { data: { origen: 'citas_activas', citas: [] } } });
        expect(await consultarCitasRecordatorio('d', 'c')).toEqual({ ok: true, origen: 'citas_activas', citas: [] });
    });

    it('como máximo 10 citas y solo las que traen cita_id', async () => {
        const muchas = Array.from({ length: 12 }, (_, i) => ({ ...cita, cita_id: `C${i}` }));
        post.mockResolvedValueOnce({ status: 200, data: { data: { origen: 'citas_activas', citas: [{ cita_id: '' }, ...muchas] } } });
        const r: any = await consultarCitasRecordatorio('d', 'c');
        expect(r.citas).toHaveLength(10);
        expect(r.citas[0].cita_id).toBe('C0');
    });

    it('404 PACIENTE_NOT_FOUND', async () => {
        post.mockRejectedValueOnce(errorHttp(404, { isError: true, cause: 'PACIENTE_NOT_FOUND' }));
        expect(await consultarCitasRecordatorio('d', 'c')).toEqual({ ok: false, causa: 'PACIENTE_NOT_FOUND', httpStatus: 404 });
    });

    it('400 → DOCUMENTO_INVALIDO; 500 / red / data sin citas → ERROR', async () => {
        post.mockRejectedValueOnce(errorHttp(400, {}));
        expect(await consultarCitasRecordatorio('d', 'c')).toEqual({ ok: false, causa: 'DOCUMENTO_INVALIDO', httpStatus: 400 });
        post.mockRejectedValueOnce(errorHttp(500, {}));
        expect(await consultarCitasRecordatorio('d', 'c')).toEqual({ ok: false, causa: 'ERROR', httpStatus: 500 });
        post.mockRejectedValueOnce(new Error('timeout of 25000ms exceeded'));
        expect(await consultarCitasRecordatorio('d', 'c')).toEqual({ ok: false, causa: 'ERROR', httpStatus: null });
        post.mockResolvedValueOnce({ status: 200, data: { data: {} } });
        expect(await consultarCitasRecordatorio('d', 'c')).toEqual({ ok: false, causa: 'ERROR', httpStatus: 200 });
    });
});
