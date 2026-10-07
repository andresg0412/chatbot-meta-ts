// Fase 3 (3.1-4): un teléfono inválido en medio de una campaña cuenta como error y NO detiene el lote.
// axios simulado: nunca se llama a Meta; se comprueba cuántos mensajes salen de verdad.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

jest.mock('../../services/apiService', () => {
    const real = jest.requireActual('../../services/apiService');
    return {
        ...real,
        obtenerCitasCanceladasAbandonadas: jest.fn(),
        registrarActividadBot: jest.fn(async () => true),
    };
});

import axios from 'axios';
import * as api from '../../services/apiService';
import { ejecutarCampahnaRecuperacionCore } from '../../templates/flujos/campahna/campahnaRecuperacion';

const post = (axios as any).post as jest.Mock;
const mockedApi = api as jest.Mocked<typeof api>;

const cita = (telefono: string, nombre: string): any => ({
    cita_id: 'A1000001', agenda_id_externa: 1, nombre_paciente: nombre, telefono_paciente: telefono,
    fecha_cita: '2026-10-10', hora_cita: '07:50', profesional: 'Ana Pérez', especialidad: 'Psicología',
    estado_agenda: 'Cancelado', administradora: 'Particular', tipo_cita: 'Control',
});

beforeEach(() => {
    jest.clearAllMocks();
    process.env.numberId = '123';
    process.env.jwtToken = 'token';
    post.mockResolvedValue({ data: { messages: [{ id: 'wamid.OK', message_status: 'accepted' }] } });
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

it('una cita con teléfono 123405923 entre dos válidas: envía 2, cuenta 1 error y recorre todo el lote', async () => {
    mockedApi.obtenerCitasCanceladasAbandonadas.mockResolvedValue([
        cita('3214593929', 'Uno'), cita('123405923', 'Dos'), cita('573214593930', 'Tres'),
    ]);
    const resultado: any = await ejecutarCampahnaRecuperacionCore('endpoint');
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls.map((c) => c[1].to)).toEqual(['573214593929', '573214593930']);
    expect(resultado).toMatchObject({ total_procesados: 3, exitosos: 2, errores: 1 });
}, 20000);
