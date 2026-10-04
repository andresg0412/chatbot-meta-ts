// Respuesta a la plantilla de invitación a la lista de espera con el motor REAL de @builderbot (createBot +
// handleMsg) y la lista REAL de flujos, con un provider falso en memoria y apiService simulado (sin Meta
// ni backend). Cubre los recorridos de la sección 6.6 de
// proyecto-ips/docs/features/2026-10-04-campanas-invitacion-lista-espera-implementacion.md (con y sin
// payload) y el choque C11 con la captura del opt-in de agendar (T5/T7).

jest.mock('../../utils/proactiveSessionManager', () => ({
    setBotInstance: jest.fn(),
    updateUserActivity: jest.fn(),
    renovarActividadSesion: jest.fn(() => 'activa'),
    isSessionExpired: jest.fn(() => false),
    closeUserSession: jest.fn(),
    expirarSesionPorInactividad: jest.fn(),
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
        responderInvitacion: jest.fn(),
        consultarInvitacionesPorDocumento: jest.fn(),
        registrarOptinListaEspera: jest.fn(async () => ({ ok: true, code: 201, data: { invitacion_id: 'OPT00001', ya_existia: false } })),
        inscribirListaEspera: jest.fn(async () => ({ lista_espera_id: 'LE000001', paciente_id: 'P1', profesional_id: 'E1', cita_actual_id: 'A1', estado: 'activa' })),
        responderOfertaCupo: jest.fn(async () => ({ ok: true, code: 200, data: { registrado: true } })),
    };
});

import { EventEmitter } from 'events';
import { addKeyword, createBot, createFlow, MemoryDB } from '@builderbot/bot';
import { construirFlujosRegistrados } from '../index';
import * as api from '../../services/apiService';
import { closeUserSession } from '../../utils/proactiveSessionManager';
import * as M from '../../utils/mensajesInvitacionListaEspera';
import { MENSAJE_DOCUMENTO_FINAL } from '../../utils/mensajesConfirmacion';
import { ID_FILA_NINGUNA } from '../../utils/mensajesRecordatorio';
import { MENSAJE_SALIR } from '../flujos/palabrasGlobales';
import { stepListaEsperaOptIn, TEXTO_CONSENTIMIENTO_LISTA_ESPERA } from '../flujos/agendarCita/listaEspera/stepListaEsperaOptIn';

jest.setTimeout(30000);

const mockedApi = api as jest.Mocked<typeof api>;
const dateNowReal = Date.now.bind(Date);

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

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function esperarQuietud(provider: FakeProvider, maxMs = 4000) {
    let ultimo = -1;
    let estable = 0;
    const inicio = dateNowReal();
    while (dateNowReal() - inicio < maxMs) {
        await esperar(50);
        if (provider.enviados.length === ultimo) {
            estable += 50;
            if (estable >= 300) return;
        } else {
            ultimo = provider.enviados.length;
            estable = 0;
        }
    }
}

// Flujo de prueba para llegar a la captura del opt-in de agendar con una cita recién agendada en el state.
const KW_PRUEBA_OPTIN = 'zzprobaroptinzz';
const flujoPruebaOptin = addKeyword(KW_PRUEBA_OPTIN).addAction(async (_ctx, { state, gotoFlow }) => {
    await state.update({
        pacienteId: 'P1',
        especialidadAgendarCita: 'X',
        citaSeleccionadaHora: { profesionalId: 'E1', fechacita: '2026-10-20', horacita: '09:00:00' },
    });
    return gotoFlow(stepListaEsperaOptIn);
});

function crearBot() {
    const provider = new FakeProvider();
    let numero = 573150000000;
    const flujos = [flujoPruebaOptin, ...construirFlujosRegistrados(true)];
    const listo = createBot({ flow: createFlow(flujos as any), provider: provider as any, database: new MemoryDB() });
    const nuevoNumero = () => String(numero++);
    type Entrada = string | { body: string; payload?: string };
    async function enviar(from: string, entradas: Entrada[]): Promise<Enviado[]> {
        await listo;
        const desde = provider.enviados.length;
        for (const entrada of entradas) {
            const msg = typeof entrada === 'string' ? { body: entrada } : entrada;
            provider.emit('message', { from, name: 'Prueba', ...msg });
            await esperarQuietud(provider);
        }
        return provider.enviados.slice(desde).filter((m) => m.to === from);
    }
    return { provider, enviar, nuevoNumero };
}

const textos = (salida: Enviado[]) => salida.map((m) => m.texto);
const SI = 'Sí, quiero recibir avisos';
const NO = 'No, gracias';
const ID = 'I1J2K3L4';
const CITA = { fecha_cita: '2026-10-20', hora_cita: '09:00', profesional: 'Ana Pérez' };
const respuestaOk = (estado_resultado: string) => ({
    ok: true as const,
    code: 200,
    data: { invitacion_id: ID, estado_resultado, lista_espera_id: estado_resultado.includes('acept') ? 'LE000001' : null, nombre: 'María', cita: CITA },
});
const fallo = (code: number | null, cause: string, data: any = null) => ({ ok: false as const, code, cause, data });

const INV_A = { invitacion_id: 'INVA0001', fecha_cita: '2026-10-20', hora_cita: '09:00', profesional: 'Ana Pérez' };
const INV_B = { invitacion_id: 'INVB0002', fecha_cita: '2026-10-27', hora_cita: '15:00', profesional: 'Carlos Gómez' };

const bot = crearBot();

beforeEach(() => {
    jest.clearAllMocks();
    process.env.NOMBRE_PLANTILLA_LE_INVITACION = 'lista_espera_invitacion';
    mockedApi.responderInvitacion.mockImplementation(async (body: any) => respuestaOk(body.respuesta === 'acepta' ? 'aceptada' : 'rechazada') as any);
    mockedApi.consultarInvitacionesPorDocumento.mockResolvedValue({ ok: true, code: 200, data: { invitaciones: [INV_A] } } as any);
});

describe('con payload', () => {
    it('"No, gracias" → rechaza directo, sin pedir documento (7.4)', async () => {
        const from = bot.nuevoNumero();
        const salida = textos(await bot.enviar(from, [{ body: NO, payload: `LEINV:${ID}:R` }, '1234567890']));
        expect(mockedApi.responderInvitacion).toHaveBeenCalledTimes(1);
        expect(mockedApi.responderInvitacion).toHaveBeenCalledWith({ invitacion_id: ID, celular: from, respuesta: 'rechaza', via: 'payload', documento: '1234567890' });
        expect(salida[0]).toBe(M.MENSAJE_PEDIR_DOCUMENTO_INVITACION);
        expect(salida).toContain('Entendido, no te inscribiremos en la lista de espera. Tu cita del 20 de octubre de 2026 a las 09:00 continúa vigente. 😊');
        expect(mockedApi.consultarInvitacionesPorDocumento).not.toHaveBeenCalled();
        expect(closeUserSession).toHaveBeenCalledWith(from, 'completado');
    });

    it('"Sí, quiero recibir avisos" → pide documento → acepta con documento y consentimiento (7.2, 7.3)', async () => {
        const from = bot.nuevoNumero();
        const salida = textos(await bot.enviar(from, [{ body: SI, payload: `LEINV:${ID}:A` }, '1234567890']));
        expect(salida[0]).toBe(M.MENSAJE_PEDIR_DOCUMENTO_INVITACION);
        expect(mockedApi.responderInvitacion).toHaveBeenCalledWith({
            invitacion_id: ID,
            celular: from,
            respuesta: 'acepta',
            via: 'payload',
            documento: '1234567890',
            consentimiento_texto: `${M.TEXTO_PLANTILLA_INVITACION_LE} | Botón: Sí, quiero recibir avisos | Plantilla: lista_espera_invitacion`,
        });
        expect(salida).toContain(
            '¡Listo, María! Quedaste inscrito en la lista de espera para recibir avisos si se libera un cupo antes con Ana Pérez.\n\n' +
            'Tu cita del 20 de octubre de 2026 a las 09:00 sigue vigente y no ha sido modificada. Si más adelante deseas dejar de ' +
            'recibir estos avisos, puedes escribir: *Retirar lista de espera*.'
        );
        expect(mockedApi.consultarInvitacionesPorDocumento).not.toHaveBeenCalled();
    });

    it('si la acción del payload no coincide con el botón, manda el texto del botón', async () => {
        await bot.enviar(bot.nuevoNumero(), [{ body: NO, payload: `LEINV:${ID}:A` }, '1234567890']);
        expect(mockedApi.responderInvitacion).toHaveBeenCalledWith(expect.objectContaining({ respuesta: 'rechaza', via: 'payload' }));
    });

    it('DOCUMENTO_NO_COINCIDE dos veces → un solo reintento y mensaje final', async () => {
        mockedApi.responderInvitacion.mockResolvedValue(fallo(403, 'DOCUMENTO_NO_COINCIDE') as any);
        const salida = textos(await bot.enviar(bot.nuevoNumero(), [{ body: SI, payload: `LEINV:${ID}:A` }, '1111111', '2222222']));
        expect(mockedApi.responderInvitacion).toHaveBeenCalledTimes(2);
        expect(salida).toContain(M.MENSAJE_DOCUMENTO_NO_COINCIDE_REINTENTO);
        expect(salida.filter((t) => t === M.MENSAJE_PEDIR_DOCUMENTO_INVITACION)).toHaveLength(2);
        expect(salida[salida.length - 1]).toBe(MENSAJE_DOCUMENTO_FINAL);
    });

    it('DOCUMENTO_NO_COINCIDE y luego el documento correcto → aceptada', async () => {
        mockedApi.responderInvitacion.mockResolvedValueOnce(fallo(403, 'DOCUMENTO_NO_COINCIDE') as any);
        const salida = textos(await bot.enviar(bot.nuevoNumero(), [{ body: SI, payload: `LEINV:${ID}:A` }, '1111111', '1234567890']));
        expect(mockedApi.responderInvitacion).toHaveBeenLastCalledWith(expect.objectContaining({ documento: '1234567890', invitacion_id: ID }));
        expect(salida.join('\n')).toMatch(/Quedaste inscrito en la lista de espera/);
    });

    it('documento inválido → lo vuelve a pedir sin llamar al backend', async () => {
        const salida = textos(await bot.enviar(bot.nuevoNumero(), [{ body: SI, payload: `LEINV:${ID}:A` }, '12', '1234567890']));
        expect(salida).toContain(M.MENSAJE_DOCUMENTO_NO_VALIDO_INVITACION);
        expect(mockedApi.responderInvitacion).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['ya_aceptada', /Ya estabas inscrito en la lista de espera.*\*Retirar lista de espera\*/s],
        ['ya_rechazada', /^Entendido, no te inscribiremos en la lista de espera/],
    ])('%s → mensaje correspondiente', async (estado, esperado) => {
        mockedApi.responderInvitacion.mockResolvedValueOnce(respuestaOk(estado) as any);
        const salida = textos(await bot.enviar(bot.nuevoNumero(), [{ body: SI, payload: `LEINV:${ID}:A` }, '1234567890']));
        expect(salida[salida.length - 1]).toMatch(esperado);
    });

    it.each([
        [fallo(403, 'INVITACION_NO_PERTENECE'), M.MENSAJE_INVITACION_NO_PERTENECE],
        [fallo(409, 'CITA_NO_VALIDA', { estado_cita: 'Cancelado' }), M.MENSAJE_INVITACION_NO_VIGENTE],
        [fallo(409, 'INVITACION_NO_VIGENTE'), M.MENSAJE_INVITACION_NO_VIGENTE],
        [fallo(404, 'INVITACION_NOT_FOUND'), M.MENSAJE_INVITACION_NO_VIGENTE],
        [fallo(500, 'ERROR'), M.MENSAJE_ERROR_RESPUESTA_INVITACION],
        [fallo(null, 'ERROR'), M.MENSAJE_ERROR_RESPUESTA_INVITACION],
    ])('rechazo con %j → mensaje correcto, sin reintentar', async (resultado, esperado) => {
        mockedApi.responderInvitacion.mockResolvedValueOnce(resultado as any);
        const salida = textos(await bot.enviar(bot.nuevoNumero(), [{ body: NO, payload: `LEINV:${ID}:R` }, '1234567890']));
        expect(salida).toEqual([M.MENSAJE_PEDIR_DOCUMENTO_INVITACION, esperado]);
        expect(mockedApi.responderInvitacion).toHaveBeenCalledTimes(1);
    });

    // La cola de @builderbot por número es secuencial: un segundo toque del mismo botón de entrada se procesa
    // cuando termina el primero, como una respuesta nueva. El backend es idempotente (ya_rechazada).
    it('toque repetido de "No, gracias" después de responder → ya_rechazada, mismo mensaje', async () => {
        mockedApi.responderInvitacion
            .mockResolvedValueOnce(respuestaOk('rechazada') as any)
            .mockResolvedValueOnce(respuestaOk('ya_rechazada') as any);
        const from = bot.nuevoNumero();
        const salida = textos(await bot.enviar(from, [
            { body: NO, payload: `LEINV:${ID}:R` }, '1234567890',
            { body: NO, payload: `LEINV:${ID}:R` }, '1234567890',
        ]));
        expect(mockedApi.responderInvitacion).toHaveBeenCalledTimes(2);
        expect(salida.filter((t) => /no te inscribiremos/.test(t))).toHaveLength(2);
    });

    it('doble toque mientras se registra la aceptación (llamada en curso) → UNA sola llamada y un solo mensaje', async () => {
        mockedApi.responderInvitacion.mockImplementationOnce(async () => {
            await esperar(400);
            return respuestaOk('aceptada') as any;
        });
        const from = bot.nuevoNumero();
        await bot.enviar(from, [{ body: SI, payload: `LEINV:${ID}:A` }]);
        const desde = bot.provider.enviados.length;
        bot.provider.emit('message', { from, body: '1234567890', name: 'Prueba' });
        await esperar(100);
        bot.provider.emit('message', { from, body: SI, payload: `LEINV:${ID}:A`, name: 'Prueba' });
        await esperar(600);
        await esperarQuietud(bot.provider);
        const salida = bot.provider.enviados.slice(desde).filter((m) => m.to === from).map((m) => m.texto);
        expect(mockedApi.responderInvitacion).toHaveBeenCalledTimes(1);
        expect(salida.filter((t) => /Quedaste inscrito/.test(t))).toHaveLength(1);
        expect(salida).not.toContain(M.MENSAJE_PEDIR_DOCUMENTO_INVITACION);
    });
});

describe('sin payload (fallback por documento)', () => {
    it('"No, gracias" sin payload → documento → 1 invitación → rechaza vía documento', async () => {
        const from = bot.nuevoNumero();
        const salida = textos(await bot.enviar(from, [NO, '1234567890']));
        expect(salida[0]).toBe(M.MENSAJE_PEDIR_DOCUMENTO_INVITACION);
        expect(mockedApi.consultarInvitacionesPorDocumento).toHaveBeenCalledWith('1234567890', from);
        expect(mockedApi.responderInvitacion).toHaveBeenCalledWith({
            invitacion_id: INV_A.invitacion_id, celular: from, respuesta: 'rechaza', via: 'documento', documento: '1234567890',
        });
    });

    it('payload ilegible se trata como sin payload', async () => {
        await bot.enviar(bot.nuevoNumero(), [{ body: SI, payload: 'LEINV:corto:A' }, '1234567890']);
        expect(mockedApi.consultarInvitacionesPorDocumento).toHaveBeenCalled();
        expect(mockedApi.responderInvitacion).toHaveBeenCalledWith(expect.objectContaining({ via: 'documento', respuesta: 'acepta', invitacion_id: INV_A.invitacion_id }));
    });

    it.each([
        [{ ok: true, code: 200, data: { invitaciones: [] } }],
        [fallo(404, 'PACIENTE_NOT_FOUND')],
    ])('sin invitaciones (%j) → "no encontramos", sin responder', async (consulta) => {
        mockedApi.consultarInvitacionesPorDocumento.mockResolvedValueOnce(consulta as any);
        const salida = textos(await bot.enviar(bot.nuevoNumero(), [SI, '1234567890']));
        expect(salida[salida.length - 1]).toBe(M.MENSAJE_SIN_INVITACION_PENDIENTE);
        expect(mockedApi.responderInvitacion).not.toHaveBeenCalled();
    });

    it('falla la consulta → error genérico, sin responder', async () => {
        mockedApi.consultarInvitacionesPorDocumento.mockResolvedValueOnce(fallo(500, 'ERROR') as any);
        const salida = textos(await bot.enviar(bot.nuevoNumero(), [SI, '1234567890']));
        expect(salida[salida.length - 1]).toBe(M.MENSAJE_ERROR_RESPUESTA_INVITACION);
        expect(mockedApi.responderInvitacion).not.toHaveBeenCalled();
    });

    it('2 invitaciones → lista (hasta 9 + Ninguna) → elegir la segunda responde ESA', async () => {
        mockedApi.consultarInvitacionesPorDocumento.mockResolvedValueOnce({ ok: true, code: 200, data: { invitaciones: [INV_A, INV_B] } } as any);
        const from = bot.nuevoNumero();
        const salida = await bot.enviar(from, [SI, '1234567890']);
        const lista = salida.find((m) => m.lista)!.lista;
        expect(lista.body.text).toBe(M.TEXTO_LISTA_INVITACIONES);
        const filas = lista.action.sections[0].rows;
        expect(filas.map((f: any) => f.title)).toEqual(['mar 20 oct · 09:00', 'mar 27 oct · 15:00', 'Ninguna de estas']);
        expect(filas[1].description).toBe('Con Carlos Gómez');
        expect(mockedApi.responderInvitacion).not.toHaveBeenCalled();
        await bot.enviar(from, [filas[1].id]);
        expect(mockedApi.responderInvitacion).toHaveBeenCalledWith(expect.objectContaining({
            invitacion_id: INV_B.invitacion_id, via: 'documento', respuesta: 'acepta', documento: '1234567890',
        }));
    });

    it('lista → "Ninguna de estas" termina sin responder', async () => {
        mockedApi.consultarInvitacionesPorDocumento.mockResolvedValueOnce({ ok: true, code: 200, data: { invitaciones: [INV_A, INV_B] } } as any);
        const from = bot.nuevoNumero();
        await bot.enviar(from, [NO, '1234567890']);
        const salida = textos(await bot.enviar(from, [ID_FILA_NINGUNA]));
        expect(salida).toEqual([M.MENSAJE_NINGUNA_INVITACION]);
        expect(mockedApi.responderInvitacion).not.toHaveBeenCalled();
    });

    it('lista → selección inválida dos veces → reintento con la lista y salida', async () => {
        mockedApi.consultarInvitacionesPorDocumento.mockResolvedValueOnce({ ok: true, code: 200, data: { invitaciones: [INV_A, INV_B] } } as any);
        const salida = await bot.enviar(bot.nuevoNumero(), [NO, '1234567890', 'la primera', 'otra']);
        expect(salida.filter((m) => m.lista)).toHaveLength(2);
        expect(textos(salida)).toContain(M.MENSAJE_SELECCION_REINTENTO_INVITACION);
        expect(textos(salida)).toContain(M.MENSAJE_SELECCION_FINAL_INVITACION);
        expect(mockedApi.responderInvitacion).not.toHaveBeenCalled();
    });
});

describe('palabras globales durante las capturas', () => {
    it('"Salir" en la captura del documento sale sin llamar al backend', async () => {
        const from = bot.nuevoNumero();
        const salida = textos(await bot.enviar(from, [{ body: SI, payload: `LEINV:${ID}:A` }, 'Salir']));
        expect(salida.filter((t) => t === MENSAJE_SALIR)).toHaveLength(1);
        expect(closeUserSession).toHaveBeenCalledWith(from, 'salir');
        expect(mockedApi.responderInvitacion).not.toHaveBeenCalled();
    });

    it('"No, gracias" (otra invitación) durante la captura del documento → pasa al rechazo', async () => {
        await bot.enviar(bot.nuevoNumero(), [{ body: SI, payload: `LEINV:${ID}:A` }, { body: NO, payload: 'LEINV:OTRA0001:R' }]);
        expect(mockedApi.responderInvitacion).not.toHaveBeenCalled();
    });

    it('"Sí, lo tomo" durante la captura del documento → flujo de la oferta de cupo', async () => {
        const salida = textos(await bot.enviar(bot.nuevoNumero(), [{ body: SI, payload: `LEINV:${ID}:A` }, 'Sí, lo tomo', '1234567890']));
        expect(salida.join('\n')).toMatch(/Para confirmar que el espacio es para ti/);
        expect(mockedApi.responderOfertaCupo).toHaveBeenCalledWith('1234567890', expect.any(String), 'acepta');
        expect(mockedApi.responderInvitacion).not.toHaveBeenCalled();
    });
});

describe('captura del opt-in de agendar (C11 y T7)', () => {
    it('"No, gracias" en la captura del opt-in → gana la captura: rechazo del opt-in, sin flujo de invitación', async () => {
        const from = bot.nuevoNumero();
        const salida = await bot.enviar(from, [KW_PRUEBA_OPTIN]);
        expect(salida.find((m) => m.botones)?.texto).toBe(TEXTO_CONSENTIMIENTO_LISTA_ESPERA);
        const fin = textos(await bot.enviar(from, [NO]));
        expect(fin).toEqual(['Entendido, no te inscribiremos en la lista de espera. ¡Gracias por confiar en nosotros! 😊']);
        expect(mockedApi.responderInvitacion).not.toHaveBeenCalled();
        expect(mockedApi.consultarInvitacionesPorDocumento).not.toHaveBeenCalled();
        expect(mockedApi.registrarOptinListaEspera).toHaveBeenCalledWith({
            paciente_id: 'P1', profesional_id: 'E1', fecha_cita: '2026-10-20', hora_cita: '09:00', decision: 'rechaza', celular: from, lista_espera_id: null,
        });
    });

    it('"Sí, avísame" → inscripción y registro del opt-in aceptado con lista_espera_id', async () => {
        const from = bot.nuevoNumero();
        await bot.enviar(from, [KW_PRUEBA_OPTIN]);
        const fin = textos(await bot.enviar(from, ['Sí, avísame']));
        expect(fin[0]).toMatch(/^¡Listo! Quedaste inscrito en la lista de espera/);
        expect(mockedApi.inscribirListaEspera).toHaveBeenCalledTimes(1);
        expect(mockedApi.registrarOptinListaEspera).toHaveBeenCalledWith(expect.objectContaining({ decision: 'acepta', lista_espera_id: 'LE000001', celular: from }));
    });

    it('"Salir" en el opt-in → registro del opt-in rechazado, mismo mensaje de siempre', async () => {
        const from = bot.nuevoNumero();
        await bot.enviar(from, [KW_PRUEBA_OPTIN]);
        const fin = textos(await bot.enviar(from, ['Salir']));
        expect(fin[0]).toBe('Listo, no te inscribimos en la lista de espera. Tu cita agendada sigue firme. ¡Gracias por confiar en nosotros! 😊');
        expect(mockedApi.registrarOptinListaEspera).toHaveBeenCalledWith(expect.objectContaining({ decision: 'rechaza', lista_espera_id: null }));
    });

    it.each(['quizás luego', 'no sé', 'hola'])('texto libre "%s" en el opt-in → abandono: mismo mensaje, SIN registrar-optin (D16, QA T-03)', async (texto) => {
        const from = bot.nuevoNumero();
        await bot.enviar(from, [KW_PRUEBA_OPTIN]);
        const fin = textos(await bot.enviar(from, [texto]));
        expect(fin[0]).toBe('Entendido, no te inscribiremos en la lista de espera. ¡Gracias por confiar en nosotros! 😊');
        expect(mockedApi.registrarOptinListaEspera).not.toHaveBeenCalled();
        expect(mockedApi.inscribirListaEspera).not.toHaveBeenCalled();
    });

    it('un fallo al registrar el opt-in no cambia el mensaje', async () => {
        mockedApi.registrarOptinListaEspera.mockResolvedValueOnce(fallo(404, 'CITA_NO_ENCONTRADA') as any);
        const from = bot.nuevoNumero();
        await bot.enviar(from, [KW_PRUEBA_OPTIN]);
        const fin = textos(await bot.enviar(from, [NO]));
        expect(fin).toEqual(['Entendido, no te inscribiremos en la lista de espera. ¡Gracias por confiar en nosotros! 😊']);
    });
});
