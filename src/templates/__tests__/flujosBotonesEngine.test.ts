// Prueba de extremo a extremo con el motor REAL de @builderbot (createBot + CoreClass.handleMsg) y la
// lista REAL de flujos, con un provider falso en memoria (no hay Meta ni backend: apiService está
// simulado). Cubre runbook B1 (botones → flujo correcto incluida la captura del documento) y B5 (retiro).

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
        responderRecordatorio: jest.fn(async () => ({ accion: 'confirma', persistido: true })),
        responderOfertaCupo: jest.fn(async () => ({ ok: true, code: 200, data: { registrado: true } })),
        consultarListaEsperaPorDocumento: jest.fn(async () => ({ ok: true, encontrado: true, inscripciones: [] })),
        retirarListaEspera: jest.fn(async () => true),
        confirmarCitaCampahna: jest.fn(async () => true),
    };
});

import { EventEmitter } from 'events';
import { createBot, MemoryDB } from '@builderbot/bot';
import templates from '../index';
import * as api from '../../services/apiService';
import { MENSAJE_RETIRO_EXITOSO, MENSAJE_RETIRO_NO_INSCRITO } from '../flujos/listaEspera/retiroListaEsperaFlow';

const mockedApi = api as jest.Mocked<typeof api>;

class FakeProvider extends EventEmitter {
    public enviados: Array<{ to: string; texto: string }> = [];
    async sendMessage(to: string, texto: string) {
        this.enviados.push({ to, texto });
        return { ok: true };
    }
    // Algunos flujos existentes envían listas interactivas directo con el provider.
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
let numero = 573000000100;

async function conversar(textos: string[]): Promise<string[]> {
    const from = String(numero++);
    const desde = provider.enviados.length;
    for (const body of textos) {
        provider.emit('message', { from, body, name: 'Prueba' });
        await esperarQuietud(provider);
    }
    return provider.enviados.slice(desde).filter((m) => m.to === from).map((m) => m.texto);
}

beforeAll(async () => {
    provider = new FakeProvider();
    await createBot({ flow: templates, provider: provider as any, database: new MemoryDB() });
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('Motor real de builderbot con los flujos registrados', () => {
    it('"Confirmo asistencia" → pide documento → responderRecordatorio(confirma)', async () => {
        const salida = await conversar(['Confirmo asistencia', '1234567890']);
        expect(salida[0]).toMatch(/Para confirmar tu cita, por favor digita tu número de documento/);
        expect(mockedApi.responderRecordatorio).toHaveBeenCalledWith(expect.any(String), '1234567890', 'confirma');
        expect(mockedApi.confirmarCitaCampahna).not.toHaveBeenCalled();
        expect(salida.join('\n')).toMatch(/Confirmamos tu cita/);
    });

    it('"Necesito cancelar" → flujo de recordatorio (no el de cancelar del menú) → no_asistira', async () => {
        const salida = await conversar(['Necesito cancelar', '1234567890']);
        expect(salida[0]).toMatch(/Para cancelar tu cita, por favor digita tu número de documento/);
        expect(mockedApi.responderRecordatorio).toHaveBeenCalledWith(expect.any(String), '1234567890', 'no_asistira');
    });

    it('"No podré asistir" → no_asistira', async () => {
        await conversar(['No podré asistir', '1234567890']);
        expect(mockedApi.responderRecordatorio).toHaveBeenCalledWith(expect.any(String), '1234567890', 'no_asistira');
    });

    it('"No puedo" (botón) → rechazo de oferta', async () => {
        await conversar(['No puedo', '1234567890']);
        expect(mockedApi.responderOfertaCupo).toHaveBeenCalledWith('1234567890', expect.any(String), 'rechaza');
    });

    it('"hoy no puedo ir" (texto libre) NO abre el rechazo de oferta', async () => {
        await conversar(['hoy no puedo ir', '1234567890']);
        expect(mockedApi.responderOfertaCupo).not.toHaveBeenCalled();
    });

    it('"Confirmo" (botón de campaña actual) sigue en el flujo viejo (confirmarcitameta)', async () => {
        const salida = await conversar(['Confirmo', '1234567890']);
        expect(mockedApi.responderRecordatorio).not.toHaveBeenCalled();
        expect(mockedApi.confirmarCitaCampahna).toHaveBeenCalled();
        expect(salida.length).toBeGreaterThan(0);
    });

    it('"Retirar lista de espera" con inscripción activa → retira por lista_espera_id', async () => {
        mockedApi.consultarListaEsperaPorDocumento.mockResolvedValueOnce({
            ok: true,
            encontrado: true,
            inscripciones: [
                { lista_espera_id: 'LE000001', paciente_id: 'P1', profesional_id: 'E1', cita_actual_id: 'A1', estado: 'activa' },
                { lista_espera_id: 'LE000002', paciente_id: 'P1', profesional_id: 'E2', cita_actual_id: 'A2', estado: 'consumida' },
            ],
        });
        const salida = await conversar(['Retirar lista de espera', '1234567890']);
        expect(salida[0]).toMatch(/Para retirarte de la lista de espera/);
        expect(mockedApi.consultarListaEsperaPorDocumento).toHaveBeenCalledWith('1234567890');
        expect(mockedApi.retirarListaEspera).toHaveBeenCalledTimes(1);
        expect(mockedApi.retirarListaEspera).toHaveBeenCalledWith({ lista_espera_id: 'LE000001' });
        expect(salida).toContain(MENSAJE_RETIRO_EXITOSO);
    });

    it('"retirar lista de espera" sin inscripción activa → mensaje de no inscrito, sin retirar', async () => {
        const salida = await conversar(['retirar lista de espera', '1234567890']);
        expect(mockedApi.retirarListaEspera).not.toHaveBeenCalled();
        expect(salida).toContain(MENSAJE_RETIRO_NO_INSCRITO);
    });

    it('"Salir" sigue cerrando la conversación y no retira de la lista de espera', async () => {
        const salida = await conversar(['Salir']);
        expect(salida.join('\n')).toMatch(/Gracias por usar nuestro servicio/);
        expect(mockedApi.retirarListaEspera).not.toHaveBeenCalled();
        expect(mockedApi.consultarListaEsperaPorDocumento).not.toHaveBeenCalled();
    });
});
