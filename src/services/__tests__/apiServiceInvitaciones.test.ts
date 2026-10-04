// Cliente del backend y plantilla de la invitación a la lista de espera (axios simulado: no se llama a
// Meta ni al backend). Contrato: proyecto-ips/docs/features/2026-10-04-campanas-invitacion-lista-espera-implementacion.md, 6.4/6.5.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

import axios from 'axios';
import {
    API_BACKEND_URL,
    previsualizarInvitaciones,
    reservarInvitaciones,
    registrarEnvioInvitacion,
    finalizarSinRespuestaInvitaciones,
    finalizarEjecucionInvitacion,
    consultarInvitacionesPorDocumento,
    responderInvitacion,
    registrarOptinListaEspera,
    enviarPlantillaInvitacionListaEspera,
    TIMEOUT_BACKEND_RECORDATORIOS_MS,
} from '../apiService';

const post = (axios as any).post as jest.Mock;
const get = (axios as any).get as jest.Mock;
const ENV_ORIGINAL = { ...process.env };
const BASE = `${API_BACKEND_URL}/chatbot/listaespera/invitaciones`;

const inv = {
    invitacion_id: 'I1J2K3L4',
    agenda_id: 'A1B2C3D4',
    telefono: '573001234567',
    nombre: 'María',
    profesional: 'Ana Pérez',
    fecha_cita: '2026-10-20',
    hora_cita: '09:00:00',
    especialidad: 'Especialidad que no debe salir',
};

const errorHttp = (status: number, cuerpo: any) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: cuerpo } });

beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ENV_ORIGINAL, numberId: 'NUM', jwtToken: 'TOKEN', NOMBRE_PLANTILLA_LE_INVITACION: 'lista_espera_invitacion' };
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...ENV_ORIGINAL };
});

describe('enviarPlantillaInvitacionListaEspera', () => {
    beforeEach(() => {
        post.mockResolvedValue({ status: 200, data: { messages: [{ id: 'wamid.1', message_status: 'accepted' }] } });
    });

    it('arma la plantilla con 4 variables (sin especialidad) y los payloads LEINV en los botones 0 y 1', async () => {
        const resultado = await enviarPlantillaInvitacionListaEspera(inv, 'uuid-1', 'le_invit_reg');
        expect(resultado).toEqual({ exito: true, mensajeWaId: 'wamid.1' });
        expect(post).toHaveBeenCalledTimes(1);
        const [url, body, opciones] = post.mock.calls[0];
        expect(url).toBe('https://graph.facebook.com/v22.0/NUM/messages');
        expect(opciones.headers.Authorization).toBe('Bearer TOKEN');
        expect(body.to).toBe('573001234567');
        expect(body.template.name).toBe('lista_espera_invitacion');
        expect(body.template.language).toEqual({ code: 'es_CO' });
        expect(body.template.components).toEqual([
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: 'María' },
                    { type: 'text', text: 'Ana Pérez' },
                    { type: 'text', text: '20 de octubre de 2026' },
                    { type: 'text', text: '09:00' },
                ],
            },
            { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'LEINV:I1J2K3L4:A' }] },
            { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: 'LEINV:I1J2K3L4:R' }] },
        ]);
        expect(JSON.stringify(body)).not.toContain('Especialidad');
    });

    it('nombre o profesional vacíos → respaldos legibles, nunca "-" (QA T-08)', async () => {
        await enviarPlantillaInvitacionListaEspera({ ...inv, nombre: '', profesional: ' 	 ' }, 'uuid-1', 'le_invit_reg');
        const parametros = post.mock.calls[0][1].template.components[0].parameters.map((p: any) => p.text);
        expect(parametros).toEqual(['paciente', 'tu profesional', '20 de octubre de 2026', '09:00']);
        await enviarPlantillaInvitacionListaEspera({ ...inv, nombre: null as any, profesional: undefined as any }, 'uuid-1', 'le_invit_reg');
        const parametros2 = post.mock.calls[1][1].template.components[0].parameters.map((p: any) => p.text);
        expect(parametros2.slice(0, 2)).toEqual(['paciente', 'tu profesional']);
    });

    it('normaliza un teléfono de 10 dígitos a 57…', async () => {
        await enviarPlantillaInvitacionListaEspera({ ...inv, telefono: '3001234567' }, undefined, 'le_invit_cont');
        expect(post.mock.calls[0][1].to).toBe('573001234567');
    });

    it('sin nombre de plantilla no llama a Meta', async () => {
        process.env.NOMBRE_PLANTILLA_LE_INVITACION = '';
        const resultado = await enviarPlantillaInvitacionListaEspera(inv, 'uuid-1', 'le_invit_reg');
        expect(resultado.exito).toBe(false);
        expect(resultado.errorCode).toBe('sin_plantilla');
        expect(post).not.toHaveBeenCalled();
    });

    it('teléfono no contactable → no llama a Meta', async () => {
        const resultado = await enviarPlantillaInvitacionListaEspera({ ...inv, telefono: '6071234' }, 'uuid-1', 'le_invit_reg');
        expect(resultado).toMatchObject({ exito: false, errorCode: 'telefono_invalido' });
        expect(post).not.toHaveBeenCalled();
    });

    it('error de Meta → exito false con el código, sin imprimir teléfono ni nombre', async () => {
        post.mockRejectedValueOnce(errorHttp(400, { error: { code: 131026, message: 'Message undeliverable' } }));
        const errorLog = console.error as jest.Mock;
        const resultado = await enviarPlantillaInvitacionListaEspera(inv, 'uuid-1', 'le_invit_reg');
        expect(resultado).toMatchObject({ exito: false, errorCode: '131026' });
        const logs = JSON.stringify(errorLog.mock.calls) + JSON.stringify((console.log as jest.Mock).mock.calls);
        expect(logs).not.toContain('573001234567');
        expect(logs).not.toContain('María');
    });

    it('el log de éxito enmascara el teléfono', async () => {
        await enviarPlantillaInvitacionListaEspera(inv, 'uuid-1', 'le_invit_reg');
        const logs = JSON.stringify((console.log as jest.Mock).mock.calls);
        expect(logs).not.toContain('573001234567');
        expect(logs).toContain('4567');
    });
});

describe('cliente de /chatbot/listaespera/invitaciones/*', () => {
    it('previsualizar: GET /candidatas con query (fechas solo en regularización, piloto separado por comas)', async () => {
        get.mockResolvedValueOnce({ status: 200, data: { data: { total_elegibles: 3 } } });
        const r = await previsualizarInvitaciones({ campana_tipo: 'regularizacion', fecha_desde: '2026-10-01', fecha_hasta: null, solo_telefonos: ['573001234567', '573009998877'] });
        expect(r).toEqual({ ok: true, code: 200, data: { total_elegibles: 3 } });
        expect(get).toHaveBeenCalledWith(`${BASE}/candidatas`, {
            params: { campana_tipo: 'regularizacion', fecha_desde: '2026-10-01', solo_telefonos: '573001234567,573009998877' },
            timeout: TIMEOUT_BACKEND_RECORDATORIOS_MS,
        });

        get.mockResolvedValueOnce({ status: 200, data: { data: {} } });
        await previsualizarInvitaciones({ campana_tipo: 'continua', fecha_desde: '2026-10-01' });
        expect(get.mock.calls[1][1].params).toEqual({ campana_tipo: 'continua' });
    });

    it.each([
        ['reservar', () => reservarInvitaciones({ campana_tipo: 'continua', origen: 'cron', ejecucion_id: null, campana_ejecucion_id: null, lote: 10, limite: 200, fecha_desde: null, fecha_hasta: null, solo_telefonos: [] })],
        ['registrar-envio', () => registrarEnvioInvitacion({ invitacion_id: 'I1J2K3L4', exito: false, motivo: 'bloqueado_crisis' })],
        ['finalizar-sin-respuesta', () => finalizarSinRespuestaInvitaciones()],
        ['ejecuciones/finalizar', () => finalizarEjecucionInvitacion({ ejecucion_id: 'E1F2G3H4', estado: 'finalizada', motivo_fin: 'sin_candidatas', duracion_ms: 10 })],
        ['por-documento', () => consultarInvitacionesPorDocumento('1234567890', '573001234567')],
        ['responder', () => responderInvitacion({ invitacion_id: 'I1J2K3L4', celular: '573001234567', documento: '1234567890', respuesta: 'rechaza', via: 'payload' })],
        ['registrar-optin', () => registrarOptinListaEspera({ paciente_id: 'P1', profesional_id: 'E1', fecha_cita: '2026-10-20', hora_cita: '09:00', decision: 'rechaza', celular: '573001234567', lista_espera_id: null })],
    ])('POST /%s con timeout; 200 → ok:true con response.data.data', async (ruta, llamar) => {
        post.mockResolvedValueOnce({ status: 200, data: { isError: false, data: { x: 1 } } });
        const r = await llamar();
        expect(r).toEqual({ ok: true, code: 200, data: { x: 1 } });
        expect(post.mock.calls[0][0]).toBe(`${BASE}/${ruta}`);
        expect(post.mock.calls[0][2]).toEqual({ timeout: TIMEOUT_BACKEND_RECORDATORIOS_MS });
    });

    it('finalizar-sin-respuesta con horas las manda; sin horas manda {}', async () => {
        post.mockResolvedValue({ status: 200, data: { data: {} } });
        await finalizarSinRespuestaInvitaciones(48);
        await finalizarSinRespuestaInvitaciones();
        expect(post.mock.calls[0][1]).toEqual({ horas: 48 });
        expect(post.mock.calls[1][1]).toEqual({});
    });

    it.each([
        [403, 'DOCUMENTO_NO_COINCIDE', null],
        [403, 'INVITACION_NO_PERTENECE', null],
        [404, 'INVITACION_NOT_FOUND', null],
        [409, 'CITA_NO_VALIDA', { estado_cita: 'Cancelado' }],
        [409, 'INVITACION_NO_VIGENTE', null],
        [400, 'INVALID_BODY', null],
    ])('responder %i %s → {ok:false, code, cause, data} sin lanzar', async (status, cause, data) => {
        post.mockRejectedValueOnce(errorHttp(status, { isError: true, code: status, cause, data }));
        const r = await responderInvitacion({ invitacion_id: 'I1J2K3L4', celular: '573001234567', documento: '123', respuesta: 'acepta', via: 'payload', consentimiento_texto: 'texto de consentimiento' });
        expect(r).toEqual({ ok: false, code: status, cause, data });
    });

    it('reservar 409 FUERA_DE_HORARIO_CONTACTO → ok:false con el cause', async () => {
        post.mockRejectedValueOnce(errorHttp(409, { cause: 'FUERA_DE_HORARIO_CONTACTO' }));
        const r = await reservarInvitaciones({ campana_tipo: 'continua', origen: 'cron', ejecucion_id: null, campana_ejecucion_id: null, lote: 10, limite: 200, fecha_desde: null, fecha_hasta: null, solo_telefonos: [] });
        expect(r).toEqual({ ok: false, code: 409, cause: 'FUERA_DE_HORARIO_CONTACTO', data: null });
    });

    it('red / timeout → ok:false, code null, cause ERROR; el log no lleva el documento', async () => {
        post.mockRejectedValueOnce(Object.assign(new Error('timeout of 25000ms exceeded'), { code: 'ECONNABORTED' }));
        const r = await consultarInvitacionesPorDocumento('1234567890', '573001234567');
        expect(r).toEqual({ ok: false, code: null, cause: 'ERROR', data: null });
        const logs = JSON.stringify((console.error as jest.Mock).mock.calls);
        expect(logs).not.toContain('1234567890');
        expect(logs).not.toContain('573001234567');
    });
});
