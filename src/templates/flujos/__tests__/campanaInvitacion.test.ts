// Ejecutor y endpoints de las campañas de invitación a la lista de espera, con apiService simulado (sin
// backend ni Meta): candado, interruptor apagado a mitad de la ejecución, kill switch, crisis, 409 de
// horario, cierre por cada motivo_fin y liberación del candado.
// proyecto-ips/docs/features/2026-10-04-campanas-invitacion-lista-espera-implementacion.md, 6.5 / T8.

jest.mock('../../../services/apiService', () => ({
    previsualizarInvitaciones: jest.fn(),
    reservarInvitaciones: jest.fn(),
    registrarEnvioInvitacion: jest.fn(),
    finalizarSinRespuestaInvitaciones: jest.fn(),
    finalizarEjecucionInvitacion: jest.fn(),
    enviarPlantillaInvitacionListaEspera: jest.fn(),
}));
jest.mock('../../../services/citasService', () => ({ esBotHabilitado: jest.fn(() => true) }));
jest.mock('../../../utils/crisisBlacklistStore', () => ({ obtenerBloqueadosPorCrisis: jest.fn(() => []) }));
jest.mock('../../../utils/trazabilidad', () => ({
    iniciarEjecucionCampana: jest.fn(() => 'uuid-ejecucion'),
    finalizarEjecucionCampana: jest.fn(),
}));

import * as api from '../../../services/apiService';
import { esBotHabilitado } from '../../../services/citasService';
import { obtenerBloqueadosPorCrisis } from '../../../utils/crisisBlacklistStore';
import { iniciarEjecucionCampana, finalizarEjecucionCampana } from '../../../utils/trazabilidad';
import {
    ejecutarCampanaInvitacion,
    campanaInvitacionEnCurso,
    _liberarCandadosParaPruebas,
} from '../listaEspera/campanaInvitacion';
import {
    executeListaEsperaRegularizacionCampaign,
    executeListaEsperaContinuaCampaign,
} from '../../../controllers/listaEsperaInvitacionCampaignController';
import { campanaDeInvitacion, _limpiarCampanasAnotadasParaPruebas } from '../../../utils/invitacionPayload';

const mockedApi = api as jest.Mocked<typeof api>;
const ENV_ORIGINAL = { ...process.env };

const inv = (id: string, telefono = '573001234567') => ({
    invitacion_id: id,
    agenda_id: `AG${id.slice(2)}`,
    telefono,
    nombre: 'María',
    profesional: 'Ana Pérez',
    fecha_cita: '2026-10-20',
    hora_cita: '09:00',
    especialidad: 'NoSeMuestra',
});

const reservaOk = (invitaciones: any[], motivo_fin: any = null, ejecucion_id = 'EJEC0001') => ({
    ok: true as const,
    code: 200,
    data: { ejecucion_id, invitaciones, reservadas_total: invitaciones.length, quedan_elegibles: 0, motivo_fin },
});

const PARAMS = { limite: 50, origen: 'manual' as const, fecha_desde: '2026-10-01', fecha_hasta: '2026-12-31' };

beforeEach(() => {
    jest.clearAllMocks();
    _liberarCandadosParaPruebas();
    _limpiarCampanasAnotadasParaPruebas();
    process.env = {
        ...ENV_ORIGINAL,
        LISTA_ESPERA_INVITACION_ENABLED: 'true',
        NOMBRE_PLANTILLA_LE_INVITACION: 'lista_espera_invitacion',
        LISTA_ESPERA_INVITACION_PAUSA_MS: '0',
        LISTA_ESPERA_INVITACION_LOTE: '2',
    };
    delete process.env.LISTA_ESPERA_TELEFONOS_PILOTO;
    delete process.env.LISTA_ESPERA_INVITACION_LIMITE_CONTINUA;
    (esBotHabilitado as jest.Mock).mockReturnValue(true);
    (obtenerBloqueadosPorCrisis as jest.Mock).mockReturnValue([]);
    mockedApi.finalizarSinRespuestaInvitaciones.mockResolvedValue({
        ok: true, code: 200, data: { pendientes_resueltas_enviada: 0, pendientes_a_error: 0, anuladas: 0, sin_respuesta: 0 },
    });
    mockedApi.registrarEnvioInvitacion.mockImplementation(async (body: any) => ({
        ok: true, code: 200, data: { invitacion_id: body.invitacion_id, estado: body.exito ? 'enviada' : 'error', ya_registrado: false },
    }));
    mockedApi.finalizarEjecucionInvitacion.mockResolvedValue({ ok: true, code: 200, data: {} });
    mockedApi.enviarPlantillaInvitacionListaEspera.mockImplementation(async (i: any) => ({ exito: true, mensajeWaId: `wamid.${i.invitacion_id}` }));
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...ENV_ORIGINAL };
});

describe('ejecutarCampanaInvitacion', () => {
    it('recorre los lotes hasta motivo_fin, envía, registra cada envío y cierra la ejecución', async () => {
        process.env.LISTA_ESPERA_TELEFONOS_PILOTO = '3001234567, 573009998877';
        mockedApi.reservarInvitaciones
            .mockResolvedValueOnce(reservaOk([inv('IN000001'), inv('IN000002')]))
            .mockResolvedValueOnce(reservaOk([inv('IN000003')], 'limite_alcanzado'));

        const resumen = await ejecutarCampanaInvitacion('regularizacion', PARAMS);

        expect(resumen).toMatchObject({ estado: 'finalizada', motivo_fin: 'limite_alcanzado', ejecucion_id: 'EJEC0001', reservadas: 3, enviadas: 3, errores: 0 });
        expect(mockedApi.finalizarSinRespuestaInvitaciones).toHaveBeenCalledTimes(1);
        expect(mockedApi.reservarInvitaciones).toHaveBeenCalledTimes(2);
        expect(mockedApi.reservarInvitaciones).toHaveBeenNthCalledWith(1, {
            campana_tipo: 'regularizacion',
            origen: 'manual',
            ejecucion_id: null,
            campana_ejecucion_id: 'uuid-ejecucion',
            lote: 2,
            limite: 50,
            fecha_desde: '2026-10-01',
            fecha_hasta: '2026-12-31',
            solo_telefonos: ['573001234567', '573009998877'],
        });
        expect(mockedApi.reservarInvitaciones.mock.calls[1][0].ejecucion_id).toBe('EJEC0001');
        expect(mockedApi.enviarPlantillaInvitacionListaEspera).toHaveBeenCalledWith(expect.objectContaining({ invitacion_id: 'IN000001' }), 'uuid-ejecucion', 'le_invit_reg');
        expect(mockedApi.registrarEnvioInvitacion).toHaveBeenCalledWith({
            invitacion_id: 'IN000001', exito: true, plantilla: 'lista_espera_invitacion', mensaje_wa_id: 'wamid.IN000001',
        });
        expect(mockedApi.finalizarEjecucionInvitacion).toHaveBeenCalledWith({
            ejecucion_id: 'EJEC0001', estado: 'finalizada', motivo_fin: 'limite_alcanzado', duracion_ms: expect.any(Number),
        });
        expect(iniciarEjecucionCampana).toHaveBeenCalledWith('le_invit_reg', 'manual');
        expect(finalizarEjecucionCampana).toHaveBeenCalledWith('le_invit_reg', 'uuid-ejecucion', { total: 3, exitosos: 3, errores: 0, origen: 'manual' });
        expect(campanaDeInvitacion('IN000002')).toBe('le_invit_reg');
        expect(campanaInvitacionEnCurso('regularizacion')).toBe(false);
    });

    it('continua: sin fechas, origen cron, código de trazabilidad le_invit_cont y sin lista piloto → solo_telefonos []', async () => {
        mockedApi.reservarInvitaciones.mockResolvedValueOnce(reservaOk([], 'sin_candidatas'));
        const resumen = await ejecutarCampanaInvitacion('continua', { limite: 200, origen: 'cron', fecha_desde: '2026-01-01' });
        expect(resumen).toMatchObject({ estado: 'finalizada', motivo_fin: 'sin_candidatas' });
        expect(mockedApi.reservarInvitaciones).toHaveBeenCalledWith(expect.objectContaining({
            campana_tipo: 'continua', origen: 'cron', fecha_desde: null, fecha_hasta: null, solo_telefonos: [], limite: 200,
        }));
        expect(iniciarEjecucionCampana).toHaveBeenCalledWith('le_invit_cont', 'cron');
        expect(mockedApi.finalizarEjecucionInvitacion).toHaveBeenCalledWith(expect.objectContaining({ estado: 'finalizada', motivo_fin: 'sin_candidatas' }));
    });

    it.each(['config_incompleta', 'sin_candidatas'])('motivo_fin %s con invitaciones vacías → cierra con ese motivo', async (motivo) => {
        mockedApi.reservarInvitaciones.mockResolvedValueOnce(reservaOk([], motivo));
        const resumen = await ejecutarCampanaInvitacion('regularizacion', PARAMS);
        expect(resumen.motivo_fin).toBe(motivo);
        expect(mockedApi.enviarPlantillaInvitacionListaEspera).not.toHaveBeenCalled();
        expect(mockedApi.finalizarEjecucionInvitacion).toHaveBeenCalledWith(expect.objectContaining({ motivo_fin: motivo, estado: 'finalizada' }));
    });

    it('sin invitaciones y sin motivo_fin no insiste (sin_candidatas)', async () => {
        mockedApi.reservarInvitaciones.mockResolvedValue(reservaOk([], null));
        const resumen = await ejecutarCampanaInvitacion('regularizacion', PARAMS);
        expect(resumen.motivo_fin).toBe('sin_candidatas');
        expect(mockedApi.reservarInvitaciones).toHaveBeenCalledTimes(1);
    });

    it('número bloqueado por crisis → registrar-envio con motivo bloqueado_crisis, sin enviar la plantilla', async () => {
        (obtenerBloqueadosPorCrisis as jest.Mock).mockReturnValue(['573005550000']);
        mockedApi.reservarInvitaciones.mockResolvedValueOnce(reservaOk([inv('IN000001', '573005550000'), inv('IN000002')], 'limite_alcanzado'));
        const resumen = await ejecutarCampanaInvitacion('regularizacion', PARAMS);
        expect(mockedApi.registrarEnvioInvitacion).toHaveBeenCalledWith({ invitacion_id: 'IN000001', exito: false, motivo: 'bloqueado_crisis' });
        expect(mockedApi.enviarPlantillaInvitacionListaEspera).toHaveBeenCalledTimes(1);
        expect(mockedApi.enviarPlantillaInvitacionListaEspera).toHaveBeenCalledWith(expect.objectContaining({ invitacion_id: 'IN000002' }), 'uuid-ejecucion', 'le_invit_reg');
        expect(resumen).toMatchObject({ bloqueadas_crisis: 1, enviadas: 1 });
    });

    it('fallo de Meta → registrar-envio con exito false y el error de Meta', async () => {
        mockedApi.enviarPlantillaInvitacionListaEspera.mockResolvedValueOnce({ exito: false, errorCode: '131026', errorTitulo: 'Message undeliverable' });
        mockedApi.reservarInvitaciones.mockResolvedValueOnce(reservaOk([inv('IN000001')], 'limite_alcanzado'));
        const resumen = await ejecutarCampanaInvitacion('regularizacion', PARAMS);
        expect(mockedApi.registrarEnvioInvitacion).toHaveBeenCalledWith({
            invitacion_id: 'IN000001', exito: false, plantilla: 'lista_espera_invitacion', error_code: '131026', error_titulo: 'Message undeliverable',
        });
        expect(resumen).toMatchObject({ enviadas: 0, errores: 1 });
    });

    it('409 FUERA_DE_HORARIO_CONTACTO en el primer lote → termina sin ejecución que cerrar', async () => {
        mockedApi.reservarInvitaciones.mockResolvedValueOnce({ ok: false, code: 409, cause: 'FUERA_DE_HORARIO_CONTACTO', data: null });
        const resumen = await ejecutarCampanaInvitacion('regularizacion', PARAMS);
        expect(resumen).toMatchObject({ estado: 'finalizada', motivo_fin: 'fuera_de_horario', ejecucion_id: null });
        expect(mockedApi.finalizarEjecucionInvitacion).not.toHaveBeenCalled();
        expect(finalizarEjecucionCampana).toHaveBeenCalled();
    });

    it('409 FUERA_DE_HORARIO_CONTACTO en el segundo lote → cierra la ejecución con fuera_de_horario', async () => {
        mockedApi.reservarInvitaciones
            .mockResolvedValueOnce(reservaOk([inv('IN000001')]))
            .mockResolvedValueOnce({ ok: false, code: 409, cause: 'FUERA_DE_HORARIO_CONTACTO', data: null });
        await ejecutarCampanaInvitacion('regularizacion', PARAMS);
        expect(mockedApi.finalizarEjecucionInvitacion).toHaveBeenCalledWith(expect.objectContaining({
            ejecucion_id: 'EJEC0001', estado: 'finalizada', motivo_fin: 'fuera_de_horario',
        }));
    });

    it.each([
        [{ ok: false, code: 409, cause: 'EJECUCION_CERRADA', data: null }],
        [{ ok: false, code: 500, cause: 'ERROR', data: null }],
        [{ ok: false, code: null, cause: 'ERROR', data: null }],
    ])('reservar falla en el segundo lote (%j) → abortada / error', async (fallo) => {
        mockedApi.reservarInvitaciones.mockResolvedValueOnce(reservaOk([inv('IN000001')])).mockResolvedValueOnce(fallo as any);
        const resumen = await ejecutarCampanaInvitacion('regularizacion', PARAMS);
        expect(resumen).toMatchObject({ estado: 'abortada', motivo_fin: 'error' });
        expect(mockedApi.finalizarEjecucionInvitacion).toHaveBeenCalledWith(expect.objectContaining({ estado: 'abortada', motivo_fin: 'error' }));
    });

    it('interruptor apagado a mitad de la ejecución → no pide otro lote y cierra abortada / deshabilitada', async () => {
        mockedApi.reservarInvitaciones.mockResolvedValue(reservaOk([inv('IN000001'), inv('IN000002')]));
        mockedApi.enviarPlantillaInvitacionListaEspera.mockImplementation(async (i: any) => {
            process.env.LISTA_ESPERA_INVITACION_ENABLED = 'false';
            return { exito: true, mensajeWaId: `wamid.${i.invitacion_id}` };
        });
        const resumen = await ejecutarCampanaInvitacion('regularizacion', PARAMS);
        expect(mockedApi.reservarInvitaciones).toHaveBeenCalledTimes(1);
        // El lote ya reservado se termina de enviar (cada fila queda registrada, ninguna 'pendiente').
        expect(mockedApi.registrarEnvioInvitacion).toHaveBeenCalledTimes(2);
        expect(resumen).toMatchObject({ estado: 'abortada', motivo_fin: 'deshabilitada' });
        expect(mockedApi.finalizarEjecucionInvitacion).toHaveBeenCalledWith(expect.objectContaining({ estado: 'abortada', motivo_fin: 'deshabilitada' }));
    });

    it('kill switch apagado a mitad de la ejecución → abortada / deshabilitada', async () => {
        mockedApi.reservarInvitaciones.mockResolvedValue(reservaOk([inv('IN000001')]));
        (esBotHabilitado as jest.Mock).mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValue(false);
        const resumen = await ejecutarCampanaInvitacion('regularizacion', PARAMS);
        expect(mockedApi.reservarInvitaciones).toHaveBeenCalledTimes(1);
        expect(resumen).toMatchObject({ estado: 'abortada', motivo_fin: 'deshabilitada' });
    });

    it('kill switch apagado al iniciar → no llama al backend', async () => {
        (esBotHabilitado as jest.Mock).mockReturnValue(false);
        const resumen = await ejecutarCampanaInvitacion('regularizacion', PARAMS);
        expect(resumen).toMatchObject({ estado: 'no_iniciada', motivo_fin: 'deshabilitada' });
        expect(mockedApi.finalizarSinRespuestaInvitaciones).not.toHaveBeenCalled();
        expect(mockedApi.reservarInvitaciones).not.toHaveBeenCalled();
        expect(finalizarEjecucionCampana).toHaveBeenCalledWith('le_invit_reg', 'uuid-ejecucion', expect.objectContaining({ total: 0 }));
        expect(campanaInvitacionEnCurso('regularizacion')).toBe(false);
    });

    it('sin NOMBRE_PLANTILLA_LE_INVITACION → no llama a reservar (config_incompleta)', async () => {
        process.env.NOMBRE_PLANTILLA_LE_INVITACION = '  ';
        const resumen = await ejecutarCampanaInvitacion('continua', { limite: 200, origen: 'cron' });
        expect(resumen).toMatchObject({ estado: 'no_iniciada', motivo_fin: 'config_incompleta' });
        expect(mockedApi.reservarInvitaciones).not.toHaveBeenCalled();
    });

    it('finalizar-sin-respuesta falla → la campaña sigue', async () => {
        mockedApi.finalizarSinRespuestaInvitaciones.mockResolvedValueOnce({ ok: false, code: 500, cause: 'ERROR', data: null });
        mockedApi.reservarInvitaciones.mockResolvedValueOnce(reservaOk([inv('IN000001')], 'limite_alcanzado'));
        const resumen = await ejecutarCampanaInvitacion('regularizacion', PARAMS);
        expect(resumen.enviadas).toBe(1);
    });

    it('candado: una segunda ejecución de la misma campaña mientras corre la primera no hace nada', async () => {
        let soltar: (v: any) => void = () => undefined;
        mockedApi.reservarInvitaciones.mockImplementationOnce(() => new Promise((r) => { soltar = r; }));
        const primera = ejecutarCampanaInvitacion('regularizacion', PARAMS);
        expect(campanaInvitacionEnCurso('regularizacion')).toBe(true);
        expect(campanaInvitacionEnCurso('continua')).toBe(false);
        const segunda = await ejecutarCampanaInvitacion('regularizacion', PARAMS);
        expect(segunda.estado).toBe('en_curso');
        await new Promise((r) => setTimeout(r, 10));
        soltar(reservaOk([], 'sin_candidatas'));
        await primera;
        expect(mockedApi.reservarInvitaciones).toHaveBeenCalledTimes(1);
        expect(campanaInvitacionEnCurso('regularizacion')).toBe(false);
    });

    it('el candado se libera aunque algo lance (finally)', async () => {
        mockedApi.reservarInvitaciones.mockRejectedValueOnce(new Error('boom'));
        const resumen = await ejecutarCampanaInvitacion('regularizacion', PARAMS);
        expect(resumen).toMatchObject({ estado: 'abortada', motivo_fin: 'error' });
        expect(campanaInvitacionEnCurso('regularizacion')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

function fakeRes() {
    const res: any = { status: 0, cuerpo: null };
    res.writeHead = jest.fn((status: number) => { res.status = status; });
    res.end = jest.fn((texto: string) => { res.cuerpo = JSON.parse(texto); });
    return res;
}

const esperarCola = () => new Promise((r) => setTimeout(r, 20));

describe('POST /v1/campaigns/lista-espera-regularizacion', () => {
    it.each([
        [{ limite: 0 }],
        [{ limite: 301 }],
        [{ limite: 10.5 }],
        [{ limite: '50' }],
        [{ fecha_desde: '2026-13-01' }],
        [{ fecha_desde: '05/10/2026' }],
        [{ fecha_desde: '2026-12-01', fecha_hasta: '2026-11-01' }],
        [{ origen: 'endpoint' }],
        [{ modo_previsualizacion: 'true' }],
        [{ incluir_hoy: true }],
        [{ forzar_reintento: true }],
        [{ modo_previsualizacion: true, incluir_ids: 'true' }],
        [[1, 2]],
    ])('body inválido %j → 400', async (body) => {
        const res = fakeRes();
        await executeListaEsperaRegularizacionCampaign({ body }, res);
        expect(res.status).toBe(400);
        expect(mockedApi.reservarInvitaciones).not.toHaveBeenCalled();
        expect(mockedApi.previsualizarInvitaciones).not.toHaveBeenCalled();
    });

    it('previsualización → 200 síncrono con el data de /candidatas, aunque el interruptor esté apagado', async () => {
        process.env.LISTA_ESPERA_INVITACION_ENABLED = 'false';
        process.env.LISTA_ESPERA_TELEFONOS_PILOTO = '3001234567';
        const data = { campana_tipo: 'regularizacion', fecha_corte: '2026-10-05', total_evaluadas: 10, total_elegibles: 4, excluidas: {}, pacientes_varias_citas: 1, muestra_agenda_ids: ['A1B2C3D4'] };
        mockedApi.previsualizarInvitaciones.mockResolvedValueOnce({ ok: true, code: 200, data } as any);
        const res = fakeRes();
        await executeListaEsperaRegularizacionCampaign({ body: { modo_previsualizacion: true, fecha_desde: '2026-10-01' } }, res);
        expect(res.status).toBe(200);
        expect(res.cuerpo).toEqual(data);
        expect(mockedApi.previsualizarInvitaciones).toHaveBeenCalledWith({
            campana_tipo: 'regularizacion', fecha_desde: '2026-10-01', fecha_hasta: null, solo_telefonos: ['573001234567'],
        });
        expect(mockedApi.reservarInvitaciones).not.toHaveBeenCalled();
    });

    it('previsualización con incluir_ids (panel) → se pide la lista completa de ids al backend', async () => {
        process.env.LISTA_ESPERA_TELEFONOS_PILOTO = '';
        mockedApi.previsualizarInvitaciones.mockResolvedValueOnce({ ok: true, code: 200, data: { total_elegibles: 2 } } as any);
        const res = fakeRes();
        await executeListaEsperaRegularizacionCampaign({ body: { modo_previsualizacion: true, incluir_ids: true } }, res);
        expect(res.status).toBe(200);
        expect(mockedApi.previsualizarInvitaciones).toHaveBeenCalledWith({
            campana_tipo: 'regularizacion', fecha_desde: null, fecha_hasta: null, incluir_ids: true,
        });
    });

    it('previsualización con el backend caído → 502', async () => {
        mockedApi.previsualizarInvitaciones.mockResolvedValueOnce({ ok: false, code: null, cause: 'ERROR', data: null });
        const res = fakeRes();
        await executeListaEsperaRegularizacionCampaign({ body: { modo_previsualizacion: true } }, res);
        expect(res.status).toBe(502);
    });

    it('interruptor apagado → 200 deshabilitada, sin llamar al backend', async () => {
        process.env.LISTA_ESPERA_INVITACION_ENABLED = 'false';
        const res = fakeRes();
        await executeListaEsperaRegularizacionCampaign({ body: {} }, res);
        expect(res.status).toBe(200);
        expect(res.cuerpo).toEqual({ estado: 'deshabilitada' });
        await esperarCola();
        expect(mockedApi.finalizarSinRespuestaInvitaciones).not.toHaveBeenCalled();
        expect(mockedApi.reservarInvitaciones).not.toHaveBeenCalled();
    });

    it('arranque → 202 inmediato con el límite por defecto; una segunda llamada mientras corre → 409 en_curso', async () => {
        let soltar: (v: any) => void = () => undefined;
        mockedApi.reservarInvitaciones.mockImplementationOnce(() => new Promise((r) => { soltar = r; }));
        const res1 = fakeRes();
        await executeListaEsperaRegularizacionCampaign({ body: undefined }, res1);
        expect(res1.status).toBe(202);
        expect(res1.cuerpo).toEqual({ estado: 'iniciada', campana: 'regularizacion', limite: 50 });

        const res2 = fakeRes();
        await executeListaEsperaRegularizacionCampaign({ body: { limite: 100 } }, res2);
        expect(res2.status).toBe(409);
        expect(res2.cuerpo).toEqual({ estado: 'en_curso' });

        await esperarCola();
        soltar(reservaOk([], 'sin_candidatas'));
        await esperarCola();
        expect(campanaInvitacionEnCurso('regularizacion')).toBe(false);
        expect(mockedApi.reservarInvitaciones).toHaveBeenCalledTimes(1);
        expect(mockedApi.reservarInvitaciones).toHaveBeenCalledWith(expect.objectContaining({ limite: 50, origen: 'manual' }));
    });

    it('origen cron y límite explícito', async () => {
        mockedApi.reservarInvitaciones.mockResolvedValueOnce(reservaOk([], 'sin_candidatas'));
        const res = fakeRes();
        await executeListaEsperaRegularizacionCampaign({ body: { origen: 'cron', limite: 100 } }, res);
        expect(res.cuerpo).toEqual({ estado: 'iniciada', campana: 'regularizacion', limite: 100 });
        await esperarCola();
        expect(mockedApi.reservarInvitaciones).toHaveBeenCalledWith(expect.objectContaining({ limite: 100, origen: 'cron' }));
    });
});

describe('kill switch y plantilla se validan antes del 202 (QA T-09)', () => {
    it.each([
        ['regularizacion', executeListaEsperaRegularizacionCampaign],
        ['continua', executeListaEsperaContinuaCampaign],
    ])('%s: kill switch apagado → 200 no_iniciada / bot_deshabilitado, sin llamar al backend', async (_tipo, handler) => {
        (esBotHabilitado as jest.Mock).mockReturnValue(false);
        const res = fakeRes();
        await (handler as any)({ body: {} }, res);
        expect(res.status).toBe(200);
        expect(res.cuerpo).toEqual({ estado: 'no_iniciada', motivo: 'bot_deshabilitado' });
        await esperarCola();
        expect(mockedApi.finalizarSinRespuestaInvitaciones).not.toHaveBeenCalled();
        expect(mockedApi.reservarInvitaciones).not.toHaveBeenCalled();
        expect(iniciarEjecucionCampana).not.toHaveBeenCalled();
    });

    it.each([
        ['regularizacion', executeListaEsperaRegularizacionCampaign],
        ['continua', executeListaEsperaContinuaCampaign],
    ])('%s: sin NOMBRE_PLANTILLA_LE_INVITACION → 200 no_iniciada / config_incompleta', async (_tipo, handler) => {
        process.env.NOMBRE_PLANTILLA_LE_INVITACION = '';
        const res = fakeRes();
        await (handler as any)({ body: {} }, res);
        expect(res.status).toBe(200);
        expect(res.cuerpo).toEqual({ estado: 'no_iniciada', motivo: 'config_incompleta' });
        await esperarCola();
        expect(mockedApi.reservarInvitaciones).not.toHaveBeenCalled();
    });

    it('la previsualización sigue funcionando con el kill switch apagado y sin plantilla', async () => {
        (esBotHabilitado as jest.Mock).mockReturnValue(false);
        process.env.NOMBRE_PLANTILLA_LE_INVITACION = '';
        mockedApi.previsualizarInvitaciones.mockResolvedValueOnce({ ok: true, code: 200, data: { total_elegibles: 1 } } as any);
        const res = fakeRes();
        await executeListaEsperaRegularizacionCampaign({ body: { modo_previsualizacion: true } }, res);
        expect(res.status).toBe(200);
        expect(res.cuerpo).toEqual({ total_elegibles: 1 });
    });
});

describe('POST /v1/campaigns/lista-espera-continua', () => {
    it.each([[{ fecha_desde: '2026-10-01' }], [{ limite: 10 }], [{ origen: 'manual' }]])('no acepta %j → 400', async (body) => {
        const res = fakeRes();
        await executeListaEsperaContinuaCampaign({ body }, res);
        expect(res.status).toBe(400);
    });

    it('body {} → 202 con el límite de LISTA_ESPERA_INVITACION_LIMITE_CONTINUA, origen cron', async () => {
        process.env.LISTA_ESPERA_INVITACION_LIMITE_CONTINUA = '120';
        mockedApi.reservarInvitaciones.mockResolvedValueOnce(reservaOk([], 'config_incompleta'));
        const res = fakeRes();
        await executeListaEsperaContinuaCampaign({ body: {} }, res);
        expect(res.status).toBe(202);
        expect(res.cuerpo).toEqual({ estado: 'iniciada', campana: 'continua', limite: 120 });
        await esperarCola();
        expect(mockedApi.reservarInvitaciones).toHaveBeenCalledWith(expect.objectContaining({ campana_tipo: 'continua', limite: 120, origen: 'cron' }));
    });

    it('límite por defecto 200', async () => {
        mockedApi.reservarInvitaciones.mockResolvedValueOnce(reservaOk([], 'sin_candidatas'));
        const res = fakeRes();
        await executeListaEsperaContinuaCampaign({ body: {} }, res);
        expect(res.cuerpo.limite).toBe(200);
        await esperarCola();
    });

    it('interruptor apagado → deshabilitada; previsualización sí responde', async () => {
        process.env.LISTA_ESPERA_INVITACION_ENABLED = 'false';
        const res = fakeRes();
        await executeListaEsperaContinuaCampaign({ body: {} }, res);
        expect(res.cuerpo).toEqual({ estado: 'deshabilitada' });

        mockedApi.previsualizarInvitaciones.mockResolvedValueOnce({ ok: true, code: 200, data: { total_elegibles: 3 } } as any);
        const res2 = fakeRes();
        await executeListaEsperaContinuaCampaign({ body: { modo_previsualizacion: true } }, res2);
        expect(res2.status).toBe(200);
        expect(mockedApi.previsualizarInvitaciones).toHaveBeenCalledWith({ campana_tipo: 'continua', fecha_desde: null, fecha_hasta: null });
    });
});
