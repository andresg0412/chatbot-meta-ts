// Mapeo de respuestas de `confirmarcitameta` y `recordatorios/responder` a resultados con detalle
// (proyecto-ips/docs/features/2026-09-27-confirmar-cita-ya-confirmada.md, 4.3 y 4.6). Axios simulado:
// no se llama al backend.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

import axios from 'axios';
import { confirmarCitaCampahna, responderRecordatorio } from '../apiService';

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
        });
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
