// Runbook B6: registro de avisos al asesor que no se entregan (sin envíos reales: apiService simulado).
jest.mock('../../services/apiService', () => ({
    enviarMensajeTextoMeta: jest.fn(),
    registrarActividadBot: jest.fn(async () => true),
}));

import * as api from '../../services/apiService';
import { enviarAvisoAsesor, procesarNoticeProvider, _resetAvisosPendientesParaPruebas } from '../avisoAsesor';

const mockedApi = api as jest.Mocked<typeof api>;

beforeEach(() => {
    jest.clearAllMocks();
    _resetAvisosPendientesParaPruebas();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const flush = () => new Promise((r) => setImmediate(r));

it('fallo síncrono de Graph API → registra aviso_asesor_fallido sin texto del aviso', async () => {
    mockedApi.enviarMensajeTextoMeta.mockResolvedValueOnce({
        exito: false,
        error: { http_status: 400, code: 131047, mensaje: 'Re-engagement message' },
    });
    const ok = await enviarAvisoAsesor({
        tipo: 'crisis',
        canal: '573158070460',
        referencia: 'tel:********4567',
        mensaje: 'TEXTO SENSIBLE DEL AVISO',
    });
    expect(ok).toBe(false);
    expect(mockedApi.registrarActividadBot).toHaveBeenCalledTimes(1);
    const [tipoEvento, idUsuario, metadata] = mockedApi.registrarActividadBot.mock.calls[0];
    expect(tipoEvento).toBe('aviso_asesor_fallido');
    expect(idUsuario).toBe('********0460');
    expect(metadata).toEqual(expect.objectContaining({
        tipo_aviso: 'crisis', referencia: 'tel:********4567', fase: 'envio', http_status: 400, error_code: 131047,
    }));
    expect(JSON.stringify(metadata)).not.toContain('TEXTO SENSIBLE');
});

it('canal vacío → registra fallo canal_no_configurado sin intentar enviar', async () => {
    const ok = await enviarAvisoAsesor({ tipo: 'escalamiento_lista_espera', canal: '', referencia: 'cupo:X', mensaje: 'x' });
    expect(ok).toBe(false);
    expect(mockedApi.enviarMensajeTextoMeta).not.toHaveBeenCalled();
    expect(mockedApi.registrarActividadBot).toHaveBeenCalledWith(
        'aviso_asesor_fallido', 'sin_canal', expect.objectContaining({ fase: 'canal_no_configurado', referencia: 'cupo:X' })
    );
});

it('aceptado por Meta y luego webhook "failed" (notice del provider) → registra fallo fase estado_webhook', async () => {
    mockedApi.enviarMensajeTextoMeta.mockResolvedValueOnce({ exito: true, mensajeWaId: 'wamid.X' });
    const ok = await enviarAvisoAsesor({ tipo: 'escalamiento_lista_espera', canal: '573158070460', referencia: 'cupo:C1', mensaje: 'x' });
    expect(ok).toBe(true);
    expect(mockedApi.registrarActividadBot).not.toHaveBeenCalled();

    // Mismo formato que emite @builderbot/provider-meta (extractStatus → 'notice').
    procesarNoticeProvider({
        title: '🔔  META ALERT  🔔',
        instructions: ['Number(573158070460): Message failed to send because more than 24 hours have passed since the customer last replied to this number.'],
    });
    await flush();
    expect(mockedApi.registrarActividadBot).toHaveBeenCalledWith(
        'aviso_asesor_fallido', '********0460',
        expect.objectContaining({ fase: 'estado_webhook', referencia: 'cupo:C1', tipo_aviso: 'escalamiento_lista_espera' })
    );

    // El mismo aviso no se registra dos veces si Meta reintenta el webhook.
    procesarNoticeProvider({ instructions: ['Number(573158070460): otra vez'] });
    await flush();
    expect(mockedApi.registrarActividadBot).toHaveBeenCalledTimes(1);
});

it('notice de otro número (paciente) no se atribuye a avisos del asesor', async () => {
    mockedApi.enviarMensajeTextoMeta.mockResolvedValueOnce({ exito: true, mensajeWaId: 'wamid.Y' });
    await enviarAvisoAsesor({ tipo: 'crisis', canal: '573158070460', referencia: 'tel:x', mensaje: 'x' });
    procesarNoticeProvider({ instructions: ['Number(573001234567): Unknown'] });
    await flush();
    expect(mockedApi.registrarActividadBot).not.toHaveBeenCalled();
});

it('notice con payload inesperado no lanza', () => {
    expect(() => procesarNoticeProvider(undefined)).not.toThrow();
    expect(() => procesarNoticeProvider({ instructions: 'x' })).not.toThrow();
});
