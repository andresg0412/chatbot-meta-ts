// T-01, T-02 y T-04 de la verificación final de ips-tester
// (proyecto-ips/docs/features/2026-10-02-informe-qa-lista-espera.md):
// - T-01: 502 POSTGRES_DESPUES_DE_GLOBHO al reprogramar y al aceptar una oferta de cupo.
// - T-02: los flujos de recordatorio renuevan la sesión; el timer de 1 h ya no borra el state a mitad de la
//   lista si hubo actividad.
// - T-04: entrar por keyword sin sesión ("cancelar", "reprogramar", "Necesito cancelar" con el flag apagado,
//   Conocer la IPS, PQRS) ya no termina en silencio.
// Motor REAL de @builderbot (createBot + handleMsg), lista REAL de flujos y gestor REAL de sesiones
// (proactiveSessionManager, SIN mock) con un reloj y timers de sesión controlados por la prueba. Sin Meta ni
// backend: apiService y axios simulados; los JSON de runtime no se tocan.
jest.mock('fs', () => {
    const real = jest.requireActual('fs');
    const esRuntime = (p: unknown) =>
        /(userSessionsDB|metricsDB|userAttemptsDB|crisisBlacklistDB)\.json$|trazabilidadSpool\.jsonl$/.test(String(p));
    return {
        ...real,
        existsSync: jest.fn((p: any) => (esRuntime(p) ? false : real.existsSync(p))),
        readFileSync: jest.fn((p: any, ...a: any[]) => (esRuntime(p) ? '{}' : real.readFileSync(p, ...a))),
        writeFileSync: jest.fn((p: any, ...a: any[]) => (esRuntime(p) ? undefined : real.writeFileSync(p, ...a))),
        appendFileSync: jest.fn((p: any, ...a: any[]) => (esRuntime(p) ? undefined : real.appendFileSync(p, ...a))),
    };
});
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(async () => ({ data: {} })), get: jest.fn(async () => ({ data: {} })) } }));
jest.mock('../../services/citasService', () => ({
    ...jest.requireActual('../../services/citasService'),
    esBotHabilitado: () => true,
}));
jest.mock('../../utils/verificarHorario', () => ({
    ...jest.requireActual('../../utils/verificarHorario'),
    isWorkingHours: jest.fn(() => false),
}));
jest.mock('../../utils/listaEsperaCascadaPoller', () => ({
    ...jest.requireActual('../../utils/listaEsperaCascadaPoller'),
    programarTickCascadaRetrasado: jest.fn(),
}));

const CITA_A = {
    cita_id: 'A9897918', agenda_id_externa: 5206177, fecha_cita: '2099-10-10', hora_cita: '07:50',
    profesional: 'Ana Pérez', tipo_recordatorio: '24h', estado_agenda: 'Pendiente',
};
const CITA_B = {
    cita_id: 'B1234567', agenda_id_externa: 5206999, fecha_cita: '2099-10-17', hora_cita: '15:00',
    profesional: 'Carlos Gómez', tipo_recordatorio: null, estado_agenda: 'Confirmado',
};
const citaProxima = {
    fecha_cita: '2099-01-10', hora_cita: '08:00:00', especialidad: 'Psicología', estado_agenda: 'Pendiente',
    agenda_id_externa: 9001, profesional_id: 'E1', nombre_profesional: 'Prof Uno', catalogo: 'CONSULTA DE CONTROL',
    convenio: '', pacientes_id: 'PA', tipo_cita: '1',
};

jest.mock('../../services/apiService', () => {
    const real = jest.requireActual('../../services/apiService');
    return {
        ...real,
        registrarActividadBot: jest.fn(async () => true),
        consultarPacientePorDocumento: jest.fn(async () => ({ pacientes_id: 'PA', nombre_paciente: 'Paciente Uno' })),
        consultarCitasProximasPaciente: jest.fn(async () => [citaProxima]),
        consultarFechasCitasDisponibles: jest.fn(async () => ['2099-01-12']),
        consultarCitasFecha: jest.fn(async () => [{
            fechacita: '2099-01-12', horacita: '09:30', horafinal: '10:10', profesionalId: 'E1',
            profesional: 'Prof Uno', especialidad: 'Psicología', lugar: 'Sede',
        }]),
        cancelarCita: jest.fn(async () => 'ok'),
        reagendarCita: jest.fn(),
        responderOfertaCupo: jest.fn(),
        consultarCitasRecordatorio: jest.fn(),
        responderRecordatorio: jest.fn(),
    };
});

import { EventEmitter } from 'events';

jest.setTimeout(90000);

const UNA_HORA = 60 * 60 * 1000;
const MIN = 60 * 1000;
const ENV_ORIGINAL = { ...process.env };

// Timers de sesión de 1 h: se capturan con su vencimiento (según el reloj desplazado) y se pueden cancelar
// con clearTimeout, igual que los reales. `dispararVencidos()` corre los que ya vencieron y no se cancelaron.
// Todo lo demás pasa a los timers reales.
const setTimeoutReal = global.setTimeout;
const clearTimeoutReal = global.clearTimeout;
const setIntervalReal = global.setInterval;
const dateNowReal = Date.now.bind(Date);
let desfaseReloj = 0;
const ahora = () => dateNowReal() + desfaseReloj;
type TimerSesion = { vence: number; fn: () => void; cancelado: boolean; handle: any };
const timersSesion: TimerSesion[] = [];
function dispararVencidos(): number {
    let n = 0;
    for (const t of timersSesion) {
        if (!t.cancelado && t.vence <= ahora()) {
            t.cancelado = true;
            t.fn();
            n++;
        }
    }
    return n;
}

/** Los timers de pruebas anteriores son de otros números: se descartan para que no cuenten aquí. */
function descartarTimersPrevios(): void {
    for (const t of timersSesion) t.cancelado = true;
}

type Enviado = { to: string; texto: string; botones?: string[]; lista?: any };
class FakeProvider extends EventEmitter {
    public enviados: Enviado[] = [];
    async sendMessage(to: string, texto: string, ctx?: any) {
        const botones = (ctx?.options?.buttons ?? []).map((b: any) => b.body);
        this.enviados.push({ to, texto, ...(botones.length ? { botones } : {}) });
        return { ok: true };
    }
    async sendList(to: string, list: any) {
        this.enviados.push({ to, texto: `[lista] ${list?.body?.text ?? ''}`, lista: list });
        return { ok: true };
    }
}

const esperar = (ms: number) => new Promise((r) => setTimeoutReal(r, ms));
async function esperarQuietud(provider: FakeProvider, maxMs = 3000) {
    let ultimo = -1;
    let estable = 0;
    const inicio = dateNowReal();
    while (dateNowReal() - inicio < maxMs) {
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

let api: any;
let traza: any;
let mgr: any;
let poller: any;
let MOV: typeof import('../../utils/mensajesMovimientoCita');
let MSG_VENCIDA: string;
let MSG_TERMINADA: string;
let numero = 573000000900;
const nuevoNumero = () => String(numero++);

function crearBot(recordatoriosBotones: boolean) {
    const { createBot, MemoryDB } = require('@builderbot/bot');
    const templates = require('../index').construirTemplates(recordatoriosBotones);
    const provider = new FakeProvider();
    const listo = createBot({ flow: templates, provider: provider as any, database: new MemoryDB() });
    async function enviar(from: string, textos: string[]): Promise<Enviado[]> {
        await listo;
        const desde = provider.enviados.length;
        for (const body of textos) {
            provider.emit('message', { from, body, name: 'Prueba' });
            await esperarQuietud(provider);
        }
        return provider.enviados.slice(desde).filter((m) => m.to === from);
    }
    return { provider, listo, enviar };
}

let botOn: ReturnType<typeof crearBot>;
let botOff: ReturnType<typeof crearBot>;
let botOnInstancia: any;
let botOffInstancia: any;
const textos = (s: Enviado[]) => s.map((m) => m.texto);
const INICIO = ['hola', 'Acepto'];

beforeAll(async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: any, ms?: number, ...args: any[]) => {
        if (ms === UNA_HORA) {
            const handle: any = setTimeoutReal(() => undefined, 0);
            handle?.unref?.();
            timersSesion.push({ vence: ahora() + UNA_HORA, fn: () => fn(...args), cancelado: false, handle });
            return handle;
        }
        return setTimeoutReal(fn, ms, ...args);
    }) as any);
    jest.spyOn(global, 'clearTimeout').mockImplementation(((handle: any) => {
        const t = timersSesion.find((x) => x.handle === handle);
        if (t) t.cancelado = true;
        else clearTimeoutReal(handle);
    }) as any);
    jest.spyOn(global, 'setInterval').mockImplementation(((fn: any, ms?: number, ...args: any[]) => {
        const h: any = setIntervalReal(fn, ms, ...args);
        h?.unref?.();
        return h;
    }) as any);
    jest.spyOn(Date, 'now').mockImplementation(() => ahora());

    api = require('../../services/apiService');
    traza = require('../../utils/trazabilidad');
    mgr = require('../../utils/proactiveSessionManager');
    poller = require('../../utils/listaEsperaCascadaPoller');
    MOV = require('../../utils/mensajesMovimientoCita');
    MSG_VENCIDA = require('../../utils/proactiveSessionTimeout').MENSAJE_CONVERSACION_VENCIDA;
    MSG_TERMINADA = require('../../utils/estadoConversacion').MENSAJE_CONVERSACION_TERMINADA;
    botOn = crearBot(true);
    botOff = crearBot(false);
    botOnInstancia = await botOn.listo;
    botOffInstancia = await botOff.listo;
    // Lo mismo que hace app.ts. Las pruebas que miran el state usan botOn (el de este almacén).
    require('../../utils/estadoConversacion').registrarAlmacenEstado(botOnInstancia.stateHandler);
});

afterAll(() => {
    jest.restoreAllMocks();
    process.env = { ...ENV_ORIGINAL };
});

beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ENV_ORIGINAL, TRAZABILIDAD_V2_ENABLED: 'true' };
    delete process.env.API_BACKEND_URL;
    delete process.env.NUMERO_ASESOR_HUMANO;
    for (const m of ['log', 'warn', 'error'] as const) jest.spyOn(console, m).mockImplementation(() => undefined);
    api.consultarCitasRecordatorio.mockResolvedValue({ ok: true, origen: 'recordatorio', citas: [CITA_A, CITA_B] });
    api.responderRecordatorio.mockImplementation(async (_c: string, _d: string, respuesta: string, citaId: string) => ({
        ok: true,
        data: {
            cita_id: citaId, agenda_id: citaId, agenda_id_externa: 1, fecha_cita: '2099-10-17', hora_cita: '15:00',
            profesional: 'Carlos Gómez', estado_resultado: respuesta === 'confirma' ? 'confirmada' : 'cancelada',
            accion: respuesta, persistido: true,
        },
    }));
});

const estadoOn = (from: string) => botOnInstancia.stateHandler.getMyState(from)();
const eventosDe = (from: string, tipo: string) =>
    traza._estadoParaPruebas().cola.filter((e: any) => e.tipo_evento === tipo && e.telefono === from);
const filasLista = (salida: Enviado[]) => salida.find((m) => m.lista)!.lista.action.sections[0].rows;

// ---------------------------------------------------------------------------
// T-01
// ---------------------------------------------------------------------------

describe('T-01: 502 POSTGRES_DESPUES_DE_GLOBHO', () => {
    const REPROGRAMAR = [...INICIO, 'Reprogramar cita', 'doc_cc', '1111111', '1', 'Si', '1', '1', 'Si'];

    it('reprogramar (menú): mensaje de "sí quedó movida" con el horario pedido, sin reintento, sin tick, sesión cerrada', async () => {
        api.reagendarCita.mockResolvedValueOnce({ ok: false, error: 'POSTGRES_DESPUES_DE_GLOBHO', code: 502 });
        const from = nuevoNumero();
        const salida = textos(await botOn.enviar(from, REPROGRAMAR));
        expect(api.reagendarCita).toHaveBeenCalledTimes(1);
        const esperado = 'Tu cita sí quedó movida al nuevo horario (📅 12 de enero de 2099 🕐 09:30), pero necesitamos ' +
            'verificarla en nuestro sistema. Un asesor la revisará; si quieres, comunícate con él:\n👉 https://wa.me/573158070460';
        expect(salida).toContain(esperado);
        expect(salida.join('\n')).not.toMatch(/intenta nuevamente|Error al reagendar|se ha agendado con éxito/i);
        expect(poller.programarTickCascadaRetrasado).not.toHaveBeenCalled();
        expect(estadoOn(from)).toEqual({ celular: from }); // closeUserSession
        expect(mgr.isSessionExpired(from)).toBe(true);

        const [error] = eventosDe(from, 'backend_error');
        expect(error.metadata).toEqual(expect.objectContaining({ endpoint: '/chatbot/reagendar', http_status: 502, cause: 'POSTGRES_DESPUES_DE_GLOBHO' }));
        const fin = eventosDe(from, 'flujo_fin').pop();
        expect(fin).toEqual(expect.objectContaining({ flujo: 'reprogramar', resultado: 'revision_manual' }));
        expect(api.registrarActividadBot).toHaveBeenCalledWith('chat_flujo_reprogramar', from,
            expect.objectContaining({ resultado: 'postgres_despues_de_globho' }));
    });

    it('reprogramar: si el backend manda el horario en data, se usa ese', async () => {
        api.reagendarCita.mockResolvedValueOnce({
            ok: false, error: 'POSTGRES_DESPUES_DE_GLOBHO', code: 502, nuevaFechaCita: '2099-02-03', nuevaHoraCita: '16:45:00',
        });
        const salida = textos(await botOn.enviar(nuevoNumero(), REPROGRAMAR));
        expect(salida.join('\n')).toMatch(/\(📅 3 de febrero de 2099 🕐 16:45\)/);
    });

    it('reprogramar: GLOBHO_ERROR y error genérico no cambian', async () => {
        api.reagendarCita.mockResolvedValueOnce({ ok: false, error: 'GLOBHO_ERROR', code: 502, citaAnteriorRestaurada: true });
        expect(textos(await botOn.enviar(nuevoNumero(), REPROGRAMAR))).toContain(MOV.MENSAJE_MOVIMIENTO_CITA_RESTAURADA);
        api.reagendarCita.mockResolvedValueOnce({ ok: false, error: 'ERROR', code: 500 });
        expect(textos(await botOn.enviar(nuevoNumero(), REPROGRAMAR))).toContain('Error al reagendar la cita. Por favor, intenta nuevamente.');
        api.reagendarCita.mockResolvedValueOnce({ ok: true, cita: {} });
        expect(textos(await botOn.enviar(nuevoNumero(), REPROGRAMAR))).toContain('Tu cita se ha agendado con éxito. 📅👍');
        expect(poller.programarTickCascadaRetrasado).toHaveBeenCalledTimes(1);
    });

    it('aceptar oferta: mensaje con el horario de data, sin reintento, trazado como revision_manual', async () => {
        api.responderOfertaCupo.mockResolvedValueOnce({
            ok: false, code: 502, cause: 'POSTGRES_DESPUES_DE_GLOBHO', nuevaFechaCita: '2099-10-03', nuevaHoraCita: '07:00:00',
            data: { isError: true, cause: 'POSTGRES_DESPUES_DE_GLOBHO', code: 502, data: { cita_creada_en_globho: true, cita_anterior_restaurada: false, nueva_fecha_cita: '2099-10-03', nueva_hora_cita: '07:00:00' } },
        });
        process.env.NUMERO_ASESOR_HUMANO = '573000000000';
        const from = nuevoNumero();
        const salida = textos(await botOn.enviar(from, ['Sí, lo tomo', '1234567890']));
        expect(api.responderOfertaCupo).toHaveBeenCalledWith('1234567890', from, 'acepta');
        expect(salida).toContain('Tu cita sí quedó movida al nuevo horario (📅 3 de octubre de 2099 🕐 07:00), pero necesitamos ' +
            'verificarla en nuestro sistema. Un asesor la revisará; si quieres, comunícate con él:\n👉 https://wa.me/573000000000');
        expect(salida.join('\n')).not.toMatch(/intenta nuevamente|Ocurrió un error/i);
        expect(eventosDe(from, 'backend_error')[0].metadata).toEqual(expect.objectContaining({ cause: 'POSTGRES_DESPUES_DE_GLOBHO', http_status: 502 }));
        expect(eventosDe(from, 'flujo_fin').pop()).toEqual(expect.objectContaining({ flujo: 'lista_espera', resultado: 'revision_manual' }));
        expect(mgr.isSessionExpired(from)).toBe(true);
    });

    it('aceptar oferta: GLOBHO_ERROR y 500 no cambian', async () => {
        api.responderOfertaCupo.mockResolvedValueOnce({ ok: false, code: 502, cause: 'GLOBHO_ERROR', citaAnteriorRestaurada: true });
        expect(textos(await botOn.enviar(nuevoNumero(), ['Sí, lo tomo', '1234567890']))).toContain(MOV.MENSAJE_MOVIMIENTO_CITA_RESTAURADA);
        api.responderOfertaCupo.mockResolvedValueOnce({ ok: false, code: 500, cause: 'INTERNAL' });
        expect(textos(await botOn.enviar(nuevoNumero(), ['Sí, lo tomo', '1234567890'])))
            .toContain('Ocurrió un error procesando tu respuesta. Por favor intenta nuevamente en unos minutos.');
    });
});

// ---------------------------------------------------------------------------
// T-02
// ---------------------------------------------------------------------------

describe('T-02: los flujos de recordatorio renuevan la sesión', () => {
    beforeEach(() => {
        desfaseReloj = 0;
        descartarTimersPrevios();
    });

    it('sesión abierta a las 9:00, botón a las 9:58, el timer original vence a las 10:00 → la lista sigue funcionando', async () => {
        const from = nuevoNumero();
        await botOn.enviar(from, INICIO); // sesión abierta
        desfaseReloj = 58 * MIN;
        const salida = await botOn.enviar(from, ['Necesito cancelar', '1234567890']);
        const filas = filasLista(salida);
        desfaseReloj = 61 * MIN;
        expect(dispararVencidos()).toBe(0); // el timer de las 9:00 se canceló al renovar
        expect(estadoOn(from).recordatorioCitas).toHaveLength(2);

        const conf = await botOn.enviar(from, [filas[1].id]);
        expect(conf.find((m) => m.botones)?.texto).toMatch(/17 de octubre de 2099\n🕐 15:00\n👤 Carlos Gómez/);
        desfaseReloj = 115 * MIN; // menos de 1 h desde la última respuesta (10:01)
        expect(dispararVencidos()).toBe(0);
        const fin = textos(await botOn.enviar(from, ['Sí, cancelar']));
        expect(api.responderRecordatorio).toHaveBeenCalledWith(from, '1234567890', 'no_asistira', CITA_B.cita_id);
        expect(fin.join('\n')).toMatch(/Listo, cancelamos tu cita del 17 de octubre de 2099/);
        // Final: sesión cerrada y sin timer pendiente que la cuente como abandono.
        expect(mgr.isSessionExpired(from)).toBe(true);
        desfaseReloj = 10 * UNA_HORA;
        dispararVencidos();
        expect(api.registrarActividadBot).not.toHaveBeenCalledWith('chat_abandonado', from, expect.anything(), expect.anything());
    });

    it('sin sesión previa (TRAZABILIDAD_V2 apagado): el botón abre la sesión y el final la cierra', async () => {
        delete process.env.TRAZABILIDAD_V2_ENABLED;
        const from = nuevoNumero();
        expect(mgr.isSessionExpired(from)).toBe(true);
        const salida = await botOn.enviar(from, ['No podré asistir', '1234567890']);
        expect(mgr.isSessionExpired(from)).toBe(false);
        await botOn.enviar(from, [filasLista(salida)[0].id, 'Sí, cancelar']);
        expect(api.responderRecordatorio).toHaveBeenCalledWith(from, '1234567890', 'no_asistira', CITA_A.cita_id);
        expect(mgr.isSessionExpired(from)).toBe(true);
        desfaseReloj = 10 * UNA_HORA;
        dispararVencidos();
        expect(api.registrarActividadBot).not.toHaveBeenCalledWith('chat_abandonado', from, expect.anything(), expect.anything());
    });

    it('1 h real sin actividad con la lista abierta (el timer corre) → "conversación terminada", sin cancelar', async () => {
        const from = nuevoNumero();
        const salida = await botOn.enviar(from, ['Necesito cancelar', '1234567890']);
        const filas = filasLista(salida);
        desfaseReloj = 61 * MIN;
        expect(dispararVencidos()).toBeGreaterThan(0);
        expect(estadoOn(from)).toEqual({ celular: from });
        const fin = textos(await botOn.enviar(from, [filas[0].id]));
        expect(fin).toContain(MSG_TERMINADA);
        expect(api.responderRecordatorio).not.toHaveBeenCalled();
    });

    it('1 h real sin actividad y el timer no alcanzó a correr → la renovación cierra la vencida antes de leer: mismo resultado', async () => {
        const from = nuevoNumero();
        const salida = await botOn.enviar(from, ['Necesito cancelar', '1234567890']);
        const filas = filasLista(salida);
        desfaseReloj = 61 * MIN; // sin dispararVencidos()
        const fin = textos(await botOn.enviar(from, [filas[0].id]));
        expect(fin).toContain(MSG_TERMINADA);
        expect(api.responderRecordatorio).not.toHaveBeenCalled();
        expect(eventosDe(from, 'sesion_fin').map((e: any) => e.resultado)).toEqual(expect.arrayContaining(['timeout']));
    });

    it('confirmación con la sesión renovada en el documento: el timer de la entrada no la borra', async () => {
        api.consultarCitasRecordatorio.mockResolvedValueOnce({ ok: true, origen: 'recordatorio', citas: [CITA_A] });
        const from = nuevoNumero();
        await botOn.enviar(from, ['Necesito cancelar']);
        desfaseReloj = 50 * MIN;
        await botOn.enviar(from, ['1234567890']); // muestra la confirmación
        desfaseReloj = 70 * MIN;
        expect(dispararVencidos()).toBe(0);
        await botOn.enviar(from, ['Sí, cancelar']);
        expect(api.responderRecordatorio).toHaveBeenCalledWith(from, '1234567890', 'no_asistira', CITA_A.cita_id);
    });
});

// ---------------------------------------------------------------------------
// T-04
// ---------------------------------------------------------------------------

describe('T-04: entrada por keyword sin sesión', () => {
    beforeEach(() => {
        desfaseReloj = 0;
        descartarTimersPrevios();
    });

    it('"cancelar" como primer mensaje → pide el documento y cancela', async () => {
        const from = nuevoNumero();
        const s1 = textos(await botOn.enviar(from, ['cancelar']));
        expect(s1).toEqual(expect.arrayContaining([
            'Perfecto, te solicitaré algunos datos para poder cancelar tu cita. 😊🗓️',
            '[lista] Selecciona tu tipo de documento:',
        ]));
        const s2 = textos(await botOn.enviar(from, ['doc_cc']));
        expect(s2).toContain('Ahora, por favor digita tu número de documento 🔢:');
        await botOn.enviar(from, ['1111111', '1', 'Si']);
        expect(api.cancelarCita).toHaveBeenCalledWith(9001);
    });

    it('"cancelar" como primer mensaje, "No" y "Reprogramar cita" → sigue a reprogramar (antes terminaba en silencio)', async () => {
        const from = nuevoNumero();
        const salida = textos(await botOn.enviar(from, ['cancelar', 'doc_cc', '1111111', '1', 'No', 'Reprogramar cita', '1', 'Si']));
        expect(salida).toContain('Por favor, digita el número de la cita que deseas reprogramar 🗓️:');
        expect(salida).not.toContain(MSG_VENCIDA);
        expect(api.cancelarCita).not.toHaveBeenCalled();
        expect(api.consultarFechasCitasDisponibles).toHaveBeenCalled();
    });

    it('"Necesito cancelar" con RECORDATORIOS_BOTONES apagado → cancelar guiado, pide el documento', async () => {
        const from = nuevoNumero();
        const salida = textos(await botOff.enviar(from, ['Necesito cancelar', 'doc_cc']));
        expect(salida).toContain('[lista] Selecciona tu tipo de documento:');
        expect(salida).toContain('Ahora, por favor digita tu número de documento 🔢:');
    });

    it('"reprogramar" como primer mensaje → pide el documento y llega a las fechas', async () => {
        const from = nuevoNumero();
        const salida = textos(await botOn.enviar(from, ['reprogramar', 'doc_cc', '1111111', '1', 'Si']));
        expect(salida).toContain('Perfecto, te solicitaré algunos datos para poder reprogramar tu cita. 😊🗓️');
        expect(salida).toContain('Ahora, por favor digita tu número de documento 🔢:');
        expect(api.consultarFechasCitasDisponibles).toHaveBeenCalled();
    });

    it('"agendar" como primer mensaje → bienvenida con la política de datos (no silencio, no la salta)', async () => {
        const salida = textos(await botOn.enviar(nuevoNumero(), ['agendar']));
        expect(salida.join('\n')).toMatch(/Bienvenido a la IPS Centro de Orientación/);
        expect(salida).toContain('¿Aceptas nuestras políticas de datos?');
    });

    it('"agendar" con sesión activa sigue igual', async () => {
        const salida = textos(await botOn.enviar(nuevoNumero(), [...INICIO, 'agendar']));
        expect(salida).toContain('¿Cómo deseas agendar tu cita?');
    });

    it('opción de Conocer la IPS sin sesión → muestra el contenido y el "¿Que deseas hacer?"', async () => {
        const from = nuevoNumero();
        const s1 = textos(await botOn.enviar(from, ['280525001']));
        expect(s1).toContain('[lista] Selecciona la acción que desees');
        const otro = nuevoNumero();
        const s2 = textos(await botOn.enviar(otro, ['280525016']));
        expect(s2.join('\n')).toMatch(/Nuestro horario de atención/);
        expect(s2).toContain('¿Que deseas hacer?');
        const s3 = textos(await botOn.enviar(otro, ['Volver al menú']));
        expect(s3).toContain('[lista] Selecciona la acción que deseas realizar');
        expect(s3).not.toContain(MSG_VENCIDA);
    });

    it('PQRS fuera de horario sin sesión → mensaje y menú (antes el menú terminaba en silencio)', async () => {
        const salida = textos(await botOn.enviar(nuevoNumero(), ['PQRS']));
        expect(salida.join('\n')).toMatch(/nuestros agentes no están disponibles/);
        expect(salida).toContain('[lista] Selecciona la acción que deseas realizar');
    });

    it('sesión vencida a mitad de un flujo → mensaje neutro, nunca silencio', async () => {
        const from = nuevoNumero();
        await botOn.enviar(from, [...INICIO, 'Agendar cita']);
        desfaseReloj = 61 * MIN;
        const salida = textos(await botOn.enviar(from, ['Presencial']));
        // step2 envía su pregunta y su checkSessionTimeout termina el flujo: antes, sin nada más.
        expect(salida[salida.length - 1]).toBe(MSG_VENCIDA);
        expect(salida.join('\n')).not.toMatch(/Selecciona la especialidad|¿Cuál es tu especialidad/);
        expect(estadoOn(from)).toEqual({ celular: from });
        expect(MSG_VENCIDA).toBe('Tu conversación anterior terminó por inactividad. Escribe *hola* para empezar de nuevo. 😊');
    });
});
