// TB-05 + TBOT-03 + TBOT-05 + TBOT-06 (proyecto-ips/docs/features/2026-10-02-informe-qa-lista-espera.md):
// respuesta a los botones de recordatorio con el motor REAL de @builderbot (createBot + handleMsg) y la
// lista REAL de flujos, con un provider falso en memoria. Sin Meta ni backend: apiService simulado.

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
jest.mock('../../utils/listaEsperaCascadaPoller', () => ({
    ...jest.requireActual('../../utils/listaEsperaCascadaPoller'),
    programarTickCascadaRetrasado: jest.fn(),
}));

const CITA_A = {
    cita_id: 'A9897918', agenda_id_externa: 5206177, fecha_cita: '2026-10-10', hora_cita: '07:50',
    profesional: 'Ana Pérez', tipo_recordatorio: '24h', estado_agenda: 'Pendiente',
};
const CITA_B = {
    cita_id: 'B1234567', agenda_id_externa: 5206999, fecha_cita: '2026-10-17', hora_cita: '15:00',
    profesional: '  Carlos   Gómez\tRuiz ', tipo_recordatorio: null, estado_agenda: 'Confirmado',
};

jest.mock('../../services/apiService', () => {
    const real = jest.requireActual('../../services/apiService');
    return {
        ...real,
        registrarActividadBot: jest.fn(async () => true),
        consultarCitasRecordatorio: jest.fn(),
        responderRecordatorio: jest.fn(),
        responderOfertaCupo: jest.fn(async () => ({ ok: true, code: 200, data: { registrado: true } })),
        confirmarCitaCampahna: jest.fn(async () => ({ ok: true, estado: 'confirmada' })),
        consultarListaEsperaPorDocumento: jest.fn(async () => ({ ok: true, encontrado: false, inscripciones: [] })),
        consultarCitasProximasPaciente: jest.fn(async () => []),
    };
});

import { EventEmitter } from 'events';
import { createBot, MemoryDB } from '@builderbot/bot';
import { construirTemplates } from '../index';
import * as api from '../../services/apiService';
import { closeUserSession } from '../../utils/proactiveSessionManager';
import { programarTickCascadaRetrasado } from '../../utils/listaEsperaCascadaPoller';
import * as M from '../../utils/mensajesRecordatorio';
import { MENSAJE_DOCUMENTO_FINAL, MENSAJE_DOCUMENTO_REINTENTO } from '../../utils/mensajesConfirmacion';
import { MENSAJE_CONVERSACION_TERMINADA } from '../../utils/estadoConversacion';
import { MENSAJE_SALIR } from '../flujos/palabrasGlobales';

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

function crearBot(recordatoriosBotones: boolean) {
    const provider = new FakeProvider();
    let numero = recordatoriosBotones ? 573100000000 : 573200000000;
    const listo = createBot({ flow: construirTemplates(recordatoriosBotones), provider: provider as any, database: new MemoryDB() });
    const nuevoNumero = () => String(numero++);
    async function enviar(from: string, textos: string[]): Promise<Enviado[]> {
        await listo;
        const desde = provider.enviados.length;
        for (const body of textos) {
            provider.emit('message', { from, body, name: 'Prueba' });
            await esperarQuietud(provider);
        }
        return provider.enviados.slice(desde).filter((m) => m.to === from);
    }
    return { provider, enviar, nuevoNumero };
}

const textos = (salida: Enviado[]) => salida.map((m) => m.texto);
const ok = (data: Record<string, unknown>) => ({ ok: true as const, data: { accion: 'x', persistido: true, ...data } as any });
const unaCita = () => mockedApi.consultarCitasRecordatorio.mockResolvedValue({ ok: true, origen: 'recordatorio', citas: [CITA_A] } as any);
const dosCitas = () => mockedApi.consultarCitasRecordatorio.mockResolvedValue({ ok: true, origen: 'citas_activas', citas: [CITA_A, CITA_B] } as any);

const bot = crearBot(true);

beforeEach(() => {
    jest.clearAllMocks();
    unaCita();
    mockedApi.responderRecordatorio.mockImplementation(async (_c: string, _d: string, respuesta: string, citaId?: string) =>
        ok({
            cita_id: citaId, agenda_id: citaId, agenda_id_externa: citaId === CITA_B.cita_id ? CITA_B.agenda_id_externa : CITA_A.agenda_id_externa,
            fecha_cita: citaId === CITA_B.cita_id ? CITA_B.fecha_cita : CITA_A.fecha_cita,
            hora_cita: citaId === CITA_B.cita_id ? CITA_B.hora_cita : CITA_A.hora_cita,
            profesional: citaId === CITA_B.cita_id ? 'Carlos Gómez Ruiz' : 'Ana Pérez',
            estado_resultado: respuesta === 'confirma' ? 'confirmada' : 'cancelada',
        }));
});

describe('Confirmo asistencia', () => {
    it('1 cita → confirma directo con cita_id y dice cuál', async () => {
        const from = bot.nuevoNumero();
        const salida = textos(await bot.enviar(from, ['Confirmo asistencia', '1234567890']));
        expect(salida[0]).toMatch(/Para confirmar tu cita, por favor digita tu número de documento/);
        expect(mockedApi.consultarCitasRecordatorio).toHaveBeenCalledWith('1234567890', from);
        expect(mockedApi.responderRecordatorio).toHaveBeenCalledTimes(1);
        expect(mockedApi.responderRecordatorio).toHaveBeenCalledWith(from, '1234567890', 'confirma', CITA_A.cita_id);
        expect(salida).toContain('✅ ¡Listo! Tu cita del 10 de octubre de 2026 a las 07:50 con Ana Pérez quedó confirmada. Te esperamos. 😊');
        expect(salida.join('\n')).not.toMatch(/¿Confirmas que deseas cancelarla/);
    });

    it('ya_confirmada → "ya estaba confirmada"', async () => {
        mockedApi.responderRecordatorio.mockResolvedValueOnce(ok({ ...CITA_A, estado_resultado: 'ya_confirmada' }));
        const salida = textos(await bot.enviar(bot.nuevoNumero(), ['Confirmo asistencia', '1234567890']));
        expect(salida).toContain('😊 ¡Gracias por avisarnos! Tu cita del 10 de octubre de 2026 a las 07:50 con Ana Pérez ya estaba confirmada. No necesitas hacer nada más. ¡Te esperamos!');
    });

    it('2 citas → lista; elegir la segunda confirma ESA cita', async () => {
        dosCitas();
        const from = bot.nuevoNumero();
        const salida = await bot.enviar(from, ['Confirmo asistencia', '1234567890']);
        const lista = salida.find((m) => m.lista)?.lista;
        expect(lista.body.text).toBe('Tienes más de una cita programada. ¿A cuál te refieres?');
        const filas = lista.action.sections[0].rows;
        expect(filas.map((f: any) => f.title)).toEqual(['sáb 10 oct · 07:50', 'sáb 17 oct · 15:00', 'Ninguna de estas']);
        expect(filas[1].description).toBe('Con Carlos Gómez Ruiz');
        expect(mockedApi.responderRecordatorio).not.toHaveBeenCalled();
        const fin = textos(await bot.enviar(from, [filas[1].id]));
        expect(mockedApi.responderRecordatorio).toHaveBeenCalledWith(from, '1234567890', 'confirma', CITA_B.cita_id);
        expect(fin).toContain('✅ ¡Listo! Tu cita del 17 de octubre de 2026 a las 15:00 con Carlos Gómez Ruiz quedó confirmada. Te esperamos. 😊');
    });

    it('0 citas dos veces → un reintento del documento y mensaje final, sin responder', async () => {
        mockedApi.consultarCitasRecordatorio.mockResolvedValue({ ok: true, origen: 'citas_activas', citas: [] } as any);
        const salida = textos(await bot.enviar(bot.nuevoNumero(), ['Confirmo asistencia', '1234567890', '1234567891']));
        expect(mockedApi.consultarCitasRecordatorio).toHaveBeenCalledTimes(2);
        expect(salida).toContain(MENSAJE_DOCUMENTO_REINTENTO);
        expect(salida).toContain(MENSAJE_DOCUMENTO_FINAL);
        expect(mockedApi.responderRecordatorio).not.toHaveBeenCalled();
    });

    it('404 PACIENTE_NOT_FOUND se trata como 0 citas', async () => {
        mockedApi.consultarCitasRecordatorio.mockResolvedValue({ ok: false, causa: 'PACIENTE_NOT_FOUND', httpStatus: 404 } as any);
        const salida = textos(await bot.enviar(bot.nuevoNumero(), ['Confirmo asistencia', '1234567890']));
        expect(salida).toContain(MENSAJE_DOCUMENTO_REINTENTO);
    });

    it('502 GLOBHO_ERROR al confirmar → mensaje de agenda con asesor', async () => {
        mockedApi.responderRecordatorio.mockResolvedValueOnce({ ok: false, causa: 'GLOBHO_ERROR' });
        const salida = textos(await bot.enviar(bot.nuevoNumero(), ['Confirmo asistencia', '1234567890']));
        expect(salida).toContain(M.mensajeErrorGlobhoRecordatorio('confirma'));
        expect(M.mensajeErrorGlobhoRecordatorio('confirma')).toMatch(/^No pudimos confirmar tu cita/);
    });

    it('500 / timeout / red (ERROR) → no invita a repetir', async () => {
        mockedApi.responderRecordatorio.mockResolvedValueOnce({ ok: false, causa: 'ERROR' });
        const salida = textos(await bot.enviar(bot.nuevoNumero(), ['Confirmo asistencia', '1234567890']));
        expect(salida).toContain(M.mensajeErrorTecnicoRecordatorio('confirma'));
        expect(M.mensajeErrorTecnicoRecordatorio('confirma')).toMatch(/no pudimos comprobar si tu cita quedó confirmada/);
    });

    it('falla la consulta de citas → mensaje de consulta (se puede reintentar, no se hizo nada)', async () => {
        mockedApi.consultarCitasRecordatorio.mockResolvedValueOnce({ ok: false, causa: 'ERROR', httpStatus: null } as any);
        const salida = textos(await bot.enviar(bot.nuevoNumero(), ['Confirmo asistencia', '1234567890']));
        expect(salida).toContain(M.MENSAJE_ERROR_CONSULTA_CITAS);
        expect(mockedApi.responderRecordatorio).not.toHaveBeenCalled();
    });
});

describe.each([
    ['Necesito cancelar', 'necesito_cancelar'],
    ['No podré asistir', 'no_podre_asistir'],
])('%s', (boton, origen) => {
    it('1 cita → muestra la cita con "Sí, cancelar"/"No, mantener" y NO cancela todavía', async () => {
        const from = bot.nuevoNumero();
        const salida = await bot.enviar(from, [boton, '1234567890']);
        const pregunta = salida.find((m) => m.botones);
        expect(pregunta?.texto).toBe('Vas a cancelar esta cita:\n📅 10 de octubre de 2026\n🕐 07:50\n👤 Ana Pérez\n\n¿Confirmas que deseas cancelarla?');
        expect(pregunta?.botones).toEqual(['Sí, cancelar', 'No, mantener']);
        for (const titulo of pregunta!.botones!) expect(titulo.length).toBeLessThanOrEqual(M.LIMITES_META.tituloBoton);
        expect(mockedApi.responderRecordatorio).not.toHaveBeenCalled();
    });

    it('Sí → cancela ESA cita con cita_id, dice cuál y ofrece agendar', async () => {
        const from = bot.nuevoNumero();
        const salida = textos(await bot.enviar(from, [boton, '1234567890', 'Sí, cancelar']));
        expect(mockedApi.responderRecordatorio).toHaveBeenCalledTimes(1);
        expect(mockedApi.responderRecordatorio).toHaveBeenCalledWith(from, '1234567890', 'no_asistira', CITA_A.cita_id);
        expect(salida).toContain('Listo, cancelamos tu cita del 10 de octubre de 2026 a las 07:50 con Ana Pérez. Gracias por avisarnos con tiempo. Si quieres agendar un nuevo espacio, escribe *hola* y elige *Agendar cita*. 😊');
        expect(programarTickCascadaRetrasado).toHaveBeenCalledTimes(1);
        expect(mockedApi.registrarActividadBot).toHaveBeenCalledWith('recordatorio_respuesta', from,
            expect.objectContaining({ accion: 'no_asistira', origen_boton: origen, resultado: 'exitoso' }));
    });

    it('No → "Tu cita sigue igual 😊", sin llamar a responder', async () => {
        const salida = textos(await bot.enviar(bot.nuevoNumero(), [boton, '1234567890', 'No, mantener']));
        expect(salida).toContain('Tu cita sigue igual 😊');
        expect(mockedApi.responderRecordatorio).not.toHaveBeenCalled();
    });

    it('respuesta inválida → un reintento; la segunda inválida sale sin cancelar', async () => {
        const salida = await bot.enviar(bot.nuevoNumero(), [boton, '1234567890', 'mmm', 'tal vez']);
        expect(textos(salida)).toContain(M.MENSAJE_CONFIRMACION_REINTENTO);
        expect(salida.filter((m) => m.botones)).toHaveLength(2);
        expect(textos(salida)).toContain(M.MENSAJE_CONFIRMACION_FINAL);
        expect(mockedApi.responderRecordatorio).not.toHaveBeenCalled();
    });

    it('respuesta inválida y luego Sí → cancela una vez', async () => {
        await bot.enviar(bot.nuevoNumero(), [boton, '1234567890', 'mmm', 'Sí, cancelar']);
        expect(mockedApi.responderRecordatorio).toHaveBeenCalledTimes(1);
    });

    it('0 citas → el mensaje de siempre, sin responder', async () => {
        mockedApi.consultarCitasRecordatorio.mockResolvedValue({ ok: true, origen: 'citas_activas', citas: [] } as any);
        const salida = textos(await bot.enviar(bot.nuevoNumero(), [boton, '1234567890']));
        expect(salida).toContain('No encontramos una cita activa asociada a ese número de documento. Si crees que es un error, contáctanos.');
        expect(mockedApi.responderRecordatorio).not.toHaveBeenCalled();
    });

    it('2 citas → lista → elegir la segunda → confirmación de ESA → Sí cancela ESA', async () => {
        dosCitas();
        const from = bot.nuevoNumero();
        const salida = await bot.enviar(from, [boton, '1234567890']);
        const filas = salida.find((m) => m.lista)!.lista.action.sections[0].rows;
        const conf = await bot.enviar(from, [filas[1].id]);
        expect(conf.find((m) => m.botones)?.texto).toMatch(/17 de octubre de 2026\n🕐 15:00\n👤 Carlos Gómez Ruiz/);
        await bot.enviar(from, ['Sí, cancelar']);
        expect(mockedApi.responderRecordatorio).toHaveBeenCalledWith(from, '1234567890', 'no_asistira', CITA_B.cita_id);
    });

    it('lista → "Ninguna de estas" termina sin hacer nada', async () => {
        dosCitas();
        const from = bot.nuevoNumero();
        await bot.enviar(from, [boton, '1234567890']);
        const salida = textos(await bot.enviar(from, [M.ID_FILA_NINGUNA]));
        expect(salida).toContain(M.MENSAJE_NINGUNA_CITA);
        expect(mockedApi.responderRecordatorio).not.toHaveBeenCalled();
    });

    it('lista → selección inválida dos veces → reintento con la lista y salida', async () => {
        dosCitas();
        const salida = await bot.enviar(bot.nuevoNumero(), [boton, '1234567890', 'la primera', '4']);
        expect(salida.filter((m) => m.lista)).toHaveLength(2);
        expect(textos(salida)).toContain(M.MENSAJE_SELECCION_REINTENTO);
        expect(textos(salida)).toContain(M.MENSAJE_SELECCION_FINAL);
        expect(textos(salida).join('\n')).not.toMatch(/te solicitaré algunos datos/); // '4' no abrió cancelar
        expect(mockedApi.responderRecordatorio).not.toHaveBeenCalled();
    });

    it('doble toque de "Sí, cancelar" → UNA sola llamada y un solo mensaje final', async () => {
        mockedApi.responderRecordatorio.mockImplementationOnce(async () => {
            await esperar(400);
            return ok({ ...CITA_A, estado_resultado: 'cancelada' });
        });
        const from = bot.nuevoNumero();
        await bot.enviar(from, [boton, '1234567890']);
        const desde = bot.provider.enviados.length;
        bot.provider.emit('message', { from, body: 'Sí, cancelar', name: 'Prueba' });
        bot.provider.emit('message', { from, body: 'Sí, cancelar', name: 'Prueba' });
        await esperar(100);
        bot.provider.emit('message', { from, body: 'Sí, cancelar', name: 'Prueba' });
        await esperarQuietud(bot.provider);
        const salida = bot.provider.enviados.slice(desde).filter((m) => m.to === from).map((m) => m.texto);
        expect(mockedApi.responderRecordatorio).toHaveBeenCalledTimes(1);
        expect(salida.filter((t) => /cancelamos tu cita/.test(t))).toHaveLength(1);
        expect(salida.join('\n')).not.toMatch(/te solicitaré algunos datos/);
    });

    it('ya_cancelada (doble toque que llegó al backend) → éxito "ya estaba cancelada"', async () => {
        mockedApi.responderRecordatorio.mockResolvedValueOnce(ok({ ...CITA_A, estado_resultado: 'ya_cancelada' }));
        const salida = textos(await bot.enviar(bot.nuevoNumero(), [boton, '1234567890', 'Sí, cancelar']));
        expect(salida).toContain('Tu cita del 10 de octubre de 2026 a las 07:50 con Ana Pérez ya estaba cancelada. Si quieres agendar un nuevo espacio, escribe *hola* y elige *Agendar cita*. 😊');
        expect(programarTickCascadaRetrasado).not.toHaveBeenCalled();
    });

    it.each([
        [{ ok: false, causa: 'CITA_NO_VALIDA', motivo: 'NO_ACTIVA' }, M.MENSAJE_CITA_NO_DISPONIBLE],
        [{ ok: false, causa: 'CITA_NO_VALIDA', motivo: 'OTRO_PACIENTE' }, M.MENSAJE_CITA_NO_DISPONIBLE],
        [{ ok: false, causa: 'CITA_NOT_FOUND' }, M.MENSAJE_CITA_NO_DISPONIBLE],
        [{ ok: false, causa: 'CITA_CANCELADA', fecha_cita: '2026-10-10', hora_cita: '08:00' }, M.MENSAJE_CITA_NO_DISPONIBLE],
        [{ ok: false, causa: 'RESPUESTA_EN_PROCESO' }, M.MENSAJE_RESPUESTA_EN_PROCESO],
        [{ ok: false, causa: 'GLOBHO_ERROR' }, M.mensajeErrorGlobhoRecordatorio('no_asistira')],
        [{ ok: false, causa: 'ERROR' }, M.mensajeErrorTecnicoRecordatorio('no_asistira')],
    ])('responder %j → mensaje correcto, sin reintentar solo', async (fallo, esperado) => {
        mockedApi.responderRecordatorio.mockResolvedValueOnce(fallo as any);
        const salida = textos(await bot.enviar(bot.nuevoNumero(), [boton, '1234567890', 'Sí, cancelar']));
        expect(salida).toContain(esperado);
        expect(mockedApi.responderRecordatorio).toHaveBeenCalledTimes(1);
        expect(programarTickCascadaRetrasado).not.toHaveBeenCalled();
    });

    it('409 CITA_AMBIGUA → muestra la lista del backend y cancela la elegida', async () => {
        mockedApi.responderRecordatorio.mockResolvedValueOnce({ ok: false, causa: 'CITA_AMBIGUA', citas: [CITA_A, CITA_B] } as any);
        const from = bot.nuevoNumero();
        const salida = await bot.enviar(from, [boton, '1234567890', 'Sí, cancelar']);
        const filas = salida.find((m) => m.lista)!.lista.action.sections[0].rows;
        await bot.enviar(from, [filas[1].id, 'Sí, cancelar']);
        expect(mockedApi.responderRecordatorio).toHaveBeenCalledTimes(2);
        expect(mockedApi.responderRecordatorio).toHaveBeenLastCalledWith(from, '1234567890', 'no_asistira', CITA_B.cita_id);
    });
});

describe('Palabras globales durante las capturas (TBOT-06)', () => {
    it.each([
        ['documento', [] as string[]],
        ['confirmación', ['1234567890']],
    ])('"Salir" en la captura de %s sale sin llamar al backend de respuesta', async (_nombre, previos) => {
        const from = bot.nuevoNumero();
        const salida = textos(await bot.enviar(from, ['Necesito cancelar', ...previos, 'Salir']));
        expect(salida.filter((t) => t === MENSAJE_SALIR)).toHaveLength(1);
        expect(closeUserSession).toHaveBeenCalledWith(from, 'salir');
        expect(mockedApi.responderRecordatorio).not.toHaveBeenCalled();
        if (!previos.length) expect(mockedApi.consultarCitasRecordatorio).not.toHaveBeenCalled();
    });

    it('"Salir" en la lista sale', async () => {
        dosCitas();
        const from = bot.nuevoNumero();
        const salida = textos(await bot.enviar(from, ['Confirmo asistencia', '1234567890', 'salir']));
        expect(salida).toContain(MENSAJE_SALIR);
        expect(mockedApi.responderRecordatorio).not.toHaveBeenCalled();
    });

    it('"Sí, lo tomo" durante la captura del documento → flujo de la oferta (no "documento no válido")', async () => {
        const salida = textos(await bot.enviar(bot.nuevoNumero(), ['Necesito cancelar', 'Sí, lo tomo', '1234567890']));
        expect(salida.join('\n')).toMatch(/Para confirmar que el espacio es para ti/);
        expect(mockedApi.responderOfertaCupo).toHaveBeenCalledWith('1234567890', expect.any(String), 'acepta');
        expect(mockedApi.consultarCitasRecordatorio).not.toHaveBeenCalled();
    });

    it('"Confirmo asistencia" durante la confirmación de cancelar → pasa a confirmar, sin cancelar', async () => {
        const from = bot.nuevoNumero();
        await bot.enviar(from, ['No podré asistir', '1234567890', 'Confirmo asistencia', '1234567890']);
        expect(mockedApi.responderRecordatorio).toHaveBeenCalledTimes(1);
        expect(mockedApi.responderRecordatorio).toHaveBeenCalledWith(from, '1234567890', 'confirma', CITA_A.cita_id);
    });

    it('"No puedo" durante la lista → flujo de rechazo de oferta', async () => {
        dosCitas();
        await bot.enviar(bot.nuevoNumero(), ['Confirmo asistencia', '1234567890', 'No puedo', '1234567890']);
        expect(mockedApi.responderOfertaCupo).toHaveBeenCalledWith('1234567890', expect.any(String), 'rechaza');
        expect(mockedApi.responderRecordatorio).not.toHaveBeenCalled();
    });
});

describe('Botones y capturas fuera de contexto', () => {
    it('"No, mantener" sin conversación → conversación terminada', async () => {
        const salida = textos(await bot.enviar(bot.nuevoNumero(), ['No, mantener']));
        expect(salida).toContain(MENSAJE_CONVERSACION_TERMINADA);
    });

    it('"Sí, cancelar" sin conversación → flujo guiado de cancelar (como antes), sin cancelar nada', async () => {
        const salida = textos(await bot.enviar(bot.nuevoNumero(), ['Sí, cancelar']));
        expect(salida.join('\n')).toMatch(/te solicitaré algunos datos para poder cancelar tu cita/);
        expect(mockedApi.responderRecordatorio).not.toHaveBeenCalled();
    });

    it('confirmación abandonada >30 min y luego "hola" → conversación nueva, no vuelve a preguntar por la cita', async () => {
        const from = bot.nuevoNumero();
        await bot.enviar(from, ['Necesito cancelar', '1234567890']);
        const espia = jest.spyOn(Date, 'now').mockImplementation(() => dateNowReal() + 31 * 60 * 1000);
        try {
            const salida = textos(await bot.enviar(from, ['hola']));
            expect(salida.join('\n')).toMatch(/Bienvenido/);
            expect(salida).not.toContain(M.MENSAJE_CONFIRMACION_REINTENTO);
        } finally {
            espia.mockRestore();
        }
        expect(mockedApi.responderRecordatorio).not.toHaveBeenCalled();
    });
});

describe('RECORDATORIOS_BOTONES_ENABLED apagado', () => {
    const apagado = crearBot(false);

    it('"Necesito cancelar" va al flujo guiado de cancelar, sin consultar ni responder recordatorios', async () => {
        const salida = textos(await apagado.enviar(apagado.nuevoNumero(), ['Necesito cancelar']));
        expect(salida.join('\n')).toMatch(/te solicitaré algunos datos para poder cancelar tu cita/);
        expect(mockedApi.consultarCitasRecordatorio).not.toHaveBeenCalled();
        expect(mockedApi.responderRecordatorio).not.toHaveBeenCalled();
    });

    it('"Confirmo asistencia" y "No podré asistir" no llegan a los flujos de recordatorio', async () => {
        await apagado.enviar(apagado.nuevoNumero(), ['Confirmo asistencia', '1234567890']);
        await apagado.enviar(apagado.nuevoNumero(), ['No podré asistir', '1234567890']);
        expect(mockedApi.consultarCitasRecordatorio).not.toHaveBeenCalled();
        expect(mockedApi.responderRecordatorio).not.toHaveBeenCalled();
    });
});
