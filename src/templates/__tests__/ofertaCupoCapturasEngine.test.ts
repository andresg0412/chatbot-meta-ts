// Fase 2 (docs/bugs/fase-2-cascada-ofertas.md, puntos 2.1 y 2.2): capturas de la oferta de cupo, con el motor
// REAL de @builderbot y la lista real de flujos. apiService simulado (sin backend ni Meta).

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
        responderOfertaCupo: jest.fn(async () => ({ ok: true, code: 200, data: { registrado: true } })),
        registrarIntencionOfertaCupo: jest.fn(async () => ({ ok: false })),
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
let numero = 573000000500;

async function conversarComo(from: string, textos: string[]): Promise<string[]> {
    const desde = provider.enviados.length;
    for (const body of textos) {
        provider.emit('message', { from, body, name: 'Prueba' });
        await esperarQuietud(provider);
    }
    return provider.enviados.slice(desde).filter((m) => m.to === from).map((m) => m.texto);
}

const conversar = (textos: string[]) => conversarComo(String(numero++), textos);

beforeAll(async () => {
    provider = new FakeProvider();
    await createBot({ flow: templates, provider: provider as any, database: new MemoryDB() });
});

beforeEach(() => {
    jest.clearAllMocks();
});

const MIN = 60 * 1000;
const dateNowReal = Date.now.bind(Date);
let desfaseMs = 0;

describe('Oferta de cupo: capturas del documento (2.1)', () => {
    beforeEach(() => {
        desfaseMs = 0;
        jest.spyOn(Date, 'now').mockImplementation(() => dateNowReal() + desfaseMs);
    });
    afterEach(() => {
        (Date.now as unknown as jest.SpyInstance).mockRestore();
    });

    it('"Sí, lo tomo" → "No puedo" → documento: se registra como rechazo, sin documento inválido', async () => {
        const salida = await conversar(['Sí, lo tomo', 'No puedo', '1234567890']);
        expect(mockedApi.responderOfertaCupo).toHaveBeenCalledTimes(1);
        expect(mockedApi.responderOfertaCupo).toHaveBeenCalledWith('1234567890', expect.any(String), 'rechaza');
        expect(salida.join('\n')).not.toMatch(/no es válido/);
    });

    it('"Sí, lo tomo" dos veces: avisa que ya se recibió y solo registra una aceptación', async () => {
        const salida = await conversar(['Sí, lo tomo', 'Sí, lo tomo', '1234567890']);
        expect(salida.join('\n')).toMatch(/Ya recibimos tu respuesta/);
        expect(salida.join('\n')).not.toMatch(/no es válido/);
        expect(mockedApi.registrarIntencionOfertaCupo).toHaveBeenCalledTimes(1);
        expect(mockedApi.responderOfertaCupo).toHaveBeenCalledTimes(1);
        expect(mockedApi.responderOfertaCupo).toHaveBeenCalledWith('1234567890', expect.any(String), 'acepta');
    });

    it('captura vieja (más de 30 min) + "Sí, lo tomo" → abre una captura nueva y avisa la intención de nuevo', async () => {
        const from = '573000009001';
        await conversarComo(from, ['Sí, lo tomo']);
        desfaseMs = 31 * MIN;
        const salida = await conversarComo(from, ['Sí, lo tomo']);
        expect(salida.join('\n')).toMatch(/número de documento/);
        expect(mockedApi.registrarIntencionOfertaCupo).toHaveBeenCalledTimes(2);
        expect(mockedApi.responderOfertaCupo).not.toHaveBeenCalled();
    });

    it('captura vieja + un documento por otro motivo → NO se manda como aceptación', async () => {
        const from = '573000009002';
        await conversarComo(from, ['Sí, lo tomo']);
        desfaseMs = 31 * MIN;
        const salida = await conversarComo(from, ['12345678']);
        expect(mockedApi.responderOfertaCupo).not.toHaveBeenCalled();
        expect(salida.join('\n')).toMatch(/políticas de datos/);
    });

    it('"Sí, lo tomo" → "Salir" cierra la conversación sin responder la oferta', async () => {
        const salida = await conversar(['Sí, lo tomo', 'Salir']);
        expect(salida.join('\n')).toMatch(/Gracias por usar nuestro servicio/);
        expect(mockedApi.responderOfertaCupo).not.toHaveBeenCalled();
    });

    it('documento inválido: el mensaje de reintento incluye la instrucción', async () => {
        const salida = await conversar(['Sí, lo tomo', 'abc']);
        expect(salida.join('\n')).toMatch(/no es válido\. Intenta nuevamente escribiendo solo tu número de documento/);
    });
});

describe('Oferta de cupo: aviso de intención al backend (2.2 y 2.4)', () => {
    it('intención "vencida" (cupo asignado): responde de una vez y no pide el documento', async () => {
        mockedApi.registrarIntencionOfertaCupo.mockResolvedValueOnce({ ok: true, data: { estado: 'vencida', estado_cupo: 'asignado' } });
        const salida = await conversar(['Sí, lo tomo']);
        expect(salida.join('\n')).toMatch(/ya fue tomado por otra persona/);
        expect(salida.join('\n')).not.toMatch(/número de documento/);
        expect(mockedApi.responderOfertaCupo).not.toHaveBeenCalled();
    });

    it('intención "vencida" con cupo escalado: avisa que se informó al equipo', async () => {
        mockedApi.registrarIntencionOfertaCupo.mockResolvedValueOnce({ ok: true, data: { estado: 'vencida', estado_cupo: 'escalado' } });
        const salida = await conversar(['Sí, lo tomo']);
        expect(salida.join('\n')).toMatch(/le avisamos a nuestro equipo/);
    });

    it('intención "sin_oferta": avisa que no hay oferta pendiente y no pide documento', async () => {
        mockedApi.registrarIntencionOfertaCupo.mockResolvedValueOnce({ ok: true, data: { estado: 'sin_oferta' } });
        const salida = await conversar(['Sí, lo tomo']);
        expect(salida.join('\n')).toMatch(/Ya no tienes ninguna oferta de cupo pendiente/);
        expect(salida.join('\n')).not.toMatch(/número de documento/);
    });

    it('intención vigente y prorrogada: pide el documento con el aviso de unos minutos', async () => {
        mockedApi.registrarIntencionOfertaCupo.mockResolvedValueOnce({ ok: true, data: { estado: 'vigente', prorrogada: true } });
        const salida = await conversar(['Sí, lo tomo']);
        expect(salida.join('\n')).toMatch(/Tienes unos minutos/);
    });

    it('intención con error de red: sigue el camino de siempre y pide el documento', async () => {
        const salida = await conversar(['Sí, lo tomo', '1234567890']);
        expect(salida[0]).toMatch(/digita tu número de documento/);
        expect(mockedApi.responderOfertaCupo).toHaveBeenCalledWith('1234567890', expect.any(String), 'acepta');
    });

    it('"No puedo" con rechazo por celular: rechaza sin pedir el documento', async () => {
        mockedApi.registrarIntencionOfertaCupo.mockResolvedValueOnce({ ok: true, data: { estado: 'rechazada' } });
        const salida = await conversar(['No puedo']);
        expect(mockedApi.registrarIntencionOfertaCupo).toHaveBeenCalledWith(expect.any(String), 'rechaza');
        expect(salida.join('\n')).toMatch(/gracias por avisarnos/i);
        expect(salida.join('\n')).not.toMatch(/número de documento/);
        expect(mockedApi.responderOfertaCupo).not.toHaveBeenCalled();
    });

    it('"No puedo" sobre una oferta que ya no está vigente: mensaje de cierre sin documento', async () => {
        mockedApi.registrarIntencionOfertaCupo.mockResolvedValueOnce({ ok: true, data: { estado: 'vencida', estado_cupo: 'asignado' } });
        const salida = await conversar(['No puedo']);
        expect(salida.join('\n')).toMatch(/ya no estaba vigente/);
        expect(salida.join('\n')).not.toMatch(/número de documento/);
    });
});
