jest.mock('fs', () => {
    const real = jest.requireActual('fs');
    const runtime = (p: unknown) =>
        /(userSessionsDB|metricsDB|userAttemptsDB|crisisBlacklistDB)\.json$|trazabilidadSpool\.jsonl$/.test(String(p));
    return {
        ...real,
        existsSync: jest.fn((p: any) => (runtime(p) ? false : real.existsSync(p))),
        readFileSync: jest.fn((p: any, ...a: any[]) => (runtime(p) ? '{}' : real.readFileSync(p, ...a))),
        writeFileSync: jest.fn((p: any, ...a: any[]) => (runtime(p) ? undefined : real.writeFileSync(p, ...a))),
        appendFileSync: jest.fn((p: any, ...a: any[]) => (runtime(p) ? undefined : real.appendFileSync(p, ...a))),
    };
});
jest.mock('axios', () => ({
    __esModule: true,
    default: { post: jest.fn(async () => ({ data: {} })), get: jest.fn(async () => ({ data: {} })) },
}));
jest.mock('../../services/citasService', () => ({
    ...jest.requireActual('../../services/citasService'), esBotHabilitado: () => true,
}));
jest.mock('../../utils/verificarHorario', () => ({
    ...jest.requireActual('../../utils/verificarHorario'), isWorkingHours: jest.fn(() => false),
}));
jest.mock('../../utils/listaEsperaCascadaPoller', () => ({
    ...jest.requireActual('../../utils/listaEsperaCascadaPoller'),
    programarTickCascadaRetrasado: jest.fn(),
}));

const CITA_BASE = {
    fecha_cita: '2099-01-10', hora_cita: '08:00:00', especialidad: 'Psicología', estado_agenda: 'Pendiente',
    agenda_id_externa: 9001, profesional_id: 'E1', nombre_profesional: 'Prof Uno', catalogo: 'CONSULTA DE CONTROL',
    convenio: '', pacientes_id: 'PA', tipo_cita: '1',
};
const HORA = (hora: string) => ({
    fechacita: '2099-01-12', horacita: hora, horafinal: '10:40', profesionalId: 'E1',
    profesional: 'Prof Uno', especialidad: 'Psicología', lugar: 'Sede',
});

jest.mock('../../services/apiService', () => {
    const real = jest.requireActual('../../services/apiService');
    return {
        ...real,
        registrarActividadBot: jest.fn(async () => true),
        consultarPacientePorDocumento: jest.fn(async () => ({ pacientes_id: 'PA', nombre_paciente: 'Paciente Uno' })),
        consultarCitasProximasPaciente: jest.fn(async () => [CITA_BASE]),
        consultarFechasCitasDisponibles: jest.fn(async () => ['2099-01-12']),
        consultarCitasFecha: jest.fn(async () => [HORA('09:30')]),
        reagendarCita: jest.fn(async () => ({ ok: true, cita: {} })),
        crearCita: jest.fn(async () => ({ ok: true })),
    };
});

import { EventEmitter } from 'events';

jest.setTimeout(90000);
const setTimeoutReal = global.setTimeout;
const setIntervalReal = global.setInterval;
const ENV_ORIGINAL = { ...process.env };

type Enviado = { to: string; texto: string; lista?: any };
class FakeProvider extends EventEmitter {
    enviados: Enviado[] = [];
    async sendMessage(to: string, texto: string) {
        this.enviados.push({ to, texto });
        return { ok: true };
    }
    async sendList(to: string, list: any) {
        this.enviados.push({ to, texto: `[lista] ${list?.body?.text ?? ''}`, lista: list });
        return { ok: true };
    }
}

const esperar = (ms: number) => new Promise((resolve) => setTimeoutReal(resolve, ms));
async function esperarQuietud(provider: FakeProvider) {
    let anterior = -1;
    let estable = 0;
    for (let i = 0; i < 60; i++) {
        await esperar(50);
        if (provider.enviados.length === anterior) {
            estable += 50;
            if (estable >= 250) return;
        } else {
            anterior = provider.enviados.length;
            estable = 0;
        }
    }
}

let provider: FakeProvider;
let bot: any;
let api: any;
let numero = 573000002000;
const inicio = ['hola', 'Acepto'];
const nuevoNumero = () => String(numero++);

async function enviar(from: string, entradas: string[]): Promise<Enviado[]> {
    const desde = provider.enviados.length;
    for (const body of entradas) {
        provider.emit('message', { from, body, name: 'Prueba' });
        await esperarQuietud(provider);
    }
    return provider.enviados.slice(desde).filter((m) => m.to === from);
}
const textos = (salida: Enviado[]) => salida.map((m) => m.texto);

beforeAll(async () => {
    jest.spyOn(global, 'setInterval').mockImplementation(((fn: any, ms?: number, ...args: any[]) => {
        const handle: any = setIntervalReal(fn, ms, ...args);
        handle?.unref?.();
        return handle;
    }) as any);
    const { createBot, MemoryDB } = require('@builderbot/bot');
    const templates = require('../index').construirTemplates(true);
    api = require('../../services/apiService');
    provider = new FakeProvider();
    bot = await createBot({ flow: templates, provider: provider as any, database: new MemoryDB() });
    require('../../utils/estadoConversacion').registrarAlmacenEstado(bot.stateHandler);
});

afterAll(() => {
    jest.restoreAllMocks();
    process.env = { ...ENV_ORIGINAL };
});

beforeEach(() => {
    jest.clearAllMocks();
    for (const metodo of ['log', 'warn', 'error'] as const) jest.spyOn(console, metodo).mockImplementation(() => undefined);
    api.consultarCitasProximasPaciente.mockResolvedValue([{ ...CITA_BASE }]);
    api.consultarFechasCitasDisponibles.mockResolvedValue(['2099-01-12']);
    api.consultarCitasFecha.mockResolvedValue([HORA('09:30')]);
    api.reagendarCita.mockResolvedValue({ ok: true, cita: {} });
});

describe('motor real - fase 1', () => {
    it('no entra a una captura de fechas cuando el backend devuelve una lista vacía', async () => {
        api.consultarFechasCitasDisponibles.mockResolvedValueOnce([]);
        const from = nuevoNumero();
        const salida = textos(await enviar(from, [...inicio, 'Reprogramar cita', 'doc_cc', '1111111', '1', 'Si']));
        expect(salida.join('\n')).toMatch(/agentes no est[aá]n disponibles/i);
        expect(bot.stateHandler.getMyState(from)()).toEqual({ celular: from });
        const nuevo = textos(await enviar(from, ['3']));
        expect(nuevo.join('\n')).toMatch(/solicitar[eé] algunos datos para poder reprogramar/i);
    });

    it('un catálogo de derivación no consulta fechas ni revela el motivo', async () => {
        api.consultarCitasProximasPaciente.mockResolvedValueOnce([{ ...CITA_BASE, catalogo: 'INTERVENCION EN CRISIS SOD' }]);
        const salida = textos(await enviar(
            nuevoNumero(), [...inicio, 'Reprogramar cita', 'doc_cc', '1111111', '1', 'Si']
        ));
        expect(api.consultarFechasCitasDisponibles).not.toHaveBeenCalled();
        expect(salida.join('\n')).toMatch(/agentes no est[aá]n disponibles/i);
        expect(salida[salida.length - 1]).not.toMatch(/crisis|especialidad|servicio|terapia/i);
    });

    it('catálogo otro conserva profesional y envía tipo control al reagendar', async () => {
        api.consultarCitasProximasPaciente.mockResolvedValueOnce([{ ...CITA_BASE, catalogo: 'PSICOTERAPIA INDIVIDUAL' }]);
        await enviar(nuevoNumero(), [...inicio, 'Reprogramar cita', 'doc_cc', '1111111', '1', 'Si', '1', '1', 'Si']);
        expect(api.consultarFechasCitasDisponibles).toHaveBeenCalledWith('Control', 'Psicología', 'E1');
        expect(api.reagendarCita).toHaveBeenCalledWith(expect.objectContaining({
            nueva_cita: expect.objectContaining({ tipo_consulta_paciente: 'control', profesional_id: 'E1' }),
        }));
    });

    it('2:20 no elige la segunda hora y 2 sí la elige', async () => {
        api.consultarCitasFecha.mockResolvedValueOnce([HORA('08:00'), HORA('09:00'), HORA('10:00')]);
        const from = nuevoNumero();
        await enviar(from, [...inicio, 'Agendar cita', 'Presencial', 'Primera vez', 'Psicologia', 'psicologia_adulto', '1']);
        const invalida = textos(await enviar(from, ['2:20']));
        expect(invalida.join('\n')).toMatch(/n[uú]mero.*antes de la hora/i);
        expect(invalida).not.toContain('Para agendar tu cita, requerimos los siguientes datos.');
        const valida = textos(await enviar(from, ['2']));
        expect(valida).toContain('Para agendar tu cita, requerimos los siguientes datos.');
        expect(bot.stateHandler.getMyState(from)().citaSeleccionadaHora.horacita).toBe('09:00');
    });

    it('reinicia contadores de días sin horas y errores después de un éxito', async () => {
        api.consultarCitasFecha.mockResolvedValueOnce([]).mockResolvedValueOnce([HORA('09:30')]);
        const from = nuevoNumero();
        await enviar(from, [...inicio, 'Reprogramar cita', 'doc_cc', '1111111', '1', 'Si', '1']);
        expect(bot.stateHandler.getMyState(from)().reprogramarDiasSinHoras).toBe(1);
        await enviar(from, ['1']);
        expect(bot.stateHandler.getMyState(from)().reprogramarDiasSinHoras).toBe(0);

        api.consultarCitasFecha.mockRejectedValueOnce(new Error('temporal')).mockResolvedValueOnce([HORA('09:30')]);
        const otro = nuevoNumero();
        await enviar(otro, [...inicio, 'Reprogramar cita', 'doc_cc', '1111111', '1', 'Si', '1']);
        expect(bot.stateHandler.getMyState(otro)().reprogramarErroresSeguidos).toBe(1);
        await enviar(otro, ['1']);
        expect(bot.stateHandler.getMyState(otro)().reprogramarErroresSeguidos).toBe(0);

        api.consultarCitasFecha.mockRejectedValueOnce(new Error('temporal')).mockResolvedValueOnce([HORA('09:30')]);
        const agendar = nuevoNumero();
        await enviar(agendar, [...inicio, 'Agendar cita', 'Presencial', 'Primera vez', 'Psicologia', 'psicologia_adulto', '1']);
        expect(bot.stateHandler.getMyState(agendar)().agendarErroresSeguidos).toBe(1);
        await enviar(agendar, ['1']);
        expect(bot.stateHandler.getMyState(agendar)().agendarErroresSeguidos).toBe(0);
    });

    it('hablar_con_agente valida contexto y funciona desde la lista de convenios', async () => {
        const terminada = textos(await enviar(nuevoNumero(), ['hablar_con_agente']));
        expect(terminada.join('\n')).toMatch(/conversaci[oó]n que ya termin[oó]/i);

        const from = nuevoNumero();
        await enviar(from, [...inicio, 'Agendar cita', 'Presencial', 'Primera vez', 'Psicologia', 'psicologia_adulto', '1', '1', 'Convenio']);
        const agente = textos(await enviar(from, ['hablar_con_agente']));
        expect(agente.join('\n')).toMatch(/agentes no est[aá]n disponibles/i);
    });

    it('texto libre en convenios repite la lista sin reiniciar la política', async () => {
        const from = nuevoNumero();
        await enviar(from, [...inicio, 'Agendar cita', 'Presencial', 'Primera vez', 'Psicologia', 'psicologia_adulto', '1', '1', 'Convenio']);
        const salida = textos(await enviar(from, ['Compensar']));
        expect(salida.join('\n')).toMatch(/No encontr[eé] ese convenio/i);
        expect(salida).toContain('[lista] Selecciona por favor tu convenio');
        expect(salida.join('\n')).not.toMatch(/pol[ií]tica de datos personales/i);
    });
});
