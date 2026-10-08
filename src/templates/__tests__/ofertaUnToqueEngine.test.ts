// Fase 2 de proyecto-ips/docs/features/2026-10-07-lista-espera-aceptacion-y-escalamientos.md (D1, D1-bis, D10),
// con el motor REAL de @builderbot (createBot + handleMsg) y la lista REAL de flujos, un provider falso en memoria
// y apiService simulado (sin Meta ni backend).
//
// Lo que se protege: el id del botón solo AHORRA el documento. Cualquier fallo con el id (flag apagado, sin payload,
// ilegible, oferta no encontrada, celular distinto, varias ofertas, error del backend) pide el documento y el
// paciente nunca ve un error; cada caída deja su motivo en la trazabilidad.

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

jest.mock('../../utils/verificarHorario', () => ({
    ...jest.requireActual('../../utils/verificarHorario'),
    isWorkingHours: jest.fn(() => true),
}));

jest.mock('../../services/apiService', () => {
    const real = jest.requireActual('../../services/apiService');
    return {
        ...real,
        registrarActividadBot: jest.fn(async () => true),
        responderOfertaCupo: jest.fn(async () => ({ ok: true, code: 200, data: { registrado: true } })),
        responderOfertaCupoSinDocumento: jest.fn(),
        registrarIntencionOfertaCupo: jest.fn(),
        registrarSolicitudAgenteOfertaCupo: jest.fn(async () => true),
        registrarDecisionPostRechazoOfertaCupo: jest.fn(),
        responderInvitacion: jest.fn(),
        consultarInvitacionesPorDocumento: jest.fn(),
    };
});

import { EventEmitter } from 'events';
import { createBot, createFlow, MemoryDB } from '@builderbot/bot';
import { construirFlujosRegistrados } from '../index';
import * as api from '../../services/apiService';
import * as M from '../../utils/mensajesOfertaCupo';

jest.setTimeout(30000);

const mockedApi = api as jest.Mocked<typeof api>;

type Enviado = { to: string; texto: string; botones?: string[] };

class FakeProvider extends EventEmitter {
    public enviados: Enviado[] = [];
    async sendMessage(to: string, texto: string, ctx?: any) {
        const botones = (ctx?.options?.buttons ?? []).map((b: any) => b.body);
        this.enviados.push({ to, texto, ...(botones.length ? { botones } : {}) });
        return { ok: true };
    }
    async sendList(to: string, list: any) {
        this.enviados.push({ to, texto: `[lista] ${list?.body?.text ?? ''}` });
        return { ok: true };
    }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function esperarQuietud(provider: FakeProvider, maxMs = 4000) {
    let ultimo = -1;
    let estable = 0;
    const inicio = Date.now();
    while (Date.now() - inicio < maxMs) {
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

type Entrada = string | { body: string; payload?: string };
const provider = new FakeProvider();
let numero = 573160000000;
const listo = createBot({ flow: createFlow(construirFlujosRegistrados(true) as any), provider: provider as any, database: new MemoryDB() });

async function conversarComo(from: string, entradas: Entrada[]): Promise<Enviado[]> {
    await listo;
    const desde = provider.enviados.length;
    for (const entrada of entradas) {
        const msg = typeof entrada === 'string' ? { body: entrada } : entrada;
        provider.emit('message', { from, name: 'Prueba', ...msg });
        await esperarQuietud(provider);
    }
    return provider.enviados.slice(desde).filter((m) => m.to === from);
}
const conversar = (entradas: Entrada[]) => conversarComo(String(numero++), entradas);
const textos = (salida: Enviado[]) => salida.map((m) => m.texto).join('\n');

const OFERTA = 'OFER0001';
const SI = 'Sí, lo tomo';
const NO_PUEDO = 'No puedo';
const AGENTE = 'Hablar con un agente';
const conPayload = (body: string, accion: 'A' | 'R' | 'G', id: string = OFERTA): Entrada => ({ body, payload: `LEOFE:${id}:${accion}` });
const CUPO = { profesional: 'Ana Pérez', fecha_cita: '2026-10-20', hora_cita: '09:00' };
const intencionVigente = (extra: Record<string, unknown> = {}) => ({
    ok: true as const,
    data: { estado: 'vigente' as const, oferta_id: OFERTA, prorrogada: true, minutos_para_confirmar: 10, cupo: CUPO, ...extra },
});
const respuestaOk = (data: Record<string, unknown>) => ({ ok: true, code: 200, data });
const respuestaFallo = (code: number | undefined, cause?: string) => ({ ok: false, ...(code ? { code } : {}), ...(cause ? { cause, data: { cause } } : {}) });

const FLAGS = ['LISTA_ESPERA_OFERTA_PAYLOAD_ENABLED', 'LISTA_ESPERA_PREGUNTA_POST_RECHAZO'];

beforeEach(() => {
    jest.clearAllMocks();
    FLAGS.forEach((f) => delete process.env[f]);
    process.env.LISTA_ESPERA_OFERTA_PAYLOAD_ENABLED = 'true';
    mockedApi.registrarIntencionOfertaCupo.mockResolvedValue({ ok: false });
    mockedApi.responderOfertaCupoSinDocumento.mockResolvedValue(respuestaOk({ movimiento: 'ok', nueva_fecha_cita: '2026-10-20', nueva_hora_cita: '09:00', profesional: 'Ana Pérez' }) as any);
    mockedApi.registrarDecisionPostRechazoOfertaCupo.mockResolvedValue({ ok: true, data: { estado: 'continua' } });
});
afterEach(() => FLAGS.forEach((f) => delete process.env[f]));

const motivosDeFallback = () =>
    mockedApi.registrarActividadBot.mock.calls
        .filter(([, , meta]) => (meta as any)?.resultado === 'fallback_documento')
        .map(([, , meta]) => (meta as any).motivo);

// ===========================================================================
// "Sí, lo tomo" con el id del botón
// ===========================================================================
describe('"Sí, lo tomo" con payload (D1)', () => {
    it('muestra los datos del cupo, avisa que se libera la cita actual y da 10 minutos, SIN pedir el documento ni aceptar todavía', async () => {
        mockedApi.registrarIntencionOfertaCupo.mockResolvedValue(intencionVigente() as any);

        const salida = await conversar([conPayload(SI, 'A')]);

        expect(mockedApi.registrarIntencionOfertaCupo).toHaveBeenCalledWith(expect.any(String), 'acepta', OFERTA);
        expect(mockedApi.registrarIntencionOfertaCupo).toHaveBeenCalledTimes(1);
        expect(mockedApi.responderOfertaCupo).not.toHaveBeenCalled();
        expect(mockedApi.responderOfertaCupoSinDocumento).not.toHaveBeenCalled();
        const confirmacion = salida.find((m) => /Tienes \d+ minutos? para confirmar/.test(m.texto));
        expect(confirmacion).toBeDefined();
        expect(confirmacion!.texto).toContain('Tienes 10 minutos para confirmar');
        expect(confirmacion!.texto).toMatch(/20 de octubre de 2026/);
        expect(confirmacion!.texto).toContain('09:00');
        expect(confirmacion!.texto).toContain('Ana Pérez');
        expect(confirmacion!.texto).toMatch(/cita actual quedará liberada/);
        expect(confirmacion!.botones).toEqual(['Sí, adelantar', 'No, dejar así']);
        expect(textos(salida)).not.toMatch(/número de documento/);
        // La confirmación no menciona la especialidad (privacidad de la lista de espera).
        expect(confirmacion!.texto).not.toMatch(/psicolog|terapia|sesi[oó]n/i);
    });

    it('con menos de 10 minutos de verdad, se muestran los que quedan (nunca se promete de más)', async () => {
        mockedApi.registrarIntencionOfertaCupo.mockResolvedValue(intencionVigente({ minutos_para_confirmar: 4 }) as any);
        const salida = await conversar([conPayload(SI, 'A')]);
        expect(textos(salida)).toContain('Tienes 4 minutos para confirmar');
    });

    it('doble toque sobre la misma oferta: una sola confirmación', async () => {
        mockedApi.registrarIntencionOfertaCupo.mockResolvedValue(intencionVigente() as any);
        const salida = await conversar([conPayload(SI, 'A'), conPayload(SI, 'A')]);
        expect(salida.filter((m) => /para confirmar\./.test(m.texto))).toHaveLength(1);
        expect(mockedApi.registrarIntencionOfertaCupo).toHaveBeenCalledTimes(1);
    });

    it('si la acción del payload no coincide con el botón, gana el texto del botón (y se usa el id igual)', async () => {
        mockedApi.registrarIntencionOfertaCupo.mockResolvedValue(intencionVigente() as any);
        const salida = await conversar([conPayload(SI, 'R')]);
        expect(mockedApi.registrarIntencionOfertaCupo).toHaveBeenCalledWith(expect.any(String), 'acepta', OFERTA);
        expect(textos(salida)).toContain('para confirmar.');
    });

    it('oferta vencida con id válido: se le informa, NO se pide el documento', async () => {
        mockedApi.registrarIntencionOfertaCupo.mockResolvedValue({ ok: true, data: { estado: 'vencida', estado_cupo: 'asignado' } } as any);
        const salida = await conversar([conPayload(SI, 'A')]);
        expect(textos(salida)).toMatch(/ya fue tomado por otra persona/);
        expect(textos(salida)).not.toMatch(/número de documento/);
        expect(motivosDeFallback()).toEqual([]);
    });

    it('oferta que ya tenía respuesta: se le informa, NO se pide el documento', async () => {
        mockedApi.registrarIntencionOfertaCupo.mockResolvedValue({ ok: true, data: { estado: 'ya_respondida', respuesta: 'rechaza' } } as any);
        const salida = await conversar([conPayload(SI, 'A')]);
        expect(textos(salida)).toContain(M.MENSAJE_OFERTA_YA_RESPONDIDA);
        expect(textos(salida)).not.toMatch(/número de documento/);
    });
});

// ===========================================================================
// Fallbacks: cualquier fallo con el id pide el documento
// ===========================================================================
describe('"Sí, lo tomo": cualquier fallo con el id pide el documento (y nunca un error)', () => {
    const casos: Array<[string, () => void, Entrada, string | null]> = [
        ['flag apagado', () => { process.env.LISTA_ESPERA_OFERTA_PAYLOAD_ENABLED = 'false'; }, conPayload(SI, 'A'), null],
        ['sin payload', () => undefined, SI, 'sin_payload'],
        ['payload ilegible', () => undefined, { body: SI, payload: 'LEOFE:corto:A' }, 'payload_invalido'],
        ['payload de otra campaña', () => undefined, { body: SI, payload: 'LEINV:INVA0001:A' }, 'payload_invalido'],
        ['oferta no encontrada', () => mockedApi.registrarIntencionOfertaCupo.mockResolvedValue({ ok: true, data: { estado: 'oferta_no_encontrada' } } as any), conPayload(SI, 'A'), 'oferta_no_encontrada'],
        ['celular distinto', () => mockedApi.registrarIntencionOfertaCupo.mockResolvedValue({ ok: true, data: { estado: 'celular_distinto' } } as any), conPayload(SI, 'A'), 'celular_distinto'],
        ['varias ofertas vigentes', () => mockedApi.registrarIntencionOfertaCupo.mockResolvedValue({ ok: true, data: { estado: 'ambigua' } } as any), conPayload(SI, 'A'), 'varias_ofertas'],
        ['backend caído o con error', () => mockedApi.registrarIntencionOfertaCupo.mockResolvedValue({ ok: false }), conPayload(SI, 'A'), 'error_backend'],
        ['backend anterior (vigente sin datos del cupo)', () => mockedApi.registrarIntencionOfertaCupo.mockResolvedValue({ ok: true, data: { estado: 'vigente', prorrogada: true } } as any), conPayload(SI, 'A'), 'error_backend'],
    ];

    it.each(casos)('%s', async (_nombre, preparar, entrada, motivo) => {
        preparar();

        const salida = await conversar([entrada]);

        expect(textos(salida)).toMatch(/número de documento/);
        expect(textos(salida)).not.toMatch(/para confirmar\.|Ocurrió un error|No pudimos/);
        expect(mockedApi.responderOfertaCupo).not.toHaveBeenCalled();
        expect(motivosDeFallback()).toEqual(motivo ? [motivo] : []);
    });

    it('y el documento después funciona como siempre (acepta con documento)', async () => {
        mockedApi.registrarIntencionOfertaCupo.mockResolvedValue({ ok: false });
        await conversar([conPayload(SI, 'A'), '1234567890']);
        expect(mockedApi.responderOfertaCupo).toHaveBeenCalledWith('1234567890', expect.any(String), 'acepta');
    });
});

// ===========================================================================
// Confirmación sin estado
// ===========================================================================
describe('confirmación de un toque: "Sí, adelantar" / "No, dejar así"', () => {
    it('"Sí, adelantar" acepta con el id guardado al mostrar la confirmación y mueve la cita', async () => {
        mockedApi.registrarIntencionOfertaCupo.mockResolvedValue(intencionVigente() as any);

        const salida = await conversar([conPayload(SI, 'A'), 'Sí, adelantar']);

        expect(mockedApi.responderOfertaCupoSinDocumento).toHaveBeenCalledWith(expect.any(String), 'acepta', OFERTA);
        expect(textos(salida)).toMatch(/Tu espacio quedó movido a 20 de octubre de 2026 09:00 con Ana Pérez/);
        expect(textos(salida)).toMatch(/Tu cita anterior quedó liberada/);
    });

    it('es SIN ESTADO: si el bot se reinició (sin id guardado), "Sí, adelantar" igual funciona por el celular', async () => {
        const salida = await conversar(['Sí, adelantar']);
        expect(mockedApi.responderOfertaCupoSinDocumento).toHaveBeenCalledWith(expect.any(String), 'acepta', undefined);
        expect(textos(salida)).toMatch(/Tu espacio quedó movido/);
    });

    it.each([
        ['ambigua (varias ofertas del mismo celular)', 409, 'OFERTA_AMBIGUA'],
        ['sin confirmación previa', 409, 'CONFIRMACION_REQUERIDA'],
        ['celular que no corresponde', 403, 'CELULAR_NO_COINCIDE'],
        ['oferta no encontrada', 404, 'OFERTA_NOT_FOUND'],
    ])('si el backend no puede resolver la oferta (%s), pide el documento y no muestra error', async (_n, code, cause) => {
        mockedApi.responderOfertaCupoSinDocumento.mockResolvedValue(respuestaFallo(code, cause) as any);

        const salida = await conversar(['Sí, adelantar', '1234567890']);

        expect(textos(salida)).toMatch(/número de documento/);
        expect(textos(salida)).not.toMatch(/Ocurrió un error|No pudimos/);
        expect(mockedApi.responderOfertaCupo).toHaveBeenCalledWith('1234567890', expect.any(String), 'acepta');
        expect(motivosDeFallback()).toHaveLength(1);
    });

    it('sin respuesta del backend (red caída) también pide el documento', async () => {
        mockedApi.responderOfertaCupoSinDocumento.mockResolvedValue(respuestaFallo(undefined) as any);
        const salida = await conversar(['Sí, adelantar']);
        expect(textos(salida)).toMatch(/número de documento/);
    });

    it('oferta vencida o cupo ya tomado durante la confirmación: mensaje claro, sin documento', async () => {
        mockedApi.responderOfertaCupoSinDocumento.mockResolvedValueOnce(respuestaFallo(404, 'SIN_OFERTA_ACTIVA') as any);
        const vencida = await conversar(['Sí, adelantar']);
        expect(textos(vencida)).toMatch(/Ya no tienes ninguna oferta de cupo pendiente/);

        mockedApi.responderOfertaCupoSinDocumento.mockResolvedValueOnce(respuestaFallo(409, 'CUPO_YA_ASIGNADO') as any);
        const tomado = await conversar(['Sí, adelantar']);
        expect(textos(tomado)).toMatch(/Ese espacio ya fue tomado por otra persona/);
    });

    it('error de Globho al mover la cita: se informa (no queda a medias)', async () => {
        mockedApi.responderOfertaCupoSinDocumento.mockResolvedValue({ ok: false, code: 502, cause: 'GLOBHO_ERROR', citaAnteriorRestaurada: true, data: {} } as any);
        const salida = await conversar(['Sí, adelantar']);
        expect(textos(salida)).not.toMatch(/Tu espacio quedó movido/);
        expect(salida.length).toBeGreaterThan(0);
    });

    it('"No, dejar así" rechaza (sin documento) y el paciente sigue en la lista', async () => {
        mockedApi.registrarIntencionOfertaCupo.mockResolvedValue(intencionVigente() as any);
        mockedApi.responderOfertaCupoSinDocumento.mockResolvedValue(respuestaOk({ registrado: true, lista_espera_id: 'LE000001' }) as any);

        const salida = await conversar([conPayload(SI, 'A'), 'No, dejar así']);

        expect(mockedApi.responderOfertaCupoSinDocumento).toHaveBeenCalledWith(expect.any(String), 'rechaza', OFERTA);
        expect(textos(salida)).toMatch(/Sigues en la lista de espera/);
    });
});

// ===========================================================================
// "No puedo"
// ===========================================================================
describe('"No puedo" con payload', () => {
    it('rechaza directo con el id, sin pedir el documento', async () => {
        mockedApi.registrarIntencionOfertaCupo.mockResolvedValue({ ok: true, data: { estado: 'rechazada', oferta_id: OFERTA, lista_espera_id: 'LE000001' } } as any);

        const salida = await conversar([conPayload(NO_PUEDO, 'R')]);

        expect(mockedApi.registrarIntencionOfertaCupo).toHaveBeenCalledWith(expect.any(String), 'rechaza', OFERTA);
        expect(textos(salida)).toMatch(/Sigues en la lista de espera/);
        expect(textos(salida)).not.toMatch(/número de documento/);
    });

    it('con el id inválido o el backend caído pide el documento, como siempre', async () => {
        const salida = await conversar([{ body: NO_PUEDO, payload: 'basura' }, '1234567890']);
        expect(textos(salida)).toMatch(/número de documento/);
        expect(mockedApi.responderOfertaCupo).toHaveBeenCalledWith('1234567890', expect.any(String), 'rechaza');
        expect(motivosDeFallback()).toEqual(['payload_invalido']);
    });

    it('oferta ya vencida: se le agradece y no se pide nada', async () => {
        mockedApi.registrarIntencionOfertaCupo.mockResolvedValue({ ok: true, data: { estado: 'vencida', estado_cupo: 'escalado' } } as any);
        const salida = await conversar([conPayload(NO_PUEDO, 'R')]);
        expect(textos(salida)).toMatch(/ya no estaba vigente/);
        expect(textos(salida)).not.toMatch(/número de documento/);
    });
});

// ===========================================================================
// D10 — pregunta de seguir en la lista tras rechazar
// ===========================================================================
describe('pregunta de seguir en la lista tras rechazar (D10)', () => {
    const rechazoConInscripcion = () =>
        mockedApi.registrarIntencionOfertaCupo.mockResolvedValue({ ok: true, data: { estado: 'rechazada', oferta_id: OFERTA, lista_espera_id: 'LE000001' } } as any);

    it('apagada (default): el mensaje de siempre, sin botones', async () => {
        rechazoConInscripcion();
        const salida = await conversar([conPayload(NO_PUEDO, 'R')]);
        expect(salida.some((m) => m.botones)).toBe(false);
        expect(textos(salida)).not.toContain('¿Quieres seguir en la lista de espera');
    });

    it('encendida: pregunta con "Sí, seguir" / "No, gracias"', async () => {
        process.env.LISTA_ESPERA_PREGUNTA_POST_RECHAZO = 'true';
        rechazoConInscripcion();

        const salida = await conversar([conPayload(NO_PUEDO, 'R')]);

        const pregunta = salida.find((m) => m.texto.includes('¿Quieres seguir en la lista de espera'));
        expect(pregunta?.botones).toEqual(['Sí, seguir', 'No, gracias']);
    });

    it('"No, gracias" saca al paciente de la lista y no se confunde con la invitación', async () => {
        process.env.LISTA_ESPERA_PREGUNTA_POST_RECHAZO = 'true';
        rechazoConInscripcion();
        mockedApi.registrarDecisionPostRechazoOfertaCupo.mockResolvedValue({ ok: true, data: { estado: 'retirada' } });

        const salida = await conversar([conPayload(NO_PUEDO, 'R'), 'No, gracias']);

        expect(mockedApi.registrarDecisionPostRechazoOfertaCupo).toHaveBeenCalledWith('LE000001', expect.any(String), 'sale');
        expect(textos(salida)).toContain(M.MENSAJE_POST_RECHAZO_SALE);
        expect(mockedApi.responderInvitacion).not.toHaveBeenCalled();
        expect(mockedApi.consultarInvitacionesPorDocumento).not.toHaveBeenCalled();
    });

    it('"Sí, seguir" mantiene la inscripción', async () => {
        process.env.LISTA_ESPERA_PREGUNTA_POST_RECHAZO = 'true';
        rechazoConInscripcion();

        const salida = await conversar([conPayload(NO_PUEDO, 'R'), 'Sí, seguir']);

        expect(mockedApi.registrarDecisionPostRechazoOfertaCupo).toHaveBeenCalledWith('LE000001', expect.any(String), 'sigue');
        expect(textos(salida)).toContain(M.MENSAJE_POST_RECHAZO_SIGUE);
    });

    it('si falla el retiro, el mensaje indica cómo salir y no afirma que salió', async () => {
        process.env.LISTA_ESPERA_PREGUNTA_POST_RECHAZO = 'true';
        rechazoConInscripcion();
        mockedApi.registrarDecisionPostRechazoOfertaCupo.mockResolvedValue({ ok: false });

        const salida = await conversar([conPayload(NO_PUEDO, 'R'), 'No, gracias']);

        expect(textos(salida)).toContain(M.MENSAJE_POST_RECHAZO_ERROR_SALIDA);
        expect(textos(salida)).not.toContain(M.MENSAJE_POST_RECHAZO_SALE);
    });

    it('si no contesta la pregunta y escribe otra cosa, no se toca la inscripción', async () => {
        process.env.LISTA_ESPERA_PREGUNTA_POST_RECHAZO = 'true';
        rechazoConInscripcion();

        await conversar([conPayload(NO_PUEDO, 'R'), 'hola buenas']);

        expect(mockedApi.registrarDecisionPostRechazoOfertaCupo).not.toHaveBeenCalled();
    });

    it('también se pregunta tras el "No, dejar así" de la confirmación', async () => {
        process.env.LISTA_ESPERA_PREGUNTA_POST_RECHAZO = 'true';
        mockedApi.registrarIntencionOfertaCupo.mockResolvedValue(intencionVigente() as any);
        mockedApi.responderOfertaCupoSinDocumento.mockResolvedValue(respuestaOk({ registrado: true, lista_espera_id: 'LE000001' }) as any);

        const salida = await conversar([conPayload(SI, 'A'), 'No, dejar así']);

        expect(salida.find((m) => m.texto.includes('¿Quieres seguir en la lista de espera'))?.botones).toEqual(['Sí, seguir', 'No, gracias']);
    });

    it('y también tras rechazar con documento (camino de siempre)', async () => {
        process.env.LISTA_ESPERA_PREGUNTA_POST_RECHAZO = 'true';
        mockedApi.responderOfertaCupo.mockResolvedValue({ ok: true, code: 200, data: { registrado: true, lista_espera_id: 'LE000009' } });

        const salida = await conversar([NO_PUEDO, '1234567890']);

        expect(salida.find((m) => m.texto.includes('¿Quieres seguir en la lista de espera'))?.botones).toEqual(['Sí, seguir', 'No, gracias']);
    });
});

// ===========================================================================
// D1-bis — "Hablar con un agente"
// ===========================================================================
describe('"Hablar con un agente" en la oferta (D1-bis)', () => {
    it('registra la solicitud con el id y entrega el enlace del asesor', async () => {
        const salida = await conversar([conPayload(AGENTE, 'G')]);

        expect(mockedApi.registrarSolicitudAgenteOfertaCupo).toHaveBeenCalledWith(OFERTA, expect.any(String));
        expect(textos(salida)).toMatch(/wa\.me|asesor/i);
    });

    it('sin payload funciona igual que antes y no registra nada', async () => {
        const salida = await conversar([AGENTE]);
        expect(mockedApi.registrarSolicitudAgenteOfertaCupo).not.toHaveBeenCalled();
        expect(textos(salida)).toMatch(/wa\.me|asesor/i);
    });

    it('si el registro falla, la atención del asesor no se afecta', async () => {
        mockedApi.registrarSolicitudAgenteOfertaCupo.mockRejectedValue(new Error('backend caído'));
        const salida = await conversar([conPayload(AGENTE, 'G')]);
        expect(textos(salida)).toMatch(/wa\.me|asesor/i);
    });
});
