// Trazabilidad con el motor REAL de @builderbot y los flujos registrados (mismo arnés que
// flujosBotonesEngine.test.ts; sin Meta ni backend). Verifica la regla de `campana_respuesta` de la
// tabla 11.2 (una sola vez por respuesta, antes de pedir el documento, con la campaña correcta) y que
// ningún evento lleve texto libre del paciente.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));
jest.mock('../../utils/proactiveSessionManager', () => ({
    setBotInstance: jest.fn(),
    updateUserActivity: jest.fn(),
    isSessionExpired: jest.fn(() => false),
    closeUserSession: jest.fn(),
    getRemainingSessionTime: jest.fn(() => 60 * 60 * 1000),
    restoreActiveTimers: jest.fn(),
    cleanupExpiredSessions: jest.fn(),
    cleanupOldSessionsWithoutNotification: jest.fn(),
    getActiveSessionsCount: jest.fn(() => 0),
}));
jest.mock('../../services/apiService', () => {
    const real = jest.requireActual('../../services/apiService');
    return {
        ...real,
        registrarActividadBot: jest.fn(async () => true),
        responderRecordatorio: jest.fn(async () => ({ ok: true, data: { accion: 'no_asistira', agenda_id: 'AG000001', persistido: true } })),
        responderOfertaCupo: jest.fn(async () => ({ ok: true, code: 200, data: { registrado: true } })),
        confirmarCitaCampahna: jest.fn(async () => ({ ok: true, estado: 'confirmada' })),
    };
});

import { EventEmitter } from 'events';
import { createBot, MemoryDB } from '@builderbot/bot';
import { construirTemplates } from '../index';
const templates = construirTemplates(true);
import * as api from '../../services/apiService';
import { _estadoParaPruebas, _resetParaPruebas } from '../../utils/trazabilidad';

const mockedApi = api as jest.Mocked<typeof api>;
const ENV_ORIGINAL = { ...process.env };

class FakeProvider extends EventEmitter {
    public enviados: Array<{ to: string; texto: string }> = [];
    async sendMessage(to: string, texto: string) {
        this.enviados.push({ to, texto });
        return { ok: true };
    }
    async sendList(to: string, list: any) {
        this.enviados.push({ to, texto: `[lista] ${list?.body?.text ?? ''}` });
        return { ok: true };
    }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function esperarQuietud(provider: FakeProvider, maxMs = 3000) {
    let ultimo = -1;
    let estable = 0;
    const inicio = Date.now();
    while (Date.now() - inicio < maxMs) {
        await esperar(50);
        if (provider.enviados.length === ultimo) {
            estable += 50;
            if (estable >= 250) return;
        } else {
            ultimo = provider.enviados.length;
            estable = 0;
        }
    }
}

let provider: FakeProvider;
let numero = 573000000900;

async function conversar(textos: string[]): Promise<string> {
    const from = String(numero++);
    for (const body of textos) {
        provider.emit('message', { from, body, name: 'Prueba' });
        await esperarQuietud(provider);
    }
    return from;
}

const eventosDe = (from: string, tipo?: string) =>
    _estadoParaPruebas().cola.filter((e) => e.telefono === from && (!tipo || e.tipo_evento === tipo));

beforeAll(async () => {
    process.env = { ...ENV_ORIGINAL, TRAZABILIDAD_V2_ENABLED: 'true' };
    delete process.env.API_BACKEND_URL; // la cola se inspecciona en memoria, no se envía
    provider = new FakeProvider();
    await createBot({ flow: templates, provider: provider as any, database: new MemoryDB() });
});
afterAll(() => {
    _resetParaPruebas();
    process.env = { ...ENV_ORIGINAL };
});
beforeEach(() => {
    jest.clearAllMocks();
    _resetParaPruebas();
});

it('"Necesito cancelar" + documento inválido + documento válido → UNA campana_respuesta (campana null, cancelar), sin texto del paciente', async () => {
    const from = await conversar(['Necesito cancelar', 'me siento mal', '1234567890']);
    const respuestas = eventosDe(from, 'campana_respuesta');
    expect(respuestas).toHaveLength(1);
    expect(respuestas[0]).toEqual(expect.objectContaining({ resultado: 'cancelar', flujo: 'recordatorio', paso: 'recordatorio.necesito_cancelar' }));
    expect(respuestas[0].campana).toBeUndefined(); // null en el contrato: el bot no sabe a qué recordatorio responde
    expect(eventosDe(from, 'msg_no_entendido')).toHaveLength(1);
    expect(eventosDe(from, 'identificacion')[0]).toEqual(expect.objectContaining({ documento: '1234567890', resultado: 'encontrado' }));
    expect(eventosDe(from, 'flujo_fin')[0]).toEqual(expect.objectContaining({ flujo: 'recordatorio', resultado: 'cita_cancelada', agenda_id: 'AG000001' }));
    expect(JSON.stringify(_estadoParaPruebas().cola)).not.toContain('me siento');
});

it('"Confirmo" (48h) con un reintento de documento → una sola campana_respuesta con campana reminder', async () => {
    mockedApi.confirmarCitaCampahna
        .mockResolvedValueOnce({ ok: false, causa: 'CITA_NOT_FOUND' })
        .mockResolvedValueOnce({ ok: true, estado: 'confirmada' });
    const from = await conversar(['Confirmo', '1234567890', '1234567891']);
    const respuestas = eventosDe(from, 'campana_respuesta');
    expect(respuestas).toHaveLength(1);
    expect(respuestas[0]).toEqual(expect.objectContaining({ campana: 'reminder', resultado: 'confirmo', paso: 'campana.confirmar_documento' }));
    expect(eventosDe(from, 'identificacion').map((e) => e.resultado)).toEqual(['no_encontrado', 'encontrado']);
    // cita_confirmada solo una vez: en el intento que el backend confirmó de verdad.
    const fines = eventosDe(from, 'flujo_fin');
    expect(fines).toHaveLength(1);
    expect(fines[0]).toEqual(expect.objectContaining({ flujo: 'campana_respuesta', resultado: 'cita_confirmada', metadata: { estado_resultado: 'confirmada' } }));
});

it('"Confirmar" con ya_confirmada → flujo_fin cita_confirmada; con CITA_CANCELADA o error → no', async () => {
    mockedApi.confirmarCitaCampahna
        .mockResolvedValueOnce({ ok: true, estado: 'ya_confirmada' })
        .mockResolvedValueOnce({ ok: false, causa: 'CITA_CANCELADA' })
        .mockResolvedValueOnce({ ok: false, causa: 'ERROR' });
    const ya = await conversar(['Confirmar', '1234567890']);
    const cancelada = await conversar(['Confirmar', '1234567890']);
    const error = await conversar(['Confirmar', '1234567890']);
    expect(eventosDe(ya, 'flujo_fin')[0]).toEqual(expect.objectContaining({ resultado: 'cita_confirmada', metadata: { estado_resultado: 'ya_confirmada' } }));
    expect(eventosDe(cancelada, 'flujo_fin')).toHaveLength(0);
    expect(eventosDe(error, 'flujo_fin')).toHaveLength(0);
});

it('"Confirmo asistencia" confirmada → flujo_fin recordatorio cita_confirmada con agenda_id; CITA_NOT_FOUND → no', async () => {
    mockedApi.responderRecordatorio
        .mockResolvedValueOnce({ ok: true, data: { accion: 'confirma', agenda_id: 'AG000002', persistido: true, estado_resultado: 'confirmada' } })
        .mockResolvedValueOnce({ ok: false, causa: 'CITA_NOT_FOUND' })
        .mockResolvedValueOnce({ ok: false, causa: 'CITA_NOT_FOUND' });
    const ok = await conversar(['Confirmo asistencia', '1234567890']);
    const noEncontrada = await conversar(['Confirmo asistencia', '1234567890', '1234567891']);
    expect(eventosDe(ok, 'flujo_fin')[0]).toEqual(expect.objectContaining({ flujo: 'recordatorio', resultado: 'cita_confirmada', agenda_id: 'AG000002', paso: 'recordatorio.confirmo' }));
    expect(eventosDe(noEncontrada, 'flujo_fin')).toHaveLength(0);
});

it('"Confirmar" (24h) → campana execute', async () => {
    const from = await conversar(['Confirmar', '1234567890']);
    expect(eventosDe(from, 'campana_respuesta')[0]).toEqual(expect.objectContaining({ campana: 'execute', resultado: 'confirmo' }));
});

it('"Sí, lo tomo" / "No puedo" → oferta_cupo acepta_cupo / rechaza_cupo', async () => {
    const acepta = await conversar(['Sí, lo tomo', '1234567890']);
    const rechaza = await conversar(['No puedo', '1234567890']);
    expect(eventosDe(acepta, 'campana_respuesta')[0]).toEqual(expect.objectContaining({ campana: 'oferta_cupo', resultado: 'acepta_cupo' }));
    expect(eventosDe(rechaza, 'campana_respuesta')[0]).toEqual(expect.objectContaining({ campana: 'oferta_cupo', resultado: 'rechaza_cupo' }));
});

it('"En otro momento" / "Ya finalicé mi proceso" → recuperacion otro_momento / conasistencia finalizo', async () => {
    const otro = await conversar(['En otro momento']);
    const fin = await conversar(['Ya finalicé mi proceso']);
    expect(eventosDe(otro, 'campana_respuesta')[0]).toEqual(expect.objectContaining({ campana: 'recuperacion', resultado: 'otro_momento' }));
    expect(eventosDe(fin, 'campana_respuesta')[0]).toEqual(expect.objectContaining({ campana: 'conasistencia', resultado: 'finalizo' }));
});

it('un mensaje cualquiera (bienvenida) no genera campana_respuesta', async () => {
    const from = await conversar(['hola']);
    expect(eventosDe(from, 'campana_respuesta')).toHaveLength(0);
    expect(eventosDe(from, 'flujo_paso').map((e) => e.paso)).toEqual(expect.arrayContaining(['inicio.bienvenida', 'politicas.pregunta']));
});
