// Runbook B4 (CRISIS_PROTOCOL_ENABLED) y B8 (persistencia de la lista negra por crisis).
jest.mock('../../services/apiService', () => ({
    registrarActividadBot: jest.fn(async () => true),
    registrarAlertaCrisisPorCorreo: jest.fn(async () => ({ registrada: true, correoConfigurado: true, intentos: 1 })),
}));
jest.mock('../avisoAsesor', () => ({
    enviarAvisoAsesor: jest.fn(async () => true),
}));

import fs from 'fs';
import os from 'os';
import path from 'path';
import * as api from '../../services/apiService';
import * as aviso from '../avisoAsesor';
import { createCrisisInterceptor } from '../crisisProtocol';
import {
    _setCrisisBlacklistPathParaPruebas,
    obtenerBloqueadosPorCrisis,
    quitarBloqueoPorCrisis,
    registrarBloqueoPorCrisis,
} from '../crisisBlacklistStore';

const mockedApi = api as jest.Mocked<typeof api>;
const mockedAviso = aviso as jest.Mocked<typeof aviso>;
const ENV_ORIGINAL = { ...process.env };

let tmpFile: string;
let blacklist: Set<string>;
let bot: any;
let sendRaw: jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ENV_ORIGINAL, CANAL_ESCALAMIENTO_CRISIS: '573158070460' };
    tmpFile = path.join(os.tmpdir(), `crisisBlacklistDB.test.${process.pid}.${Date.now()}.json`);
    _setCrisisBlacklistPathParaPruebas(tmpFile);
    blacklist = new Set();
    bot = { dynamicBlacklist: { add: jest.fn((n: string) => blacklist.add(n)), checkIf: (n: string) => blacklist.has(n) } };
    sendRaw = jest.fn(async () => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...ENV_ORIGINAL };
    _setCrisisBlacklistPathParaPruebas(null);
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
});

const mensajeRiesgo = { from: '573001234567', body: 'ya no quiero vivir, es una prueba' };

it('CRISIS_PROTOCOL_ENABLED ausente/false → el interceptor no hace nada', () => {
    for (const valor of [undefined, 'false']) {
        if (valor === undefined) delete process.env.CRISIS_PROTOCOL_ENABLED;
        else process.env.CRISIS_PROTOCOL_ENABLED = valor;
        createCrisisInterceptor(() => bot, sendRaw)(mensajeRiesgo);
    }
    expect(bot.dynamicBlacklist.add).not.toHaveBeenCalled();
    expect(sendRaw).not.toHaveBeenCalled();
    expect(mockedAviso.enviarAvisoAsesor).not.toHaveBeenCalled();
    expect(mockedApi.registrarActividadBot).not.toHaveBeenCalled();
    expect(obtenerBloqueadosPorCrisis()).toEqual([]);
});

it('encendido → bloquea de forma síncrona, persiste, avisa al asesor (sin texto del paciente) y registra', () => {
    process.env.CRISIS_PROTOCOL_ENABLED = 'true';
    createCrisisInterceptor(() => bot, sendRaw)(mensajeRiesgo);
    // síncrono: ya bloqueado al volver del listener (antes de que corra handleMsg del framework)
    expect(blacklist.has('573001234567')).toBe(true);
    expect(obtenerBloqueadosPorCrisis()).toEqual(['573001234567']);
    expect(sendRaw).toHaveBeenCalledWith('573001234567', expect.stringContaining('Línea 123'));
    expect(mockedAviso.enviarAvisoAsesor).toHaveBeenCalledWith(expect.objectContaining({
        tipo: 'crisis', canal: '573158070460', referencia: 'tel:********4567',
    }));
    const avisoArgs = mockedAviso.enviarAvisoAsesor.mock.calls[0][0];
    expect(avisoArgs.mensaje).not.toContain('no quiero vivir');
    expect(mockedApi.registrarActividadBot).toHaveBeenCalledWith('crisis_detectada', '573001234567', { accion: 'flujo_bloqueado' });
});

it('encendido con mensaje normal → no hace nada', () => {
    process.env.CRISIS_PROTOCOL_ENABLED = 'true';
    createCrisisInterceptor(() => bot, sendRaw)({ from: '573001234567', body: 'Agendar cita' });
    expect(bot.dynamicBlacklist.add).not.toHaveBeenCalled();
    expect(obtenerBloqueadosPorCrisis()).toEqual([]);
});

describe('D7: alerta de crisis solo por correo (ALERTA_CRISIS_CANAL=email)', () => {
    const esperarMicrotareas = () => new Promise((resolve) => setTimeout(resolve, 20));

    it('default (whatsapp): el aviso de siempre y NO se llama al backend de correo', () => {
        process.env.CRISIS_PROTOCOL_ENABLED = 'true';
        delete process.env.ALERTA_CRISIS_CANAL;
        createCrisisInterceptor(() => bot, sendRaw)(mensajeRiesgo);
        expect(mockedAviso.enviarAvisoAsesor).toHaveBeenCalledTimes(1);
        expect(mockedApi.registrarAlertaCrisisPorCorreo).not.toHaveBeenCalled();
    });

    it('email: registra la alerta con el teléfono y NO envía el WhatsApp al asesor', async () => {
        process.env.CRISIS_PROTOCOL_ENABLED = 'true';
        process.env.ALERTA_CRISIS_CANAL = 'email';
        createCrisisInterceptor(() => bot, sendRaw)(mensajeRiesgo);
        await esperarMicrotareas();
        expect(mockedApi.registrarAlertaCrisisPorCorreo).toHaveBeenCalledWith('573001234567');
        expect(mockedAviso.enviarAvisoAsesor).not.toHaveBeenCalled();
    });

    it('email: el bloqueo del bot, el mensaje de contención y el registro de evento NO cambian', async () => {
        process.env.CRISIS_PROTOCOL_ENABLED = 'true';
        process.env.ALERTA_CRISIS_CANAL = 'email';
        createCrisisInterceptor(() => bot, sendRaw)(mensajeRiesgo);
        // síncrono, antes de cualquier await
        expect(blacklist.has('573001234567')).toBe(true);
        expect(obtenerBloqueadosPorCrisis()).toEqual(['573001234567']);
        expect(sendRaw).toHaveBeenCalledWith('573001234567', expect.stringContaining('Línea 123'));
        await esperarMicrotareas();
        expect(mockedApi.registrarActividadBot).toHaveBeenCalledWith('crisis_detectada', '573001234567', { accion: 'flujo_bloqueado' });
    });

    it('email: no depende de CANAL_ESCALAMIENTO_CRISIS (ya no hace falta el número de WhatsApp)', async () => {
        process.env.CRISIS_PROTOCOL_ENABLED = 'true';
        process.env.ALERTA_CRISIS_CANAL = 'email';
        delete process.env.CANAL_ESCALAMIENTO_CRISIS;
        createCrisisInterceptor(() => bot, sendRaw)(mensajeRiesgo);
        await esperarMicrotareas();
        expect(mockedApi.registrarAlertaCrisisPorCorreo).toHaveBeenCalledTimes(1);
        expect(mockedAviso.enviarAvisoAsesor).not.toHaveBeenCalled();
    });

    it('email: si el backend no recibe la alerta tras los reintentos, queda registrado un aviso_crisis_fallido', async () => {
        process.env.CRISIS_PROTOCOL_ENABLED = 'true';
        process.env.ALERTA_CRISIS_CANAL = 'email';
        mockedApi.registrarAlertaCrisisPorCorreo.mockResolvedValueOnce({ registrada: false, correoConfigurado: null, intentos: 3 });
        createCrisisInterceptor(() => bot, sendRaw)(mensajeRiesgo);
        await esperarMicrotareas();
        expect(mockedApi.registrarActividadBot).toHaveBeenCalledWith('aviso_crisis_fallido', '573001234567', { canal: 'email', intentos: 3 });
        // El número sigue bloqueado aunque la alerta no haya llegado.
        expect(blacklist.has('573001234567')).toBe(true);
    });

    it('email: ni la alerta ni los logs llevan el texto del mensaje del paciente', async () => {
        process.env.CRISIS_PROTOCOL_ENABLED = 'true';
        process.env.ALERTA_CRISIS_CANAL = 'email';
        createCrisisInterceptor(() => bot, sendRaw)(mensajeRiesgo);
        await esperarMicrotareas();
        expect(JSON.stringify(mockedApi.registrarAlertaCrisisPorCorreo.mock.calls)).not.toContain('no quiero vivir');
    });

    it('email con el protocolo apagado no hace nada', async () => {
        delete process.env.CRISIS_PROTOCOL_ENABLED;
        process.env.ALERTA_CRISIS_CANAL = 'email';
        createCrisisInterceptor(() => bot, sendRaw)(mensajeRiesgo);
        await esperarMicrotareas();
        expect(mockedApi.registrarAlertaCrisisPorCorreo).not.toHaveBeenCalled();
    });
});

describe('crisisBlacklistStore (B8)', () => {
    it('registrar / listar / quitar, sin duplicados y tolerante a + y espacios al quitar', () => {
        registrarBloqueoPorCrisis('573001234567');
        registrarBloqueoPorCrisis('573001234567');
        registrarBloqueoPorCrisis('573009999999');
        expect(obtenerBloqueadosPorCrisis().sort()).toEqual(['573001234567', '573009999999']);
        expect(quitarBloqueoPorCrisis('+57 300 123 4567')).toBe(true);
        expect(quitarBloqueoPorCrisis('573001234567')).toBe(false);
        expect(obtenerBloqueadosPorCrisis()).toEqual(['573009999999']);
    });

    it('archivo inexistente o corrupto → lista vacía, sin lanzar', () => {
        expect(obtenerBloqueadosPorCrisis()).toEqual([]);
        fs.writeFileSync(tmpFile, '{no es json', 'utf-8');
        expect(obtenerBloqueadosPorCrisis()).toEqual([]);
    });
});
