// Fase 3 (3.7): escapes en las capturas de documento. "Chatear con agente", "Salir" y un audio nunca se
// tragan como si fueran un documento. Motor REAL de @builderbot y lista real de flujos; apiService simulado.

jest.mock('../../utils/proactiveSessionManager', () => ({
    setBotInstance: jest.fn(),
    updateUserActivity: jest.fn(),
    renovarActividadSesion: jest.fn(() => 'activa'),
    isSessionExpired: jest.fn(() => false),
    closeUserSession: jest.fn(),
    getRemainingSessionTime: jest.fn(() => 60 * 60 * 1000),
    restoreActiveTimers: jest.fn(),
    cleanupExpiredSessions: jest.fn(),
    cleanupOldSessionsWithoutNotification: jest.fn(),
    getActiveSessionsCount: jest.fn(() => 0),
}));

jest.mock('../../utils/listaEsperaCascadaPoller', () => ({
    ...jest.requireActual('../../utils/listaEsperaCascadaPoller'),
    programarTickCascadaRetrasado: jest.fn(),
}));

jest.mock('../../services/apiService', () => {
    const real = jest.requireActual('../../services/apiService');
    return {
        ...real,
        registrarActividadBot: jest.fn(async () => true),
        consultarCitasPorDocumento: jest.fn(async () => []),
        confirmarCitaCampahna: jest.fn(async () => ({ ok: true, estado: 'confirmada' })),
    };
});

import { EventEmitter } from 'events';
import { createBot, MemoryDB } from '@builderbot/bot';
import { construirTemplates } from '../index';
import * as api from '../../services/apiService';

const templates = construirTemplates(true);
const mockedApi = api as jest.Mocked<typeof api>;

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
let numero = 573000000700;

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

beforeEach(() => jest.clearAllMocks());

// En horario: enlace al asesor. Fuera de horario: aviso con el horario de atención. Ambos son "abrió el flujo de agente".
const FLUJO_AGENTE = /wa\.me|agentes no están disponibles|horarios? de atención|no estamos disponibles|fuera del horario/i;

const CAPTURAS: Array<[string, string[]]> = [
    ['documento de reprogramar', ['3']],
    ['documento de cancelar', ['4']],
    ['documento de confirmación de campaña', ['Confirmar']],
];

describe.each(CAPTURAS)('Captura: %s', (_nombre, entrada) => {
    it('"Chatear con agente" abre el flujo de agente y no se toma como documento', async () => {
        const salida = await conversar([...entrada, 'Chatear con agente']);
        expect(salida.join('\n')).toMatch(FLUJO_AGENTE);
        expect(salida.join('\n')).not.toMatch(/no es válido/);
        expect(mockedApi.confirmarCitaCampahna).not.toHaveBeenCalled();
    });

    it('un audio no se toma como documento: avisa que no puede escucharlo', async () => {
        const salida = await conversar([...entrada, '_event_voice_note__1a2b3c4d']);
        expect(salida.join('\n')).toMatch(/no puedo escuchar audios/);
        expect(mockedApi.confirmarCitaCampahna).not.toHaveBeenCalled();
    });

    it('"Salir" cierra la conversación', async () => {
        const salida = await conversar([...entrada, 'Salir']);
        expect(salida.join('\n')).toMatch(/Gracias por usar nuestro servicio/);
    });
});
