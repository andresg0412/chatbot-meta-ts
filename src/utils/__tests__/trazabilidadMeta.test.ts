// Trazabilidad de lo que llega de Meta (docs/features/2026-09-29-trazabilidad-usuarios.md, 4.3.4 y 11.2):
// `msg_entrante` sin texto del paciente y `wa_estado` desde el webhook sin tocar la respuesta del provider.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

import {
    clasificarMensajeEntrante,
    crearListenerMensajeEntrante,
    crearMiddlewareEstadosMeta,
    extraerEstadosWebhook,
} from '../trazabilidadMeta';
import { _estadoParaPruebas, _resetParaPruebas, registrarProveedorSesion, uuidV5 } from '../trazabilidad';

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
    _resetParaPruebas();
    registrarProveedorSesion(null);
    process.env = { ...ENV_ORIGINAL, TRAZABILIDAD_V2_ENABLED: 'true', API_BACKEND_URL: 'http://backend.test/api' };
    for (const m of ['log', 'error', 'warn'] as const) jest.spyOn(console, m).mockImplementation(() => undefined);
});
afterEach(() => {
    _resetParaPruebas();
    jest.restoreAllMocks();
    process.env = { ...ENV_ORIGINAL };
});

const webhookEstados = {
    object: 'whatsapp_business_account',
    entry: [{
        id: 'WABA',
        changes: [{
            field: 'messages',
            value: {
                messaging_product: 'whatsapp',
                statuses: [
                    {
                        id: 'wamid.AAA', status: 'delivered', timestamp: '1759200000', recipient_id: '573001234567',
                        conversation: { id: 'CONV-SECRETA', origin: { type: 'utility' } },
                        pricing: { billable: true, pricing_model: 'CBP', category: 'utility' },
                    },
                    {
                        id: 'wamid.BBB', status: 'failed', timestamp: '1759200060', recipient_id: '573009999999',
                        errors: [{ code: 131047, title: 'Re-engagement message', error_data: { details: 'more than 24 hours' } }],
                    },
                    { id: 'wamid.CCC', status: 'deleted', timestamp: '1759200060', recipient_id: '1' },
                ],
            },
        }],
    }],
};

describe('estados de entrega (wa_estado)', () => {
    it('extrae id, status, timestamp, recipient_id y errors[0]; ignora pricing/conversation y estados desconocidos', () => {
        const estados = extraerEstadosWebhook(webhookEstados);
        expect(estados).toEqual([
            { waMessageId: 'wamid.AAA', status: 'delivered', ocurridoAt: new Date(1759200000 * 1000).toISOString(), recipientId: '573001234567', errorCode: null, errorTitulo: null },
            { waMessageId: 'wamid.BBB', status: 'failed', ocurridoAt: new Date(1759200060 * 1000).toISOString(), recipientId: '573009999999', errorCode: '131047', errorTitulo: 'Re-engagement message' },
        ]);
        expect(JSON.stringify(estados)).not.toMatch(/CONV-SECRETA|pricing|utility|CBP/);
    });

    it('middleware: encola wa_estado con evento_uid UUIDv5 determinista y siempre llama a next() sin tocar la respuesta', () => {
        const middleware = crearMiddlewareEstadosMeta();
        const next = jest.fn();
        const res = { writeHead: jest.fn(), end: jest.fn() };
        middleware({ method: 'POST', path: '/webhook', body: webhookEstados }, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.writeHead).not.toHaveBeenCalled();
        expect(res.end).not.toHaveBeenCalled();
        const cola = _estadoParaPruebas().cola;
        expect(cola).toHaveLength(2);
        expect(cola[0]).toEqual(expect.objectContaining({
            evento_uid: uuidV5('wamid.AAA:delivered'),
            tipo_evento: 'wa_estado',
            wa_message_id: 'wamid.AAA',
            telefono: '573001234567',
            resultado: 'delivered',
            ocurrido_at: new Date(1759200000 * 1000).toISOString(),
        }));
        expect(cola[1].metadata).toEqual({ error_code: '131047', error_titulo: 'Re-engagement message' });
        expect(JSON.stringify(cola)).not.toMatch(/pricing|CONV-SECRETA/);

        // Meta reintenta el mismo webhook → mismo evento_uid (el backend lo cuenta como duplicado).
        middleware({ method: 'POST', path: '/webhook', body: webhookEstados }, res, next);
        const uids = _estadoParaPruebas().cola.map((e) => e.evento_uid);
        expect(uids[2]).toBe(uids[0]);
    });

    it('middleware: otras rutas, GET, body raro o interruptor apagado → no encola nada y sigue', () => {
        const middleware = crearMiddlewareEstadosMeta();
        const next = jest.fn();
        middleware({ method: 'POST', path: '/v1/campaigns/daily', body: webhookEstados }, {}, next);
        middleware({ method: 'GET', path: '/webhook', body: webhookEstados }, {}, next);
        middleware({ method: 'POST', path: '/webhook', body: 'texto' }, {}, next);
        middleware({ method: 'POST', path: '/webhook', body: { entry: 'x' } }, {}, next);
        process.env.TRAZABILIDAD_V2_ENABLED = 'false';
        middleware({ method: 'POST', path: '/webhook', body: webhookEstados }, {}, next);
        expect(next).toHaveBeenCalledTimes(5);
        expect(_estadoParaPruebas().cola).toHaveLength(0);
    });
});

describe('mensajes entrantes (msg_entrante)', () => {
    it('texto libre: solo tipo y longitud, NUNCA el contenido (P7)', () => {
        const listener = crearListenerMensajeEntrante(() => ({ dynamicBlacklist: { checkIf: () => false } }));
        listener({ type: 'text', from: '573001234567', body: 'me siento muy mal hoy', message_id: 'wamid.IN1' });
        const [evento] = _estadoParaPruebas().cola;
        expect(evento).toEqual(expect.objectContaining({ tipo_evento: 'msg_entrante', telefono: '573001234567', wa_message_id: 'wamid.IN1' }));
        expect(evento.metadata).toEqual({ tipo_msg: 'text', len: 21, etiqueta_boton: null, en_blacklist: false, es_respuesta_esperada: null });
        expect(JSON.stringify(evento)).not.toContain('me siento');
    });

    it('botón de plantilla, botón interactivo y lista: guarda la etiqueta (texto de la IPS)', () => {
        expect(clasificarMensajeEntrante({ type: 'button', body: 'Confirmo asistencia', payload: 'Confirmo asistencia' }))
            .toEqual({ tipo: 'button', len: 19, etiqueta: 'Confirmo asistencia' });
        expect(clasificarMensajeEntrante({ type: 'interactive', body: 'Acepto', title_button_reply: 'Acepto' }))
            .toEqual({ tipo: 'interactive', len: 6, etiqueta: 'Acepto' });
        expect(clasificarMensajeEntrante({ type: 'interactive', body: '280525002', title_list_reply: 'Agendar cita' }))
            .toEqual({ tipo: 'list', len: 12, etiqueta: 'Agendar cita' });
        expect(clasificarMensajeEntrante({ type: 'audio', body: '_event_voice_note_x' })).toEqual({ tipo: 'audio', len: 0, etiqueta: null });
        expect(clasificarMensajeEntrante({ type: 'video' })).toEqual({ tipo: 'otro', len: 0, etiqueta: null });
    });

    it('en_blacklist refleja la lista negra dinámica del bot y cuenta el mensaje en la sesión', () => {
        const registrarMensaje = jest.fn();
        registrarProveedorSesion({ obtener: () => null, actualizar: jest.fn(), registrarMensaje, cerrar: jest.fn(), asegurar: jest.fn() });
        const listener = crearListenerMensajeEntrante(() => ({ dynamicBlacklist: { checkIf: (n: string) => n === '573001234567' } }));
        listener({ type: 'text', from: '573001234567', body: 'hola' });
        expect(_estadoParaPruebas().cola[0].metadata?.en_blacklist).toBe(true);
        expect(registrarMensaje).toHaveBeenCalledWith('573001234567');
    });

    it('nunca lanza (bot sin instancia, ctx sin from, interruptor apagado)', () => {
        const listener = crearListenerMensajeEntrante(() => undefined);
        expect(() => listener(undefined)).not.toThrow();
        expect(() => listener({ type: 'text', body: 'x' })).not.toThrow();
        listener({ type: 'text', from: '1', body: 'x' });
        expect(_estadoParaPruebas().cola[0].metadata?.en_blacklist).toBeNull();
        process.env.TRAZABILIDAD_V2_ENABLED = 'false';
        listener({ type: 'text', from: '1', body: 'x' });
        expect(_estadoParaPruebas().cola).toHaveLength(1);
    });
});
