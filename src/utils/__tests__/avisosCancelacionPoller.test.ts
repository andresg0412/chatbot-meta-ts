// Avisos de cita cancelada al paciente: poller, armado de las dos plantillas y formatos de fecha/hora.
// Diseño: proyecto-ips/docs/features/2026-10-23-avisos-cancelacion-paciente.md, sección 5.
//
// apiService REAL con axios simulado: se comprueba el cuerpo exacto que iría a Meta sin enviar nada.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

import axios from 'axios';
import { API_BACKEND_URL, AvisoCancelacionReservado, nombrePlantillaAvisoCancelacion } from '../../services/apiService';
import { _resetAvisosPollerParaPruebas, _sondearSerializadoParaPruebas, sondearAvisosCancelacion } from '../avisosCancelacionPoller';
import { formatearFechaConDiaSemana, formatearHora12h } from '../fechaHora';

const post = (axios as any).post as jest.Mock;
const ENV_ORIGINAL = { ...process.env };
const TOKEN = 'token-secreto-de-prueba-0123456789';
const URL_RESERVAR = `${API_BACKEND_URL}/chatbot/avisos-cancelacion/reservar`;
const URL_RESULTADO = `${API_BACKEND_URL}/chatbot/avisos-cancelacion/resultado`;

const aviso = (over: Partial<AvisoCancelacionReservado> = {}): AvisoCancelacionReservado => ({
    aviso_id: 'AV000001', tipo: 'automatica', agenda_id: 'AG000001', nombre_paciente: 'ANA PEREZ', especialidad: 'Psicología',
    fecha_cita: '2026-10-24', hora_cita: '14:00', profesional: 'LAURA GOMEZ', telefono: '3001234567', ...over,
});
const ok = (data: unknown) => ({ status: 200, data: { isError: false, data, code: 200 } });
const aceptadoMeta = (id = 'wamid.ABC') => ({ status: 200, data: { messages: [{ id, message_status: 'accepted' }] } });

/** Simula backend y Meta según la URL. `meta` decide la respuesta de Graph para cada envío. */
function simular(avisos: AvisoCancelacionReservado[], meta: (body: any) => any = () => aceptadoMeta(), resultado?: () => any) {
    post.mockImplementation(async (url: string, body: any) => {
        if (url === URL_RESERVAR) return ok({ dentro_de_horario: true, avisos, descartados: {} });
        if (url === URL_RESULTADO) return resultado ? resultado() : ok({ aviso_id: body.aviso_id, estado: body.resultado });
        if (url.includes('graph.facebook.com')) {
            const r = meta(body);
            if (r instanceof Error) throw r;
            return r;
        }
        throw new Error(`URL inesperada: ${url}`);
    });
}
const llamadasA = (filtro: (url: string) => boolean) => post.mock.calls.filter((c) => filtro(String(c[0])));
const enviosMeta = () => llamadasA((u) => u.includes('graph.facebook.com'));
const resultados = () => llamadasA((u) => u === URL_RESULTADO).map((c) => c[1]);

beforeEach(() => {
    jest.clearAllMocks();
    _resetAvisosPollerParaPruebas();
    process.env = { ...ENV_ORIGINAL, CANCELACION_AUTOMATICA_TOKEN: TOKEN, numberId: '123', jwtToken: 'jwt' };
    delete process.env.NOMBRE_PLANTILLA_CITA_CANCELADA_SIN_CONFIRMACION;
    delete process.env.NOMBRE_PLANTILLA_NOTIFICACION_CITA_CANCELADA;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...ENV_ORIGINAL };
});

describe('formatos de fecha y hora de los avisos', () => {
    it('fecha con día de la semana, con y sin año (mes con mayúscula, como en los ejemplos aprobados)', () => {
        expect(formatearFechaConDiaSemana('2026-10-24', true)).toBe('sábado, 24 de Octubre de 2026');
        expect(formatearFechaConDiaSemana('2026-10-27', false)).toBe('martes, 27 de Octubre');
        expect(formatearFechaConDiaSemana('2026-10-28T05:00:00.000Z', false)).toBe('miércoles, 28 de Octubre');
        expect(formatearFechaConDiaSemana('2026-01-04', true)).toBe('domingo, 4 de Enero de 2026');
        expect(formatearFechaConDiaSemana('no-es-fecha', true)).toBe('no-es-fecha');
        expect(formatearFechaConDiaSemana('2026-02-31', true)).toBe('2026-02-31');
        expect(formatearFechaConDiaSemana(null, true)).toBe('');
    });

    it('hora en 12 h sin cero a la izquierda', () => {
        expect(formatearHora12h('14:00')).toBe('2:00 pm');
        expect(formatearHora12h('15:00:00')).toBe('3:00 pm');
        expect(formatearHora12h('09:30')).toBe('9:30 am');
        expect(formatearHora12h('12:00')).toBe('12:00 pm');
        expect(formatearHora12h('00:15')).toBe('12:15 am');
        expect(formatearHora12h('7:05')).toBe('7:05 am');
        expect(formatearHora12h('25:00')).toBe('25:00');
        expect(formatearHora12h(undefined)).toBe('');
    });
});

describe('plantillas', () => {
    it('nombres por defecto y configurables', () => {
        expect(nombrePlantillaAvisoCancelacion('automatica')).toBe('cita_cancelada_sin_confirmacion');
        expect(nombrePlantillaAvisoCancelacion('globho')).toBe('notificacion_cita_cancelada');
        process.env.NOMBRE_PLANTILLA_NOTIFICACION_CITA_CANCELADA = 'otra_plantilla';
        expect(nombrePlantillaAvisoCancelacion('globho')).toBe('otra_plantilla');
    });

    it('automática: cita_cancelada_sin_confirmacion con las 5 variables en orden, fecha con año y sin componente de botón', async () => {
        simular([aviso()]);
        await sondearAvisosCancelacion({ pausaMs: 0, esperaReintentoMs: 0 });

        expect(enviosMeta()).toHaveLength(1);
        const [url, body, config] = enviosMeta()[0];
        expect(url).toBe('https://graph.facebook.com/v22.0/123/messages');
        expect(config.headers.Authorization).toBe('Bearer jwt');
        expect(body).toEqual({
            messaging_product: 'whatsapp',
            to: '573001234567',
            type: 'template',
            template: {
                name: 'cita_cancelada_sin_confirmacion',
                language: { code: 'es_CO' },
                components: [{
                    type: 'body',
                    parameters: [
                        { type: 'text', text: 'ANA PEREZ' },
                        { type: 'text', text: 'Psicología' },
                        { type: 'text', text: 'sábado, 24 de Octubre de 2026' },
                        { type: 'text', text: '2:00 pm' },
                        { type: 'text', text: 'LAURA GOMEZ' },
                    ],
                }],
            },
        });
        expect(resultados()).toEqual([{ aviso_id: 'AV000001', resultado: 'enviado', wa_message_id: 'wamid.ABC' }]);
    });

    it('Globho: notificacion_cita_cancelada con la fecha sin año', async () => {
        simular([aviso({ aviso_id: 'AV000002', tipo: 'globho', fecha_cita: '2026-10-27', hora_cita: '15:00' })]);
        await sondearAvisosCancelacion({ pausaMs: 0, esperaReintentoMs: 0 });

        const body = enviosMeta()[0][1];
        expect(body.template.name).toBe('notificacion_cita_cancelada');
        expect(body.template.components[0].parameters.map((p: any) => p.text))
            .toEqual(['ANA PEREZ', 'Psicología', 'martes, 27 de Octubre', '3:00 pm', 'LAURA GOMEZ']);
    });

    it('valores vacíos o con espacios raros no rompen la plantilla (Meta rechaza vacíos y tabuladores)', async () => {
        simular([aviso({ nombre_paciente: '', especialidad: null, profesional: 'LAURA\tGOMEZ ' })]);
        await sondearAvisosCancelacion({ pausaMs: 0, esperaReintentoMs: 0 });
        const textos = enviosMeta()[0][1].template.components[0].parameters.map((p: any) => p.text);
        expect(textos[0]).toBe('paciente');
        expect(textos[1]).toBe('consulta');
        expect(textos[4]).toBe('LAURA GOMEZ');
    });
});

describe('poller', () => {
    it('sin token no llama al backend ni a Meta', async () => {
        delete process.env.CANCELACION_AUTOMATICA_TOKEN;
        const r = await sondearAvisosCancelacion();
        expect(r.reservados).toBe(0);
        expect(post).not.toHaveBeenCalled();
    });

    it('reserva con el token en el header y el límite', async () => {
        simular([]);
        await sondearAvisosCancelacion();
        expect(post).toHaveBeenCalledTimes(1);
        expect(post.mock.calls[0][1]).toEqual({ limite: 20 });
        expect(post.mock.calls[0][2].headers).toEqual({ 'x-cancelacion-token': TOKEN });
    });

    it('teléfono inválido: no envía nada a Meta y lo reporta como descartado', async () => {
        simular([aviso({ telefono: '6015551234' })]); // fijo de Bogotá
        const r = await sondearAvisosCancelacion({ pausaMs: 0, esperaReintentoMs: 0 });
        expect(enviosMeta()).toHaveLength(0);
        expect(resultados()).toEqual([{ aviso_id: 'AV000001', resultado: 'descartado', motivo: 'telefono_invalido' }]);
        expect(r).toMatchObject({ reservados: 1, descartados: 1 });
    });

    it('si Meta rechaza el envío, lo reporta como fallido con el código de error y sigue con el siguiente', async () => {
        const errorMeta: any = new Error('Request failed with status code 400');
        errorMeta.response = { status: 400, data: { error: { code: 132001, message: 'Template name does not exist' } } };
        simular(
            [aviso(), aviso({ aviso_id: 'AV000002', agenda_id: 'AG000002' })],
            (body) => (body.to === '573001234567' && enviosMeta().length === 1 ? errorMeta : aceptadoMeta('wamid.2'))
        );
        const r = await sondearAvisosCancelacion({ pausaMs: 0, esperaReintentoMs: 0 });
        expect(resultados()).toEqual([
            { aviso_id: 'AV000001', resultado: 'fallido', motivo: 'error_meta', error_code: '132001' },
            { aviso_id: 'AV000002', resultado: 'enviado', wa_message_id: 'wamid.2' },
        ]);
        expect(r).toMatchObject({ reservados: 2, enviados: 1, fallidos: 1 });
    });

    it('si el reporte no llega al backend, lo reintenta una sola vez (nunca reenvía el WhatsApp)', async () => {
        let intentos = 0;
        simular([aviso()], undefined, () => {
            intentos++;
            if (intentos === 1) throw Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
            return ok({});
        });
        await sondearAvisosCancelacion({ pausaMs: 0, esperaReintentoMs: 0 });
        expect(intentos).toBe(2);
        expect(enviosMeta()).toHaveLength(1);
    });

    it('si el backend no responde a reservar, no envía nada', async () => {
        post.mockRejectedValue(Object.assign(new Error('down'), { code: 'ECONNREFUSED' }));
        const r = await sondearAvisosCancelacion();
        expect(r.reservados).toBe(0);
        expect(enviosMeta()).toHaveLength(0);
    });

    it('nunca corren dos sondeos a la vez: una llamada durante un sondeo deja UNO más pendiente', async () => {
        let liberar!: () => void;
        const bloqueo = new Promise<void>((r) => { liberar = r; });
        let reservas = 0;
        post.mockImplementation(async (url: string) => {
            if (url === URL_RESERVAR) {
                reservas++;
                if (reservas === 1) await bloqueo;
                return ok({ dentro_de_horario: true, avisos: [], descartados: {} });
            }
            throw new Error(`URL inesperada: ${url}`);
        });
        const primero = _sondearSerializadoParaPruebas();
        await _sondearSerializadoParaPruebas();
        await _sondearSerializadoParaPruebas();
        liberar();
        await primero;
        expect(reservas).toBe(2);
    });
});
