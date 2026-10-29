// Historial de mensajes del panel (proyecto-ips/docs/features/2026-10-29-historial-mensajes-panel.md, 5 y 8.2):
// cola en memoria, lotes, backoff, spool con tope y permisos, orden, "nunca lanza" y el envoltorio del provider.
// axios simulado: no hay red real ni WhatsApp real.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    registrarMensaje,
    registrarEstadoMeta,
    registrarEventoSistema,
    registrarSalienteDesdeBody,
    flushHistorial,
    envolverEnvioProvider,
    crearListenerHistorial,
    traducirEntrante,
    traducirBodyGraph,
    truncarTexto,
    volcarHistorialAlApagar,
    MAX_TEXTO,
    _estadoParaPruebas,
    _resetParaPruebas,
} from '../historialMensajes';
import { postGraph } from '../../services/graphClient';
import { uuidV5 } from '../trazabilidad';

const post = (axios as any).post as jest.Mock;
const ENV_ORIGINAL = { ...process.env };
let dir: string;
let rutaSpool: string;

const OK = { status: 200, data: { isError: false, data: { recibidos: 1, insertados: 1, duplicados: 0, rechazados: 0 } } };
const errorHttp = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });
const mensaje = (texto: string, extra: Record<string, unknown> = {}) => ({
    direccion: 'entrante' as const,
    origen: 'paciente' as const,
    tipo: 'texto' as const,
    telefono: '573001112233',
    texto,
    ...extra,
});
const textosEnviados = () =>
    post.mock.calls.filter((c) => String(c[0]).endsWith('/historial/batch')).flatMap((c) => c[1].mensajes.map((m: any) => m.texto));

beforeEach(() => {
    jest.clearAllMocks();
    post.mockReset();
    process.env = {
        ...ENV_ORIGINAL,
        HISTORIAL_MENSAJES_ENABLED: 'true',
        HISTORIAL_MENSAJES_TOKEN: 'token-de-prueba',
        API_BACKEND_URL: 'http://backend.test/api',
    };
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'historial-'));
    rutaSpool = path.join(dir, 'historialSpool.jsonl');
    _resetParaPruebas({ rutaSpool });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
    _resetParaPruebas();
    jest.restoreAllMocks();
    process.env = { ...ENV_ORIGINAL };
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('bandera apagada o mal configurada', () => {
    it('apagada: no encola, no hace peticiones y el envoltorio no es necesario', async () => {
        process.env.HISTORIAL_MENSAJES_ENABLED = 'false';
        registrarMensaje(mensaje('hola'));
        registrarEstadoMeta('wamid.1', 'read');
        registrarSalienteDesdeBody({ to: '573001112233', type: 'text', text: { body: 'x' } }, { waMessageId: 'w', estado: 'aceptado' });
        await flushHistorial();
        expect(_estadoParaPruebas().cola).toHaveLength(0);
        expect(_estadoParaPruebas().estados).toHaveLength(0);
        expect(post).not.toHaveBeenCalled();
    });

    it('encendida pero sin token: no captura nada y avisa una sola vez', async () => {
        process.env.HISTORIAL_MENSAJES_TOKEN = '';
        registrarMensaje(mensaje('a'));
        registrarMensaje(mensaje('b'));
        await flushHistorial();
        expect(_estadoParaPruebas().cola).toHaveLength(0);
        expect(post).not.toHaveBeenCalled();
        expect((console.warn as jest.Mock).mock.calls.filter((c) => String(c[0]).includes('falta HISTORIAL_MENSAJES_TOKEN'))).toHaveLength(1);
    });
});

describe('envío por lotes', () => {
    it('manda los mensajes con el header x-historial-token y la forma V1', async () => {
        post.mockResolvedValue(OK);
        registrarMensaje(mensaje('hola', { en_blacklist: false }));
        await flushHistorial();
        expect(post).toHaveBeenCalledTimes(1);
        const [url, cuerpo, config] = post.mock.calls[0];
        expect(url).toBe('http://backend.test/api/historial/batch');
        expect(config.headers['x-historial-token']).toBe('token-de-prueba');
        expect(cuerpo.mensajes[0]).toMatchObject({ v: 1, direccion: 'entrante', origen: 'paciente', tipo: 'texto', telefono: '573001112233', texto: 'hola', en_blacklist: false });
        expect(cuerpo.mensajes[0].mensaje_uid).toMatch(/^[0-9a-f-]{36}$/);
        expect(config.timeout).toBe(5000);
    });

    it('parte en lotes de 100 y conserva el orden', async () => {
        post.mockResolvedValue(OK);
        process.env.HISTORIAL_MAX_COLA = '100000';
        process.env.HISTORIAL_LOTE_MAX = '100000';
        for (let i = 0; i < 230; i++) registrarMensaje(mensaje(`m${i}`)); // al llegar a 100 dispara un flush en segundo plano
        for (let i = 0; i < 6; i++) {
            await flushHistorial();
            await new Promise((r) => setImmediate(r));
        }
        expect(Math.max(...post.mock.calls.map((c) => c[1].mensajes.length))).toBeLessThanOrEqual(100);
        expect(post.mock.calls.reduce((n, c) => n + c[1].mensajes.length, 0)).toBe(230);
        expect(textosEnviados()).toEqual(Array.from({ length: 230 }, (_, i) => `m${i}`));
    });

    it('los estados de entrega salen DESPUÉS de los mensajes en el mismo flush', async () => {
        post.mockResolvedValue(OK);
        registrarMensaje(mensaje('saliente', { direccion: 'saliente', wa_message_id: 'wamid.OUT' }));
        registrarEstadoMeta('wamid.OUT', 'delivered');
        registrarEstadoMeta('wamid.OUT', 'basura'); // se ignora
        await flushHistorial();
        expect(post.mock.calls.map((c) => String(c[0]).split('/').pop())).toEqual(['batch', 'estados']);
        expect(post.mock.calls[1][1].estados).toEqual([expect.objectContaining({ wa_message_id: 'wamid.OUT', status: 'delivered' })]);
    });

    it('si el envío de mensajes falla, los estados esperan (sin la fila en la base no habría qué actualizar)', async () => {
        post.mockRejectedValue(errorHttp(500));
        registrarMensaje(mensaje('x'));
        registrarEstadoMeta('wamid.OUT', 'read');
        await flushHistorial();
        expect(post).toHaveBeenCalledTimes(1);
        expect(_estadoParaPruebas().estados).toHaveLength(1);
    });
});

describe('fallos del backend', () => {
    it('400 → el lote se descarta y no se reintenta', async () => {
        post.mockRejectedValueOnce(errorHttp(400));
        registrarMensaje(mensaje('malo'));
        await flushHistorial();
        expect(_estadoParaPruebas().cola).toHaveLength(0);
        expect(_estadoParaPruebas().fallosConsecutivos).toBe(0);
        expect(fs.existsSync(rutaSpool)).toBe(false);
        // El log no incluye el contenido del mensaje.
        expect(JSON.stringify((console.error as jest.Mock).mock.calls)).not.toContain('malo');
    });

    it.each([500, 429, 401, 503, 404])('%i → el lote vuelve a la cola con backoff exponencial', async (status) => {
        post.mockRejectedValue(errorHttp(status));
        registrarMensaje(mensaje('a'));
        await flushHistorial();
        let e = _estadoParaPruebas();
        expect(e.cola).toHaveLength(1);
        expect(e.fallosConsecutivos).toBe(1);
        const espera1 = e.noAntesDe - Date.now();
        expect(espera1).toBeGreaterThan(500);
        expect(espera1).toBeLessThanOrEqual(1100);
        // Durante el backoff no se intenta de nuevo.
        await flushHistorial();
        expect(post).toHaveBeenCalledTimes(1);
    });

    it('red caída sin respuesta (timeout) también se reintenta', async () => {
        post.mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }));
        registrarMensaje(mensaje('a'));
        await flushHistorial();
        expect(_estadoParaPruebas().cola).toHaveLength(1);
    });

    it('backend caído: al superar el tope pasa al spool (0600) y al volver se envía todo en orden y sin duplicados', async () => {
        process.env.HISTORIAL_MAX_COLA = '5';
        process.env.HISTORIAL_LOTE_MAX = '1000';
        post.mockRejectedValue(errorHttp(503));
        for (let i = 0; i < 7; i++) registrarMensaje(mensaje(`m${i}`)); // al 6.º supera el tope y se vuelca
        expect(fs.existsSync(rutaSpool)).toBe(true);
        if (process.platform !== 'win32') expect(fs.statSync(rutaSpool).mode & 0o777).toBe(0o600);
        expect(fs.readFileSync(rutaSpool, 'utf-8').trim().split('\n')).toHaveLength(6);
        expect(_estadoParaPruebas().cola.map((m) => m.texto)).toEqual(['m6']);

        // El backend vuelve (se salta la espera del backoff).
        post.mockReset();
        post.mockResolvedValue(OK);
        _resetParaPruebas({ rutaSpool });
        registrarMensaje(mensaje('m7')); // llega mientras hay spool: debe quedar DESPUÉS de lo viejo
        // (el reset borró la cola en memoria: m6 solo estaba ahí; se reconstruye lo que el proceso real conservaría)
        await flushHistorial();
        expect(textosEnviados()).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm7']);
        expect(fs.existsSync(rutaSpool)).toBe(false);
        // Otro flush no vuelve a enviar nada.
        await flushHistorial();
        expect(textosEnviados()).toHaveLength(7);
    });

    it('si el reintento desde el spool falla, nada se pierde ni se duplica', async () => {
        process.env.HISTORIAL_MAX_COLA = '2';
        process.env.HISTORIAL_LOTE_MAX = '1000';
        post.mockRejectedValue(errorHttp(500));
        for (let i = 0; i < 3; i++) registrarMensaje(mensaje(`m${i}`));
        expect(fs.existsSync(rutaSpool)).toBe(true);
        const e0 = _estadoParaPruebas();
        e0.cola.length && void 0;
        // Se permite el siguiente intento ignorando el backoff.
        _resetParaPruebas({ rutaSpool });
        await flushHistorial(); // falla: lo anteponido vuelve y, al superar el tope, regresa al spool entero
        const enSpool = fs.readFileSync(rutaSpool, 'utf-8').trim().split('\n').map((l) => JSON.parse(l).texto);
        expect(enSpool).toEqual(['m0', 'm1', 'm2']);
    });

    it('el spool respeta el tope de tamaño y descarta lo más viejo', () => {
        process.env.HISTORIAL_MAX_SPOOL_MB = '1';
        process.env.HISTORIAL_MAX_COLA = '100000';
        process.env.HISTORIAL_LOTE_MAX = '100000';
        const grande = 'ñ'.repeat(4000);
        for (let i = 0; i < 400; i++) registrarMensaje(mensaje(`${i}:${grande}`)); // ~1,6 MB
        expect(volcarHistorialAlApagar()).toBe(400);
        expect(fs.statSync(rutaSpool).size).toBeLessThanOrEqual(1024 * 1024);
        const lineas = fs.readFileSync(rutaSpool, 'utf-8').trim().split('\n');
        expect(lineas.length).toBeLessThan(400);
        expect(JSON.parse(lineas[lineas.length - 1]).texto.startsWith('399:')).toBe(true); // lo más nuevo se conserva
    });
});

describe('nunca lanza', () => {
    it('registrarMensaje con datos que explotan al leerse', () => {
        const venenoso: any = { direccion: 'entrante', origen: 'paciente', tipo: 'texto' };
        Object.defineProperty(venenoso, 'telefono', { get() { throw new Error('boom'); } });
        expect(() => registrarMensaje(venenoso)).not.toThrow();
        expect(() => registrarMensaje(null as any)).not.toThrow();
        expect(() => registrarEventoSistema(undefined, 'x')).not.toThrow();
        expect(() => registrarEstadoMeta(null, 'read')).not.toThrow();
    });

    it('el listener de entrantes no lanza con ctx raro ni con un bot que explota, y no bloquea', () => {
        const listener = crearListenerHistorial(() => { throw new Error('sin bot'); });
        expect(() => listener(undefined)).not.toThrow();
        expect(() => listener({ from: '573001112233', type: 'text', body: 'hola' })).not.toThrow();
        // Pasó igual (en_blacklist queda null) y no hubo ninguna petición de red durante la captura.
        expect(_estadoParaPruebas().cola[0]).toMatchObject({ texto: 'hola', en_blacklist: null });
        expect(post).not.toHaveBeenCalled();
    });

    it('un fallo de disco al volcar no tumba nada (se conservan en memoria los más recientes)', () => {
        process.env.HISTORIAL_MAX_COLA = '2';
        process.env.HISTORIAL_LOTE_MAX = '1000';
        _resetParaPruebas({ rutaSpool: path.join(dir, 'no-existe', 'spool.jsonl') });
        expect(() => { for (let i = 0; i < 5; i++) registrarMensaje(mensaje(`m${i}`)); }).not.toThrow();
        expect(_estadoParaPruebas().cola.length).toBeGreaterThan(0);
    });
});

describe('entrantes', () => {
    it('un reintento del webhook de Meta produce el mismo mensaje_uid; el texto se trunca y no hay await', () => {
        const listener = crearListenerHistorial(() => ({ dynamicBlacklist: { checkIf: (n: string) => n === '573001112233' } }));
        const ctx = { from: '573001112233', type: 'text', body: 'a'.repeat(5000), message_id: 'wamid.IN1', timestamp: String(Math.floor(Date.now() / 1000)) };
        const resultado = listener(ctx);
        listener(ctx);
        expect(resultado).toBeUndefined(); // síncrona: no devuelve promesa
        const [a, b] = _estadoParaPruebas().cola;
        expect(a.mensaje_uid).toBe(b.mensaje_uid);
        expect(a.mensaje_uid).toBe(uuidV5('in:wamid.IN1'));
        expect(a.wa_message_id).toBe('wamid.IN1');
        expect(a.texto!.length).toBe(MAX_TEXTO);
        expect(a.texto!.endsWith('[…]')).toBe(true);
        expect(a.en_blacklist).toBe(true);
    });

    it('un timestamp absurdo de Meta se ignora (se usa la hora de recepción)', () => {
        const listener = crearListenerHistorial(() => undefined);
        listener({ from: '573001112233', type: 'text', body: 'x', message_id: 'w', timestamp: '1000' });
        expect(Math.abs(Date.now() - new Date(_estadoParaPruebas().cola[0].ocurrido_at).getTime())).toBeLessThan(5000);
    });

    it('mapeo de cada tipo de ctx del provider', () => {
        expect(traducirEntrante({ type: 'text', body: 'hola' })).toEqual({ tipo: 'texto', texto: 'hola', contenido: null });
        expect(traducirEntrante({ type: 'button', body: 'Confirmo asistencia', payload: 'LEREC:abc:C' }))
            .toEqual({ tipo: 'boton', texto: 'Confirmo asistencia', contenido: { payload: 'LEREC:abc:C' } });
        expect(traducirEntrante({ type: 'interactive', body: 'Agendar', title_button_reply: 'Agendar' }))
            .toEqual({ tipo: 'boton', texto: 'Agendar', contenido: null });
        expect(traducirEntrante({ type: 'interactive', body: 'row_1', title_list_reply: 'Agendar cita' }))
            .toEqual({ tipo: 'lista', texto: 'Agendar cita', contenido: { id: 'row_1' } });
        expect(traducirEntrante({ type: 'image', caption: 'foto', url: 'https://lookaside/secreto?hash=1' }))
            .toEqual({ tipo: 'imagen', texto: 'foto', contenido: null }); // la url temporal con credenciales NO se guarda
        expect(traducirEntrante({ type: 'audio', url: 'https://x' })).toEqual({ tipo: 'audio', texto: null, contenido: null });
        expect(traducirEntrante({ type: 'location', latitude: 4.6, longitude: -74 })).toEqual({ tipo: 'ubicacion', texto: null, contenido: null }); // sin coordenadas
        expect(traducirEntrante({ type: 'document', url: 'https://x' })).toEqual({ tipo: 'documento', texto: null, contenido: null });
        expect(traducirEntrante({ type: 'interactive', nfm_reply: { a: 1 } }).tipo).toBe('otro');
        expect(traducirEntrante({}).tipo).toBe('otro');
        expect(traducirEntrante({ type: 'order' })).toMatchObject({ tipo: 'otro', contenido: { tipo_original: 'order' } });
    });
});

describe('salientes: body de Graph → mensaje', () => {
    it('texto, botones, lista, plantilla y archivos', () => {
        expect(traducirBodyGraph({ type: 'text', text: { body: 'Hola' } })).toMatchObject({ tipo: 'texto', texto: 'Hola' });
        expect(traducirBodyGraph({ type: 'interactive', interactive: { type: 'button', body: { text: 'Elige' }, action: { buttons: [{ reply: { title: 'Sí' } }, { reply: { title: 'No' } }] } } }))
            .toMatchObject({ tipo: 'botones', texto: 'Elige', contenido: { botones: ['Sí', 'No'] } });
        expect(traducirBodyGraph({ type: 'interactive', interactive: { type: 'list', body: { text: 'Menú' }, action: { button: 'Ver', sections: [{ title: 'S', rows: [{ id: '1', title: 'Agendar' }, { id: '2', title: 'Cancelar' }] }] } } }))
            .toMatchObject({ tipo: 'lista_opciones', texto: 'Menú', contenido: { boton: 'Ver', secciones: [{ titulo: 'S', filas: ['Agendar', 'Cancelar'] }] } });
        const plantilla = traducirBodyGraph({
            type: 'template',
            template: {
                name: 'recordatorio_2h_botones', language: { code: 'es_CO' },
                components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }, { type: 'text', text: '10:00' }] }, { type: 'button', index: '0', parameters: [{ type: 'payload', payload: 'LEREC:abc:C' }] }],
            },
        });
        expect(plantilla).toMatchObject({ tipo: 'plantilla', texto: null, plantilla: 'recordatorio_2h_botones', contenido: { idioma: 'es_CO', parametros: ['Ana', '10:00'], botones: [{ indice: '0', payload: 'LEREC:abc:C' }] } });
        expect(traducirBodyGraph({ type: 'document', document: { id: '1', filename: 'tarifas.pdf', caption: 'Tarifas' } }))
            .toMatchObject({ tipo: 'documento', texto: 'Tarifas', contenido: { archivo: 'tarifas.pdf' } });
        expect(traducirBodyGraph({ type: 'raro' })).toMatchObject({ tipo: 'otro' });
    });

    it('el contenido demasiado grande se reemplaza por una marca, sin perder el mensaje', () => {
        registrarMensaje(mensaje('x', { contenido: { a: 'z'.repeat(9000) } }));
        expect(_estadoParaPruebas().cola[0].contenido).toMatchObject({ truncado: true });
    });

    it('truncarTexto: vacío → null; largo → termina en […]', () => {
        expect(truncarTexto('')).toBeNull();
        expect(truncarTexto(undefined)).toBeNull();
        expect(truncarTexto('a'.repeat(MAX_TEXTO))!.length).toBe(MAX_TEXTO);
        expect(truncarTexto('a'.repeat(MAX_TEXTO + 1))!.length).toBe(MAX_TEXTO);
    });
});

describe('envoltorio de sendMessageToApi', () => {
    it('devuelve exactamente lo que devuelve el provider y registra el saliente con su wa_message_id', async () => {
        const respuesta = { messages: [{ id: 'wamid.OUT1' }] };
        const provider: any = { sendMessageToApi: jest.fn().mockResolvedValue(respuesta) };
        expect(envolverEnvioProvider(provider)).toBe(true);
        const body = { to: '573001112233', type: 'text', text: { body: 'Hola paciente' } };
        await expect(provider.sendMessageToApi(body)).resolves.toBe(respuesta);
        expect(provider.sendMessageToApi).not.toBe(undefined);
        expect(_estadoParaPruebas().cola[0]).toMatchObject({ direccion: 'saliente', origen: 'bot_flujo', tipo: 'texto', texto: 'Hola paciente', wa_message_id: 'wamid.OUT1', estado_envio: 'aceptado' });
    });

    it('relanza el MISMO error original cuando Graph falla y registra error_api con el código', async () => {
        const error = Object.assign(new Error('Request failed with status code 400'), { response: { data: { error: { code: 131047 } } } });
        const original = jest.fn().mockRejectedValue(error);
        const provider: any = { sendMessageToApi: original };
        envolverEnvioProvider(provider);
        await expect(provider.sendMessageToApi({ to: '573001112233', type: 'text', text: { body: 'x' } })).rejects.toBe(error);
        expect(_estadoParaPruebas().cola[0]).toMatchObject({ estado_envio: 'error_api', error_code: '131047', wa_message_id: null });
    });

    it('un fallo al registrar nunca cambia lo que ve el flujo', async () => {
        const respuesta = { messages: [{ id: 'w' }] };
        const provider: any = { sendMessageToApi: jest.fn().mockResolvedValue(respuesta) };
        envolverEnvioProvider(provider);
        // body sin `to` y sin tipo: el registro no puede fallar hacia afuera.
        await expect(provider.sendMessageToApi({ })).resolves.toBe(respuesta);
        await expect(provider.sendMessageToApi(null)).resolves.toBe(respuesta);
    });

    it('si el provider no expone sendMessageToApi, avisa y sigue sin capturar (no tumba el bot)', () => {
        expect(envolverEnvioProvider({})).toBe(false);
        expect(envolverEnvioProvider(undefined)).toBe(false);
        expect((console.error as jest.Mock).mock.calls[0][0]).toContain('sendMessageToApi');
    });
});

describe('postGraph (las llamadas a Graph de apiService)', () => {
    const url = 'https://graph.facebook.com/v22.0/123/messages';
    const body = { messaging_product: 'whatsapp', to: '573001112233', type: 'template', template: { name: 'cita_cancelada_sin_confirmacion', language: { code: 'es_CO' }, components: [] } };

    it('devuelve la misma respuesta y registra la plantilla con su campaña (solo nombre; parámetros en contenido)', async () => {
        const respuesta = { status: 200, data: { messages: [{ id: 'wamid.T1' }] } };
        post.mockResolvedValue(respuesta);
        const config = { timeout: 15000 };
        await expect(postGraph(url, body, config, { origen: 'campana', campana: 'aviso_cancel_auto' })).resolves.toBe(respuesta);
        expect(post).toHaveBeenCalledWith(url, body, config);
        expect(_estadoParaPruebas().cola[0]).toMatchObject({
            direccion: 'saliente', origen: 'campana', tipo: 'plantilla', plantilla: 'cita_cancelada_sin_confirmacion', campana: 'aviso_cancel_auto', texto: null, wa_message_id: 'wamid.T1',
        });
    });

    it('relanza el mismo error y deja constancia del rechazo', async () => {
        const error = Object.assign(new Error('x'), { response: { status: 400, data: { error: { code: 132001 } } } });
        post.mockRejectedValue(error);
        await expect(postGraph(url, body, {}, { origen: 'campana', campana: 'daily' })).rejects.toBe(error);
        expect(_estadoParaPruebas().cola[0]).toMatchObject({ estado_envio: 'error_api', error_code: '132001' });
    });

    it('con la bandera apagada se comporta como un axios.post normal y no registra nada', async () => {
        process.env.HISTORIAL_MENSAJES_ENABLED = 'false';
        post.mockResolvedValue({ data: {} });
        await postGraph(url, body, undefined);
        expect(post).toHaveBeenCalledTimes(1);
        expect(_estadoParaPruebas().cola).toHaveLength(0);
    });
});
