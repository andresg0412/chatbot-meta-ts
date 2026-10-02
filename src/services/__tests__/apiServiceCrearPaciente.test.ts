// Respuestas de POST /chatbot/crearpaciente (revisión 2026-10-01, A3). Axios simulado: sin red.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

import axios from 'axios';
import { crearPacienteDataBase } from '../apiService';
import { crearPaciente } from '../../utils/consultarCitasPorDocumento';

const post = (axios as any).post as jest.Mock;

function errorHttp(status: number, body?: any) {
    const error: any = new Error(`Request failed with status code ${status}`);
    error.response = { status, data: body };
    return error;
}

const PAYLOAD = { tipo_documento: 'PT', numero_documento: '1234567' };

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    (console.error as jest.Mock).mockRestore();
});

describe('crearPacienteDataBase / crearPaciente', () => {
    it('envía el body a /chatbot/crearpaciente', async () => {
        post.mockResolvedValueOnce({ status: 201, data: { code: 201, data: { pacientes_id: 'AB12CD34' } } });
        await crearPacienteDataBase(PAYLOAD);
        expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/chatbot\/crearpaciente$/), PAYLOAD);
    });

    it('201 creado → ok con su pacientes_id', async () => {
        post.mockResolvedValueOnce({ status: 201, data: { code: 201, data: { pacientes_id: 'AB12CD34' } } });
        expect(await crearPaciente(PAYLOAD)).toEqual({ ok: true, pacienteId: 'AB12CD34', yaExistia: false });
    });

    it('200 con ya_existia → éxito con el pacientes_id existente', async () => {
        post.mockResolvedValueOnce({ status: 200, data: { code: 200, data: { pacientes_id: 'EXIST001', ya_existia: true } } });
        expect(await crearPaciente(PAYLOAD)).toEqual({ ok: true, pacienteId: 'EXIST001', yaExistia: true });
    });

    it('2xx sin pacientes_id → ERROR', async () => {
        post.mockResolvedValueOnce({ status: 201, data: { code: 201, data: {} } });
        expect(await crearPaciente(PAYLOAD)).toEqual({ ok: false, pacienteId: null, yaExistia: false, causa: 'ERROR' });
    });

    it.each([
        ['VALIDATION_ERROR', 'VALIDATION_ERROR'],
        ['FECHA_NACIMIENTO_INVALIDA', 'FECHA_NACIMIENTO_INVALIDA'],
        ['OTRA_COSA', 'VALIDATION_ERROR'],
        [undefined, 'VALIDATION_ERROR'],
    ])('400 cause %p → causa %p', async (cause, esperado) => {
        post.mockRejectedValueOnce(errorHttp(400, { isError: true, cause, message: 'body/x must ...', code: 400 }));
        expect(await crearPaciente(PAYLOAD)).toEqual({ ok: false, pacienteId: null, yaExistia: false, causa: esperado });
    });

    it.each([[500], [502], [undefined]])('status %p → ERROR, nunca lanza', async (status) => {
        post.mockRejectedValueOnce(status ? errorHttp(status as number, { cause: 'INTERNAL_SERVER_ERROR' }) : new Error('ECONNREFUSED'));
        await expect(crearPaciente(PAYLOAD)).resolves.toEqual({ ok: false, pacienteId: null, yaExistia: false, causa: 'ERROR' });
    });
});
