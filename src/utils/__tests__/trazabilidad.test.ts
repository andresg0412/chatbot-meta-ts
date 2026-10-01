// Trazabilidad V2 (proyecto-ips/docs/features/2026-09-29-trazabilidad-usuarios.md, 4.3.1 y 11): cola en
// memoria, envío por lotes a /stats/batch, backoff, spool en disco y "nunca lanza". axios simulado: no
// hay red real.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    trackEvento,
    trackEventoLegado,
    trackIdentificacion,
    trackPaso,
    trackErrorBackend,
    registrarFalloBackend,
    flushTrazabilidad,
    reenviarSpool,
    volcarPendientesAlApagar,
    iniciarTrazabilidad,
    registrarProveedorSesion,
    sanitizarMetadata,
    uuidV5,
    NAMESPACE_WA_ESTADO,
    MAX_EVENTOS_POR_LOTE,
    _estadoParaPruebas,
    _resetParaPruebas,
} from '../trazabilidad';
import { registrarActividadBot } from '../../services/apiService';

const post = (axios as any).post as jest.Mock;
const ENV_ORIGINAL = { ...process.env };
let dirTemporal: string;
let rutaSpool: string;

const OK_200 = { status: 200, data: { isError: false, code: 200, data: { recibidos: 1, insertados: 1, duplicados: 0, rechazados: [] } } };
const esperarMicrotareas = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
};
const eventosEnviados = (): any[] => post.mock.calls.flatMap((c) => c[1]?.eventos ?? []);

beforeEach(() => {
    jest.clearAllMocks();
    dirTemporal = fs.mkdtempSync(path.join(os.tmpdir(), 'trazabilidad-'));
    rutaSpool = path.join(dirTemporal, 'spool.jsonl');
    _resetParaPruebas({ rutaSpool });
    registrarProveedorSesion(null);
    process.env = {
        ...ENV_ORIGINAL,
        TRAZABILIDAD_V2_ENABLED: 'true',
        API_BACKEND_URL: 'http://backend.test/api',
    };
    delete process.env.TRAZABILIDAD_FLUSH_MS;
    delete process.env.TRAZABILIDAD_MAX_COLA;
    post.mockResolvedValue(OK_200);
    for (const m of ['log', 'error', 'warn'] as const) jest.spyOn(console, m).mockImplementation(() => undefined);
});

afterEach(() => {
    _resetParaPruebas();
    jest.useRealTimers();
    jest.restoreAllMocks();
    process.env = { ...ENV_ORIGINAL };
    fs.rmSync(dirTemporal, { recursive: true, force: true });
});

describe('construcción del evento', () => {
    it('completa evento_uid (UUID v4), v=2, ocurrido_at ISO y respeta los campos del contrato', () => {
        trackEvento({ tipo_evento: 'flujo_paso', telefono: '573001234567', flujo: 'agendar', paso: 'agendar.s08_fechas', resultado: 'mostrado' });
        const [evento] = _estadoParaPruebas().cola;
        expect(evento.evento_uid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(evento.v).toBe(2);
        expect(new Date(evento.ocurrido_at).toISOString()).toBe(evento.ocurrido_at);
        expect(evento).toEqual(expect.objectContaining({ tipo_evento: 'flujo_paso', telefono: '573001234567', flujo: 'agendar', paso: 'agendar.s08_fechas', resultado: 'mostrado' }));
    });

    it('interruptor apagado → trackEvento no encola nada', () => {
        process.env.TRAZABILIDAD_V2_ENABLED = 'false';
        trackEvento({ tipo_evento: 'flujo_paso', telefono: '573001234567' });
        expect(_estadoParaPruebas().cola).toHaveLength(0);
    });

    it('toma sesion_id y documento de la sesión activa; sesion_id:null desactiva el enriquecimiento', () => {
        registrarProveedorSesion({
            obtener: () => ({ sesionId: 'SES-1', documento: '12345678' }),
            actualizar: jest.fn(),
            registrarMensaje: jest.fn(),
            cerrar: jest.fn(),
            asegurar: jest.fn(),
        });
        trackEvento({ tipo_evento: 'flujo_paso', telefono: '573001234567' });
        trackEvento({ tipo_evento: 'wa_envio', telefono: '573001234567', sesion_id: null });
        const [conSesion, sinSesion] = _estadoParaPruebas().cola;
        expect(conSesion.sesion_id).toBe('SES-1');
        expect(conSesion.documento).toBe('12345678');
        expect(sinSesion.sesion_id).toBeUndefined();
        expect(sinSesion.documento).toBeUndefined();
    });

    it('metadata: claves por patrón, máximo 30, solo primitivos y strings truncados a 100', () => {
        const meta: Record<string, unknown> = { ok_1: 'a'.repeat(150), 'Clave-Mala': 1, objeto: { a: 1 }, lista: [1], nulo: null, n: 3, b: true };
        for (let i = 0; i < 40; i++) meta[`k${i}`] = i;
        const r = sanitizarMetadata(meta)!;
        expect(r.ok_1).toHaveLength(100);
        expect(r).not.toHaveProperty('Clave-Mala');
        expect(r).not.toHaveProperty('objeto');
        expect(r).not.toHaveProperty('lista');
        expect(r.nulo).toBeNull();
        expect(Object.keys(r)).toHaveLength(30);
    });

    it('tipo_evento inválido → se descarta sin lanzar', () => {
        expect(() => trackEvento({ tipo_evento: 'Tipo Inválido!' })).not.toThrow();
        expect(_estadoParaPruebas().cola).toHaveLength(0);
    });

    it('trackIdentificacion solo registra documentos con formato válido (nunca texto libre)', () => {
        trackIdentificacion('573001234567', 'me siento muy mal hoy', 'encontrado', 'comun.c03_documento');
        expect(_estadoParaPruebas().cola).toHaveLength(0);
        trackIdentificacion('573001234567', ' 1234567890 ', 'encontrado', 'comun.c03_documento', { flujo: 'cancelar' });
        const [evento] = _estadoParaPruebas().cola;
        expect(evento).toEqual(expect.objectContaining({ tipo_evento: 'identificacion', documento: '1234567890', flujo: 'cancelar', paso: 'comun.c03_documento', resultado: 'encontrado' }));
    });

    it('trackPaso: flujo del catálogo; en pasos comun.* el flujo en curso de la sesión', () => {
        const actualizar = jest.fn();
        registrarProveedorSesion({
            obtener: () => ({ sesionId: 'SES-1', ultimoFlujo: 'reprogramar' }),
            actualizar,
            registrarMensaje: jest.fn(),
            cerrar: jest.fn(),
            asegurar: jest.fn(),
        });
        trackPaso('573001234567', 'agendar.s08_fechas');
        trackPaso('573001234567', 'comun.c03_documento');
        const [a, b] = _estadoParaPruebas().cola;
        expect(a).toEqual(expect.objectContaining({ tipo_evento: 'flujo_paso', flujo: 'agendar', paso: 'agendar.s08_fechas', resultado: 'mostrado' }));
        expect(b).toEqual(expect.objectContaining({ flujo: 'reprogramar', paso: 'comun.c03_documento' }));
        expect(actualizar).toHaveBeenCalledWith('573001234567', expect.objectContaining({ ultimoFlujo: 'agendar', ultimoPaso: 'agendar.s08_fechas', limpiarFinNegocio: true }));
    });

    it('trackErrorBackend: sin fallo anotado no emite; con fallo reciente emite status y cause (una sola vez)', () => {
        trackErrorBackend('573001234567', 'agendar.s08_fechas', '/chatbot/fechas');
        expect(_estadoParaPruebas().cola).toHaveLength(0);
        registrarFalloBackend('/chatbot/fechas', { response: { status: 502, data: { cause: 'GLOBHO_ERROR', nombre: 'NO DEBE VIAJAR' } } });
        trackErrorBackend('573001234567', 'agendar.s08_fechas', '/chatbot/fechas');
        trackErrorBackend('573001234567', 'agendar.s08_fechas', '/chatbot/fechas');
        const cola = _estadoParaPruebas().cola;
        expect(cola).toHaveLength(1);
        expect(cola[0].metadata).toEqual({ endpoint: '/chatbot/fechas', http_status: 502, cause: 'GLOBHO_ERROR' });
        expect(JSON.stringify(cola[0])).not.toContain('NO DEBE VIAJAR');
    });
});

describe('envío por lotes', () => {
    it('POST {API_BACKEND_URL}/stats/batch con { eventos } y SIN headers de autenticación', async () => {
        trackEvento({ tipo_evento: 'flujo_paso', telefono: '573001234567' });
        trackEvento({ tipo_evento: 'flujo_paso', telefono: '573001234567' });
        trackEvento({ tipo_evento: 'flujo_paso', telefono: '573001234567' });
        expect(post).not.toHaveBeenCalled(); // por debajo de 50 no se envía solo
        await flushTrazabilidad();
        expect(post).toHaveBeenCalledTimes(1);
        const [url, body, config] = post.mock.calls[0];
        expect(url).toBe('http://backend.test/api/stats/batch');
        expect(body.eventos).toHaveLength(3);
        expect(config).toEqual({ timeout: expect.any(Number) });
        expect(config.headers).toBeUndefined();
        expect(_estadoParaPruebas().cola).toHaveLength(0);
    });

    it('flush por tamaño: al llegar a 50 eventos se envía sin esperar el intervalo', async () => {
        for (let i = 0; i < 49; i++) trackEvento({ tipo_evento: 'flujo_paso', telefono: '573001234567' });
        await esperarMicrotareas();
        expect(post).not.toHaveBeenCalled();
        trackEvento({ tipo_evento: 'flujo_paso', telefono: '573001234567' });
        await esperarMicrotareas();
        expect(post).toHaveBeenCalledTimes(1);
        expect(post.mock.calls[0][1].eventos).toHaveLength(50);
    });

    it('flush por tiempo: cada TRAZABILIDAD_FLUSH_MS', async () => {
        jest.useFakeTimers();
        process.env.TRAZABILIDAD_FLUSH_MS = '1000';
        trackEvento({ tipo_evento: 'flujo_paso', telefono: '573001234567' });
        jest.advanceTimersByTime(999);
        await esperarMicrotareas();
        expect(post).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        await esperarMicrotareas();
        expect(post).toHaveBeenCalledTimes(1);
    });

    it('lotes de máximo 100 eventos', async () => {
        for (let i = 0; i < 250; i++) trackEvento({ tipo_evento: 'flujo_paso', telefono: '1' });
        for (let i = 0; i < 20 && (_estadoParaPruebas().cola.length > 0 || _estadoParaPruebas().enVuelo); i++) {
            await esperarMicrotareas();
            await flushTrazabilidad();
        }
        const tamanos = post.mock.calls.map((c) => c[1].eventos.length);
        expect(Math.max(...tamanos)).toBeLessThanOrEqual(MAX_EVENTOS_POR_LOTE);
        expect(eventosEnviados()).toHaveLength(250);
    });

    it('500 o error de red → el lote entero vuelve a la cola y se reintenta con backoff', async () => {
        jest.useFakeTimers();
        post.mockRejectedValueOnce({ response: { status: 500 } });
        trackEvento({ tipo_evento: 'flujo_paso', telefono: '1' });
        trackEvento({ tipo_evento: 'flujo_paso', telefono: '1' });
        await flushTrazabilidad();
        const tras = _estadoParaPruebas();
        expect(tras.cola).toHaveLength(2);
        expect(tras.fallosConsecutivos).toBe(1);
        expect(tras.noAntesDe).toBeGreaterThan(Date.now());

        await flushTrazabilidad(); // dentro del backoff: no reintenta todavía
        expect(post).toHaveBeenCalledTimes(1);

        post.mockRejectedValueOnce({ code: 'ECONNREFUSED' });
        jest.advanceTimersByTime(1000);
        await flushTrazabilidad();
        expect(post).toHaveBeenCalledTimes(2);
        expect(_estadoParaPruebas().fallosConsecutivos).toBe(2);

        jest.advanceTimersByTime(2000); // backoff exponencial: 1 s, 2 s, ...
        await flushTrazabilidad();
        expect(post).toHaveBeenCalledTimes(3);
        expect(_estadoParaPruebas().cola).toHaveLength(0);
        // Mismo evento_uid en los tres intentos (el backend deduplica).
        const uids = post.mock.calls.map((c) => c[1].eventos.map((e: any) => e.evento_uid).join(','));
        expect(new Set(uids).size).toBe(1);
    });

    it('400 → el lote se descarta (reintentar no lo arreglaría)', async () => {
        post.mockRejectedValueOnce({ response: { status: 400 } });
        trackEvento({ tipo_evento: 'flujo_paso', telefono: '1' });
        await flushTrazabilidad();
        expect(_estadoParaPruebas().cola).toHaveLength(0);
        expect(_estadoParaPruebas().fallosConsecutivos).toBe(0);
    });
});

describe('spool en disco', () => {
    it('backend caído y cola > TRAZABILIDAD_MAX_COLA → spool; al "reiniciar" se reenvía', async () => {
        process.env.TRAZABILIDAD_MAX_COLA = '5';
        post.mockRejectedValue({ code: 'ECONNREFUSED' });
        const uids: string[] = [];
        for (let i = 0; i < 6; i++) {
            const uid = `00000000-0000-4000-8000-00000000000${i}`;
            uids.push(uid);
            trackEvento({ evento_uid: uid, tipo_evento: 'flujo_paso', telefono: '1' });
        }
        expect(_estadoParaPruebas().cola).toHaveLength(0);
        const lineas = fs.readFileSync(rutaSpool, 'utf-8').trim().split('\n');
        expect(lineas.map((l) => JSON.parse(l).evento_uid)).toEqual(uids);

        // "Reinicio": estado en memoria limpio, el spool sigue en disco.
        _resetParaPruebas({ rutaSpool });
        post.mockReset();
        post.mockResolvedValue(OK_200);
        process.env.TRAZABILIDAD_MAX_COLA = '5000';
        iniciarTrazabilidad();
        expect(fs.existsSync(rutaSpool)).toBe(false);
        await flushTrazabilidad();
        expect(eventosEnviados().map((e) => e.evento_uid)).toEqual(uids);
    });

    it('reenviarSpool respeta el tope de la cola y deja el resto en el spool; ignora líneas corruptas', () => {
        process.env.TRAZABILIDAD_MAX_COLA = '2';
        const ev = (n: number) => JSON.stringify({ evento_uid: `00000000-0000-4000-8000-00000000000${n}`, v: 2, tipo_evento: 'flujo_paso', ocurrido_at: new Date().toISOString(), telefono: null });
        fs.writeFileSync(rutaSpool, [ev(1), '{corrupta', ev(2), ev(3)].join('\n') + '\n');
        expect(reenviarSpool()).toBe(2);
        expect(_estadoParaPruebas().cola.map((e) => e.evento_uid.slice(-1))).toEqual(['1', '2']);
        const resto = fs.readFileSync(rutaSpool, 'utf-8').trim().split('\n');
        expect(resto).toHaveLength(1);
        expect(JSON.parse(resto[0]).evento_uid.slice(-1)).toBe('3');
    });

    it('al apagar, la cola pendiente se escribe en el spool', () => {
        trackEvento({ tipo_evento: 'flujo_paso', telefono: '1' });
        trackEvento({ tipo_evento: 'sesion_fin', telefono: '1' });
        expect(volcarPendientesAlApagar()).toBe(2);
        expect(_estadoParaPruebas().cola).toHaveLength(0);
        expect(fs.readFileSync(rutaSpool, 'utf-8').trim().split('\n')).toHaveLength(2);
    });

    it('con el interruptor apagado, iniciarTrazabilidad no toca el spool', () => {
        process.env.TRAZABILIDAD_V2_ENABLED = 'false';
        fs.writeFileSync(rutaSpool, '{}\n');
        iniciarTrazabilidad();
        expect(fs.existsSync(rutaSpool)).toBe(true);
    });
});

describe('nunca lanza', () => {
    it('axios que lanza de forma síncrona, proveedor de sesión que lanza, spool sin permisos', async () => {
        post.mockImplementation(() => {
            throw new Error('sincrono');
        });
        registrarProveedorSesion({
            obtener: () => {
                throw new Error('boom');
            },
            actualizar: () => {
                throw new Error('boom');
            },
            registrarMensaje: jest.fn(),
            cerrar: jest.fn(),
            asegurar: jest.fn(),
        });
        expect(() => trackEvento({ tipo_evento: 'flujo_paso', telefono: '1' })).not.toThrow();
        expect(() => trackPaso('1', 'agendar.s08_fechas')).not.toThrow();
        await expect(flushTrazabilidad()).resolves.toBeUndefined();

        _resetParaPruebas({ rutaSpool: path.join(dirTemporal, 'no-existe', 'spool.jsonl') });
        process.env.TRAZABILIDAD_MAX_COLA = '1';
        expect(() => {
            trackEvento({ tipo_evento: 'flujo_paso', telefono: '1' });
            trackEvento({ tipo_evento: 'flujo_paso', telefono: '1' });
        }).not.toThrow();
        expect(() => volcarPendientesAlApagar()).not.toThrow();
        expect(() => reenviarSpool()).not.toThrow();
    });

    it('sin API_BACKEND_URL no envía ni lanza (los eventos esperan en la cola)', async () => {
        delete process.env.API_BACKEND_URL;
        trackEvento({ tipo_evento: 'flujo_paso', telefono: '1' });
        await expect(flushTrazabilidad()).resolves.toBeUndefined();
        expect(post).not.toHaveBeenCalled();
        expect(_estadoParaPruebas().cola).toHaveLength(1);
    });
});

describe('UUID v5 de wa_estado', () => {
    it('vector conocido de RFC 4122 / Python (namespace DNS, "python.org")', () => {
        expect(uuidV5('python.org', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d');
    });

    it('namespace URL del contrato: mismo resultado que uuid.uuid5(uuid.NAMESPACE_URL, ...) de Python', () => {
        expect(NAMESPACE_WA_ESTADO).toBe('6ba7b811-9dad-11d1-80b4-00c04fd430c8');
        expect(uuidV5('wamid.HBgM:read')).toBe('63e8632c-7fee-521b-aa08-37476dfcd12f');
    });

    it('determinista y distinto por estado', () => {
        expect(uuidV5('wamid.X:sent')).toBe(uuidV5('wamid.X:sent'));
        expect(uuidV5('wamid.X:sent')).not.toBe(uuidV5('wamid.X:delivered'));
    });
});

describe('registrarActividadBot (legado)', () => {
    it('interruptor apagado: POST /stats uno por uno, sin esperar (devuelve true aunque el backend no responda), date en hora de Bogotá', async () => {
        process.env.TRAZABILIDAD_V2_ENABLED = 'false';
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-10-01T02:30:00.000Z')); // 21:30 del 30-sep en Bogotá
        post.mockImplementation(() => new Promise(() => undefined)); // backend colgado
        await expect(registrarActividadBot('chat_inicio', '573001234567', { step: 'x' })).resolves.toBe(true);
        expect(post).toHaveBeenCalledTimes(1);
        const [url, body] = post.mock.calls[0];
        expect(String(url)).toMatch(/\/stats$/);
        expect(body).toEqual({ tipo_evento: 'chat_inicio', id_usuario: '573001234567', metadata: { date: '2026-09-30', step: 'x' } });
        expect(_estadoParaPruebas().cola).toHaveLength(0);
    });

    it('interruptor apagado: un error del backend no se propaga', async () => {
        process.env.TRAZABILIDAD_V2_ENABLED = 'false';
        post.mockRejectedValue(new Error('caido'));
        await expect(registrarActividadBot('chat_inicio', '1')).resolves.toBe(true);
        await esperarMicrotareas();
    });

    it('interruptor encendido: va a la cola con el MISMO tipo_evento y la MISMA metadata (id_usuario de siempre)', async () => {
        await expect(registrarActividadBot('campahna_envio', 'EJECUCION_CAMPAHNA', { estado: 'finalizado', envios_exitosos: 3 })).resolves.toBe(true);
        expect(post).not.toHaveBeenCalled();
        const [evento] = _estadoParaPruebas().cola;
        expect(evento).toEqual(expect.objectContaining({ tipo_evento: 'campahna_envio', telefono: 'EJECUCION_CAMPAHNA', v: 2 }));
        expect(evento.metadata).toEqual(expect.objectContaining({ estado: 'finalizado', envios_exitosos: 3, date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }));
    });

    it('envíos de campaña legados no se asocian a la sesión del paciente; la confirmación sí', () => {
        registrarProveedorSesion({
            obtener: () => ({ sesionId: 'SES-1' }),
            actualizar: jest.fn(),
            registrarMensaje: jest.fn(),
            cerrar: jest.fn(),
            asegurar: jest.fn(),
        });
        trackEventoLegado('campahna_envio', '573001234567', { estado: 'enviado' });
        trackEventoLegado('campahna_envio', '573001234567', { estado: 'confirmado' });
        const [envio, confirmacion] = _estadoParaPruebas().cola;
        expect(envio.sesion_id).toBeUndefined();
        expect(confirmacion.sesion_id).toBe('SES-1');
    });
});
