// Runbook B4/B7: tras agendar, la pregunta de lista de espera solo aparece con
// LISTA_ESPERA_OPTIN_ENABLED=true y número piloto (o sin lista piloto). Si no, el flujo termina igual
// que antes de la Fase 1: closeUserSession + endFlow().

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
jest.mock('../../services/apiService', () => {
    const real = jest.requireActual('../../services/apiService');
    return {
        ...real,
        crearCita: jest.fn(async () => ({ ok: true })),
        registrarActividadBot: jest.fn(async () => true),
    };
});
jest.mock('../../utils/metrics', () => ({
    metricFlujoFinalizado: jest.fn(),
    metricError: jest.fn(),
    metricConversationStarted: jest.fn(),
    metricCita: jest.fn(),
}));

import { step19AgendarCita } from '../flujos/agendarCita/step19AgendarCita';
import { stepListaEsperaOptIn, TEXTO_CONSENTIMIENTO_LISTA_ESPERA } from '../flujos/agendarCita/listaEspera/stepListaEsperaOptIn';
import * as sesiones from '../../utils/proactiveSessionManager';
import * as api from '../../services/apiService';

const ENV_ORIGINAL = { ...process.env };

function accionStep19(): (ctx: any, fns: any) => Promise<any> {
    const callbacks = (step19AgendarCita as any).ctx.callbacks as Record<string, any>;
    const fn = Object.values(callbacks).find((c) => typeof c === 'function');
    if (!fn) throw new Error('No se encontró la acción de step19');
    return fn;
}

async function ejecutar(from: string) {
    const fns = {
        state: {
            getMyState: () => ({
                citaSeleccionadaHora: { fechacita: '2026-10-05', horacita: '14:00:00', horafinal: '15:00:00', profesionalId: 'E1' },
                pacienteId: 'P1',
                especialidadAgendarCita: 'Psicologia',
                tipoConsultaPaciente: 'Control',
                tipoCitaAgendarCita: 'Presencial',
            }),
            update: jest.fn(async () => undefined),
        },
        flowDynamic: jest.fn(async () => undefined),
        gotoFlow: jest.fn(() => 'goto'),
        endFlow: jest.fn(() => 'end'),
    };
    await accionStep19()({ from }, fns);
    return fns;
}

beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ENV_ORIGINAL };
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...ENV_ORIGINAL };
});

it('interruptor ausente/false → termina como antes de la Fase 1 (sin pregunta de lista de espera)', async () => {
    for (const valor of [undefined, 'false']) {
        jest.clearAllMocks();
        if (valor === undefined) delete process.env.LISTA_ESPERA_OPTIN_ENABLED;
        else process.env.LISTA_ESPERA_OPTIN_ENABLED = valor;
        const fns = await ejecutar('573001234567');
        expect(api.crearCita).toHaveBeenCalled();
        expect(fns.gotoFlow).not.toHaveBeenCalled();
        expect(fns.endFlow).toHaveBeenCalledWith();
        expect(sesiones.closeUserSession).toHaveBeenCalledWith('573001234567');
        expect(fns.flowDynamic).toHaveBeenCalledWith('Tu cita se ha agendado con éxito. 📅👍');
    }
});

it('encendido sin lista piloto → pregunta de lista de espera', async () => {
    process.env.LISTA_ESPERA_OPTIN_ENABLED = 'true';
    delete process.env.LISTA_ESPERA_TELEFONOS_PILOTO;
    const fns = await ejecutar('573001234567');
    expect(fns.gotoFlow).toHaveBeenCalledWith(stepListaEsperaOptIn);
    expect(fns.endFlow).not.toHaveBeenCalled();
});

it('encendido con lista piloto: solo los números piloto reciben la pregunta', async () => {
    process.env.LISTA_ESPERA_OPTIN_ENABLED = 'true';
    process.env.LISTA_ESPERA_TELEFONOS_PILOTO = '3001234567';
    const piloto = await ejecutar('573001234567');
    expect(piloto.gotoFlow).toHaveBeenCalledWith(stepListaEsperaOptIn);

    const otro = await ejecutar('573009999999');
    expect(otro.gotoFlow).not.toHaveBeenCalled();
    expect(otro.endFlow).toHaveBeenCalledWith();
});

it('el texto de consentimiento indica el comando de retiro (no "Salir") y no menciona términos clínicos', () => {
    expect(TEXTO_CONSENTIMIENTO_LISTA_ESPERA).toContain('"Retirar lista de espera"');
    expect(TEXTO_CONSENTIMIENTO_LISTA_ESPERA).not.toContain('"Salir"');
    expect(TEXTO_CONSENTIMIENTO_LISTA_ESPERA).not.toMatch(/psicolog|terapia|sesi[oó]n|psiquiatr/i);
});
