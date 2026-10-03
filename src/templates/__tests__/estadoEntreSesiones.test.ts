// TBOT-02 / C6 (proyecto-ips/docs/features/2026-10-02-informe-qa-lista-espera.md): el `state` de
// @builderbot no se limpiaba entre sesiones y una sesión nueva desde el mismo celular agendaba a nombre del
// paciente anterior al tocar "Particular". Prueba con el motor REAL (createBot + handleMsg), la lista REAL de
// flujos y el gestor REAL de sesiones (proactiveSessionManager), con un provider falso en memoria. Sin Meta
// ni backend: apiService y axios simulados; los JSON de runtime (sesiones, métricas, intentos) no se tocan.
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

const PACIENTES: Record<string, { pacientes_id: string; nombre_paciente: string }> = {
    '1111111': { pacientes_id: 'PA', nombre_paciente: 'Paciente Uno' },
    '2222222': { pacientes_id: 'PB', nombre_paciente: 'Paciente Dos' },
};
const citaDe = (doc: string) => ({
    fecha_cita: '2099-01-10',
    hora_cita: '08:00:00',
    especialidad: 'Psicología',
    estado_agenda: 'Pendiente',
    agenda_id_externa: doc === '1111111' ? 9001 : 9002,
    profesional_id: doc === '1111111' ? 'E1' : 'E2',
    nombre_profesional: doc === '1111111' ? 'Prof Uno' : 'Prof Dos',
    catalogo: 'CONSULTA DE CONTROL',
    convenio: '',
});

jest.mock('../../services/apiService', () => {
    const real = jest.requireActual('../../services/apiService');
    return {
        ...real,
        registrarActividadBot: jest.fn(async () => true),
        consultarFechasCitasDisponibles: jest.fn(async () => ['2099-01-10']),
        consultarCitasFecha: jest.fn(async () => [{
            fechacita: '2099-01-10', horacita: '08:00', horafinal: '08:40', profesionalId: 'E9',
            profesional: 'Prof Nueve', especialidad: 'Psicología', lugar: 'Sede',
        }]),
        consultarPacientePorDocumento: jest.fn(async (doc: string) => PACIENTES[doc] ?? null),
        consultarCitasPaciente: jest.fn(async (doc: string) => (PACIENTES[doc] ? [{
            pacientes_id: PACIENTES[doc].pacientes_id, numero_contacto: '3000000000', email: 'a@b.co',
            fecha_nacimiento: '1990-01-01', edad: 35, nombre_paciente: PACIENTES[doc].nombre_paciente,
            especialidad: 'Psicologia', profesional_id: 'E1', nombre_profesional: 'Prof Uno',
        }] : [])),
        consultarCitasProximasPaciente: jest.fn(async (doc: string) => (PACIENTES[doc] ? [citaDe(doc)] : [])),
        crearCita: jest.fn(async () => ({ ok: true })),
        cancelarCita: jest.fn(async () => 'ok'),
        responderOfertaCupo: jest.fn(async () => ({ ok: true, code: 200, data: { registrado: true } })),
        responderRecordatorio: jest.fn(async () => ({ ok: true, data: { accion: 'confirma', persistido: true } })),
        consultarCitasRecordatorio: jest.fn(async () => ({ ok: true, origen: 'recordatorio', citas: [{
            cita_id: 'AG000001', agenda_id_externa: 9001, fecha_cita: '2099-01-10', hora_cita: '08:00',
            profesional: 'Prof Uno', tipo_recordatorio: '24h', estado_agenda: 'Pendiente',
        }] })),
        confirmarCitaCampahna: jest.fn(async () => ({ ok: true, estado: 'confirmada' })),
    };
});

import { EventEmitter } from 'events';
import type { MENSAJE_CONVERSACION_TERMINADA as TipoMensaje } from '../../utils/estadoConversacion';

// Las conversaciones completas son largas (cada mensaje espera a que el motor quede quieto).
jest.setTimeout(60000);

const UNA_HORA = 60 * 60 * 1000;
const ENV_ORIGINAL = { ...process.env };

// Timers de sesión de 1 h: se capturan (por número, en orden) en vez de programarse de verdad, para poder
// dispararlos a mano. Todo lo demás pasa al setTimeout real. setInterval se deja con unref para que los
// barridos periódicos del gestor de sesiones no mantengan vivo el proceso de jest.
const setTimeoutReal = global.setTimeout;
const setIntervalReal = global.setInterval;
const timersSesion: Array<() => void> = [];
let desfaseReloj = 0;
const dateNowReal = Date.now.bind(Date);

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

let provider: FakeProvider;
let bot: any;
let api: any;
let MENSAJE_TERMINADA: typeof TipoMensaje;
let numero = 573000000500;
const nuevoNumero = () => String(numero++);

async function enviar(from: string, textos: string[]): Promise<string[]> {
    const desde = provider.enviados.length;
    for (const body of textos) {
        provider.emit('message', { from, body, name: 'Prueba' });
        await esperarQuietud(provider);
    }
    return provider.enviados.slice(desde).filter((m) => m.to === from).map((m) => m.texto);
}

const estado = (from: string) => bot.stateHandler.getMyState(from)();
const sembrar = (from: string, valores: Record<string, any>) => bot.stateHandler.updateState({ from })(valores);

// Recorridos
const INICIO = ['hola', 'Acepto'];
const PRIMERA_VEZ_HASTA_PAGO = ['Agendar cita', 'Presencial', 'Primera vez', 'Psicologia', 'psicologia_adulto', '1', '1'];
const CONTROL_HASTA_FECHAS = ['Agendar cita', 'Presencial', 'Control', 'Psicologia', 'control_tipo_cedula', '1111111'];

beforeAll(async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: any, ms?: number, ...args: any[]) => {
        if (ms === UNA_HORA) {
            timersSesion.push(() => fn(...args));
            const h: any = setTimeoutReal(() => undefined, 0);
            h?.unref?.();
            return h;
        }
        return setTimeoutReal(fn, ms, ...args);
    }) as any);
    jest.spyOn(global, 'setInterval').mockImplementation(((fn: any, ms?: number, ...args: any[]) => {
        const h: any = setIntervalReal(fn, ms, ...args);
        h?.unref?.();
        return h;
    }) as any);
    jest.spyOn(Date, 'now').mockImplementation(() => dateNowReal() + desfaseReloj);

    // require (no import) para que los módulos se carguen DESPUÉS de instalar los espías de timers.
    const { createBot, MemoryDB } = require('@builderbot/bot');
    const templates = require('../index').construirTemplates(true);
    const { registrarAlmacenEstado, MENSAJE_CONVERSACION_TERMINADA } = require('../../utils/estadoConversacion');
    api = require('../../services/apiService');
    MENSAJE_TERMINADA = MENSAJE_CONVERSACION_TERMINADA;
    provider = new FakeProvider();
    bot = await createBot({ flow: templates, provider: provider as any, database: new MemoryDB() });
    registrarAlmacenEstado(bot.stateHandler); // lo mismo que hace app.ts
});

afterAll(() => {
    jest.restoreAllMocks();
    process.env = { ...ENV_ORIGINAL };
});

beforeEach(() => {
    jest.clearAllMocks();
    desfaseReloj = 0;
    process.env = { ...ENV_ORIGINAL };
    delete process.env.API_BACKEND_URL;
    delete process.env.TRAZABILIDAD_V2_ENABLED;
    for (const m of ['log', 'warn'] as const) jest.spyOn(console, m).mockImplementation(() => undefined);
});

describe('TBOT-02: el state no pasa de una sesión a la siguiente', () => {
    it('fin de flujo: sesión 1 agenda con Convenio y documento A; sesión 2 toca "Particular" → pide documento, agenda B como particular', async () => {
        const from = nuevoNumero();
        await enviar(from, [...INICIO, ...PRIMERA_VEZ_HASTA_PAGO, 'Convenio', 'conv_poliza_sura', 'agindarcita_tipo_cd', '1111111', 'Si']);
        expect(api.crearCita).toHaveBeenCalledTimes(1);
        expect(api.crearCita.mock.calls[0][0]).toEqual(expect.objectContaining({ paciente_id: 'PA', convenio_id: '014', convenio_nombre: 'SURA TH' }));
        // step19 cerró la sesión → state reiniciado (solo celular).
        expect(estado(from)).toEqual({ celular: from });

        const salida = await enviar(from, [...INICIO, ...PRIMERA_VEZ_HASTA_PAGO, 'Particular']);
        expect(salida).toContain('[lista] Selecciona tu tipo de documento:');
        expect(salida.join('\n')).not.toMatch(/Has seleccionado la siguiente cita/);

        await enviar(from, ['agindarcita_tipo_cd', '2222222', 'Si']);
        expect(api.crearCita).toHaveBeenCalledTimes(2);
        expect(api.crearCita.mock.calls[1][0]).toEqual(expect.objectContaining({
            paciente_id: 'PB', convenio_id: '1787', convenio_nombre: 'PARTICULAR',
        }));
    });

    it('"Salir" (volver al menú → Salir): limpia el state; la sesión 2 pide el documento', async () => {
        const from = nuevoNumero();
        // Control con A: en el mismo recorrido "Particular" usa el documento recién digitado (atajo legítimo).
        const s1 = await enviar(from, [...INICIO, ...CONTROL_HASTA_FECHAS, '1', '1', 'Particular']);
        expect(s1.join('\n')).toMatch(/Has seleccionado la siguiente cita/);
        expect(estado(from)).toEqual(expect.objectContaining({ pacienteId: 'PA', numeroDocumentoPaciente: '1111111' }));
        await enviar(from, ['No', 'Salir']);
        expect(estado(from)).toEqual({ celular: from });
        expect(api.crearCita).not.toHaveBeenCalled();

        const s2 = await enviar(from, [...INICIO, ...PRIMERA_VEZ_HASTA_PAGO, 'Particular']);
        expect(s2).toContain('[lista] Selecciona tu tipo de documento:');
        await enviar(from, ['agindarcita_tipo_cd', '2222222', 'Si']);
        expect(api.crearCita).toHaveBeenCalledTimes(1);
        expect(api.crearCita.mock.calls[0][0]).toEqual(expect.objectContaining({ paciente_id: 'PB' }));
    });

    it('"Salir" (exitFlow) sin captura pendiente: limpia el state y conserva celular', async () => {
        const from = nuevoNumero();
        await enviar(from, INICIO); // menú (lista, sin captura)
        await sembrar(from, { pacienteId: 'PA', numeroDocumentoPaciente: '1111111', tipoDoc: 'Cédula', idConvenio: '014' });
        const salida = await enviar(from, ['Salir']);
        expect(salida.join('\n')).toMatch(/Gracias por usar nuestro servicio/);
        expect(estado(from)).toEqual({ celular: from });
    });

    it('timeout por el timer de 1 h: limpia el state; la sesión 2 pide el documento y no usa A', async () => {
        const from = nuevoNumero();
        await enviar(from, [...INICIO, ...CONTROL_HASTA_FECHAS]); // queda esperando el número de la fecha
        expect(estado(from)).toEqual(expect.objectContaining({ pacienteId: 'PA', profesionalId: 'E1' }));

        timersSesion[timersSesion.length - 1](); // vence la sesión (closeSessionProactively)
        expect(estado(from)).toEqual({ celular: from });

        // La captura pendiente de s09 consume el primer mensaje y el paso termina por sesión vencida
        // (comportamiento preexistente, ver TBOT-06); el segundo "hola" ya abre la conversación nueva.
        await enviar(from, ['hola']);
        const s2 = await enviar(from, [...INICIO, ...PRIMERA_VEZ_HASTA_PAGO, 'Particular']);
        expect(s2).toContain('[lista] Selecciona tu tipo de documento:');
        // Primera vez sin profesional heredado del Control anterior.
        expect(api.consultarFechasCitasDisponibles).toHaveBeenLastCalledWith('Primera vez', 'Psicologia', undefined);
        await enviar(from, ['agindarcita_tipo_cd', '2222222', 'Si']);
        expect(api.crearCita).toHaveBeenCalledTimes(1);
        expect(api.crearCita.mock.calls[0][0]).toEqual(expect.objectContaining({ paciente_id: 'PB' }));
    });

    it('timeout detectado al recibir un mensaje (checkSessionTimeout): limpia el state', async () => {
        const from = nuevoNumero();
        await enviar(from, [...INICIO, ...CONTROL_HASTA_FECHAS, '1']); // s10: esperando la hora
        expect(estado(from)).toEqual(expect.objectContaining({ pacienteId: 'PA' }));
        desfaseReloj = UNA_HORA + 60 * 1000; // el timer no alcanzó a correr
        await enviar(from, ['1']); // s10 → s11 → s12: checkSessionTimeout detecta el vencimiento
        expect(estado(from)).toEqual({ celular: from });
    });

    it('WELCOME sin sesión activa: reinicia el state aunque nadie haya cerrado la sesión antes', async () => {
        const from = nuevoNumero();
        // P. ej. una respuesta a plantilla con TRAZABILIDAD_V2 apagada: deja state y nunca abre sesión.
        await sembrar(from, { pacienteId: 'PA', numeroDocumentoPaciente: '1111111', tipoDoc: 'Cédula', numeroDoc: '1111111' });
        await enviar(from, ['hola']);
        expect(estado(from)).toEqual({ celular: from });
    });

    it('WELCOME con sesión activa no borra nada; el step1 de agendar borra solo sus claves (conserva traza* y celular)', async () => {
        const from = nuevoNumero();
        await enviar(from, INICIO);
        await sembrar(from, {
            pacienteId: 'PA', numeroDocumentoPaciente: '1111111', tipoDoc: 'Cédula', idConvenio: '014',
            nombreServicioConvenio: 'SURA TH', profesionalId: 'E1', trazaReintentoOfertaAcepta: true,
        });
        await enviar(from, ['texto que no coincide con nada']); // WELCOME con sesión activa
        expect(estado(from)).toEqual(expect.objectContaining({ pacienteId: 'PA', trazaReintentoOfertaAcepta: true }));

        await enviar(from, ['Acepto', 'Agendar cita']);
        const s = estado(from);
        expect(s).toEqual(expect.objectContaining({ celular: from, trazaReintentoOfertaAcepta: true }));
        for (const clave of ['pacienteId', 'numeroDocumentoPaciente', 'tipoDoc', 'idConvenio', 'nombreServicioConvenio', 'profesionalId']) {
            expect(s[clave]).toBeUndefined();
        }
        const salida = await enviar(from, ['Presencial', 'Primera vez', 'Psicologia', 'psicologia_adulto', '1', '1', 'Particular']);
        expect(salida).toContain('[lista] Selecciona tu tipo de documento:');
    });

    it('lista vieja tocada en una conversación nueva (tipo de documento de agendar / de cancelar) → no sigue sin contexto', async () => {
        const from = nuevoNumero();
        await enviar(from, INICIO);
        const ag = await enviar(from, ['agindarcita_tipo_cd']);
        expect(ag).toContain(MENSAJE_TERMINADA);
        const ca = await enviar(from, ['doc_cc']);
        expect(ca).toContain(MENSAJE_TERMINADA);
        expect(api.consultarPacientePorDocumento).not.toHaveBeenCalled();
    });
});

describe('TBOT-02: cancelar y reprogramar', () => {
    it('cancelar: sesión 1 cancela la cita de A y sale; sesión 2 pide el documento y cancela la de B', async () => {
        const from = nuevoNumero();
        await enviar(from, [...INICIO, 'Cancelar cita', 'doc_cc', '1111111', '1', 'Si']);
        expect(api.cancelarCita).toHaveBeenLastCalledWith(9001);
        await enviar(from, ['Salir']); // volver al menú → Salir
        expect(estado(from)).toEqual({ celular: from });

        const s2 = await enviar(from, [...INICIO, 'Cancelar cita']);
        expect(s2).toContain('[lista] Selecciona tu tipo de documento:');
        expect(estado(from)?.citasProgramadas).toBeUndefined();
        await enviar(from, ['doc_cc', '2222222', '1', 'Si']);
        expect(api.consultarCitasProximasPaciente).toHaveBeenLastCalledWith('2222222');
        expect(api.cancelarCita).toHaveBeenLastCalledWith(9002);
    });

    it('cancelar: el step1 borra documento y citas de un recorrido anterior dentro de la misma sesión', async () => {
        const from = nuevoNumero();
        await enviar(from, INICIO);
        await sembrar(from, { numeroDoc: '1111111', tipoDoc: 'Cédula', citasProgramadas: [citaDe('1111111')], citaSeleccionadaCancelar: citaDe('1111111') });
        await enviar(from, ['Cancelar cita']);
        const s = estado(from);
        expect(s.flujoSeleccionadoMenu).toBe('cancelarCita');
        expect(s.numeroDoc).toBeUndefined();
        expect(s.citasProgramadas).toBeUndefined();
        expect(s.citaSeleccionadaCancelar).toBeUndefined();
    });

    it('reprogramar: sesión 1 con A vence (checkSessionTimeout); sesión 2 pide el documento y usa el profesional de B', async () => {
        const from = nuevoNumero();
        await enviar(from, [...INICIO, 'Reprogramar cita', 'doc_cc', '1111111', '1']); // s07: ¿seguro?
        expect(estado(from)?.citaSeleccionadaProgramada).toEqual(expect.objectContaining({ agenda_id_externa: 9001 }));
        desfaseReloj = UNA_HORA + 60 * 1000;
        await enviar(from, ['Si']); // stepConfirmaReprogramar: sesión vencida → cierre y limpieza
        expect(estado(from)).toEqual({ celular: from });
        expect(api.consultarFechasCitasDisponibles).not.toHaveBeenCalled();

        desfaseReloj = 2 * (UNA_HORA + 60 * 1000);
        const s2 = await enviar(from, [...INICIO, 'Reprogramar cita']);
        expect(s2).toContain('[lista] Selecciona tu tipo de documento:');
        await enviar(from, ['doc_cc', '2222222', '1', 'Si']);
        expect(api.consultarCitasProximasPaciente).toHaveBeenLastCalledWith('2222222');
        expect(api.consultarFechasCitasDisponibles).toHaveBeenLastCalledWith('Control', 'Psicología', 'E2');
    });
});

describe('TBOT-02: las respuestas a plantillas siguen funcionando', () => {
    for (const v2 of [false, true]) {
        describe(`TRAZABILIDAD_V2_ENABLED=${v2}`, () => {
            beforeEach(() => {
                if (v2) process.env.TRAZABILIDAD_V2_ENABLED = 'true';
            });

            it('"Sí, lo tomo" + documento → responderOfertaCupo con ESE documento (no uno viejo del state)', async () => {
                const from = nuevoNumero();
                await sembrar(from, { numeroDocOfertaCupo: '9999999', respuestaOfertaCupo: 'rechaza', pacienteId: 'PA' });
                const salida = await enviar(from, ['Sí, lo tomo', '1234567890']);
                expect(salida[0]).toMatch(/Para confirmar que el espacio es para ti/);
                expect(api.responderOfertaCupo).toHaveBeenCalledTimes(1);
                expect(api.responderOfertaCupo).toHaveBeenCalledWith('1234567890', from, 'acepta');
            });

            it('"No puedo" con un documento inválido y luego válido → un solo rechazo con el documento válido', async () => {
                const from = nuevoNumero();
                await enviar(from, ['No puedo', 'xx', '1234567890']);
                expect(api.responderOfertaCupo).toHaveBeenCalledTimes(1);
                expect(api.responderOfertaCupo).toHaveBeenCalledWith('1234567890', from, 'rechaza');
            });

            it('"Confirmo asistencia" y "Confirmo" (campaña) siguen usando el documento recién digitado', async () => {
                const from = nuevoNumero();
                await sembrar(from, { numeroDocRecordatorio: '9999999', numeroDoc: '9999999' });
                await enviar(from, ['Confirmo asistencia', '1234567890']);
                expect(api.consultarCitasRecordatorio).toHaveBeenCalledWith('1234567890', from);
                expect(api.responderRecordatorio).toHaveBeenCalledWith(from, '1234567890', 'confirma', 'AG000001');
                await enviar(from, ['Confirmo', '1234567891']);
                expect(api.confirmarCitaCampahna).toHaveBeenCalledWith(from, '1234567891');
            });

            it('respuesta a la oferta tras una sesión cerrada por timeout: funciona igual', async () => {
                const from = nuevoNumero();
                await enviar(from, INICIO);
                timersSesion[timersSesion.length - 1]();
                expect(estado(from)).toEqual({ celular: from });
                await enviar(from, ['Sí, lo tomo', '1234567890']);
                expect(api.responderOfertaCupo).toHaveBeenCalledWith('1234567890', from, 'acepta');
            });
        });
    }
});
