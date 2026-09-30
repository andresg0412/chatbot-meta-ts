// B5 de trazabilidad (docs/features/2026-09-29-trazabilidad-usuarios.md, 4.3.4 y 11.2): las funciones de
// envío devuelven { exito, mensajeWaId?, errorCode?, errorTitulo? } y emiten `wa_envio`. axios simulado.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

import axios from 'axios';
import {
    enviarPlantillaConfirmacion,
    enviarPlantillaRecordatorio24h,
    enviarPlantillaDiaria,
    enviarPlantillaRecordatorio,
    enviarPlantillaRecuperar,
    enviarPlantillaUsuariosConAsistencia,
    enviarPlantillaOfertaCupo,
    enviarMensajeTextoMeta,
} from '../apiService';
import { _estadoParaPruebas, _resetParaPruebas } from '../../utils/trazabilidad';

const post = (axios as any).post as jest.Mock;
const ENV_ORIGINAL = { ...process.env };
const cita: any = {
    cita_id: 'ab12cd34',
    nombre_paciente: 'Paciente',
    especialidad: 'Especialidad',
    fecha_cita: '2026-10-05T05:00:00.000Z',
    hora_cita: '14:00:00',
    profesional: 'Profesional',
    tipo_cita: 1,
    administradora: null,
    telefono_paciente: '3001234567',
};
const waEnvios = () => _estadoParaPruebas().cola.filter((e) => e.tipo_evento === 'wa_envio');

beforeEach(() => {
    jest.clearAllMocks();
    _resetParaPruebas();
    process.env = {
        ...ENV_ORIGINAL,
        TRAZABILIDAD_V2_ENABLED: 'true',
        numberId: 'NUM',
        jwtToken: 'TOKEN',
        NOMBRE_PLANTILLA_META: 'p_execute',
        NOMBRE_PLANTILLA_META_CONFIRMADO_24H: 'p_execute_conf',
        NOMBRE_PLANTILLA_META_DIARIA: 'p_daily',
        NOMBRE_PLANTILLA_RECORDATORIO_META: 'p_reminder',
        NOMBRE_PLANTILLA_META_CANCELADOS: 'p_recuperacion',
        NOMBRE_PLANTILLA_META_ASISTIDOS: 'p_conasistencia',
        NOMBRE_PLANTILLA_OFERTA_CUPO: 'p_oferta',
    };
    delete process.env.API_BACKEND_URL; // la cola no se envía: se inspecciona en memoria
    delete process.env.RECORDATORIOS_BOTONES_ENABLED;
    post.mockResolvedValue({ status: 200, data: { messages: [{ id: 'wamid.1', message_status: 'accepted' }] } });
    for (const m of ['log', 'error', 'warn'] as const) jest.spyOn(console, m).mockImplementation(() => undefined);
});
afterEach(() => {
    _resetParaPruebas();
    jest.restoreAllMocks();
    process.env = { ...ENV_ORIGINAL };
});

describe.each([
    ['enviarPlantillaConfirmacion', enviarPlantillaConfirmacion, 'execute', 'p_execute'],
    ['enviarPlantillaRecordatorio24h', enviarPlantillaRecordatorio24h, 'execute', 'p_execute_conf'],
    ['enviarPlantillaDiaria', enviarPlantillaDiaria, 'daily', 'p_daily'],
    ['enviarPlantillaRecordatorio', enviarPlantillaRecordatorio, 'reminder', 'p_reminder'],
    ['enviarPlantillaRecuperar', enviarPlantillaRecuperar, 'recuperacion', 'p_recuperacion'],
    ['enviarPlantillaUsuariosConAsistencia', enviarPlantillaUsuariosConAsistencia, 'conasistencia', 'p_conasistencia'],
])('%s', (_nombre, fn: any, campana, plantilla) => {
    it('aceptado → { exito, mensajeWaId } y wa_envio con campaña, ejecución, plantilla y agenda_id de primer nivel (no cita_id_externa)', async () => {
        await expect(fn(cita, 'EJEC-1')).resolves.toEqual({ exito: true, mensajeWaId: 'wamid.1' });
        const [evento] = waEnvios();
        expect(evento).toEqual(expect.objectContaining({
            telefono: '3001234567',
            campana,
            campana_ejecucion_id: 'EJEC-1',
            wa_message_id: 'wamid.1',
            resultado: 'aceptado',
            agenda_id: 'ab12cd34',
        }));
        expect(evento.metadata).toEqual({ plantilla, tipo_envio: 'plantilla', error_code: null, error_titulo: null });
        expect(evento.cita_id_externa).toBeUndefined();
        expect(evento.sesion_id).toBeUndefined();
    });

    it('error de Meta → { exito:false, errorCode, errorTitulo } y wa_envio rechazado_api (sin datos del paciente)', async () => {
        post.mockRejectedValueOnce({
            response: { status: 400, data: { error: { code: 131026, message: 'Message undeliverable' } } },
            config: { data: '{"to":"3001234567","nombre":"Paciente"}' },
        });
        await expect(fn(cita)).resolves.toEqual({ exito: false, errorCode: '131026', errorTitulo: 'Message undeliverable' });
        const [evento] = waEnvios();
        expect(evento).toEqual(expect.objectContaining({ resultado: 'rechazado_api', campana }));
        expect(evento.metadata).toEqual(expect.objectContaining({ error_code: '131026', error_titulo: 'Message undeliverable' }));
        expect(JSON.stringify(evento)).not.toContain('Paciente');
    });

    it('message_status distinto de accepted → exito false con el wamid y el estado como código', async () => {
        post.mockResolvedValueOnce({ status: 200, data: { messages: [{ id: 'wamid.2', message_status: 'paused' }] } });
        await expect(fn(cita)).resolves.toEqual({ exito: false, mensajeWaId: 'wamid.2', errorCode: 'status_paused', errorTitulo: 'message_status=paused' });
    });
});

it('agenda_id que no cumple ^[A-Za-z0-9]{1,8}$ se omite', async () => {
    await enviarPlantillaRecordatorio({ ...cita, cita_id: 'demasiado-largo-123' });
    const [evento] = waEnvios();
    expect(evento.agenda_id).toBeUndefined();
    expect(evento.metadata).not.toHaveProperty('agenda_id');
});

it('con el interruptor apagado no se emite wa_envio (el resultado del envío es el mismo)', async () => {
    process.env.TRAZABILIDAD_V2_ENABLED = 'false';
    await expect(enviarPlantillaRecordatorio(cita)).resolves.toEqual({ exito: true, mensajeWaId: 'wamid.1' });
    expect(waEnvios()).toHaveLength(0);
});

it('oferta de cupo → wa_envio campaña oferta_cupo', async () => {
    await enviarPlantillaOfertaCupo('Paciente', '573001234567', 'Profesional', '2026-10-05', '14:00:00', 10);
    expect(waEnvios()[0]).toEqual(expect.objectContaining({ campana: 'oferta_cupo', resultado: 'aceptado', wa_message_id: 'wamid.1', telefono: '573001234567' }));
    expect(waEnvios()[0].metadata?.plantilla).toBe('p_oferta');
});

it('texto al asesor → wa_envio aviso_asesor tipo texto, sin el texto del aviso', async () => {
    post.mockResolvedValueOnce({ status: 200, data: { messages: [{ id: 'wamid.9' }] } });
    await enviarMensajeTextoMeta('573158070460', 'ALERTA con datos SENSIBLES');
    const [evento] = waEnvios();
    expect(evento).toEqual(expect.objectContaining({ campana: 'aviso_asesor', resultado: 'aceptado', wa_message_id: 'wamid.9' }));
    expect(evento.metadata?.tipo_envio).toBe('texto');
    expect(JSON.stringify(evento)).not.toContain('SENSIBLES');
});
