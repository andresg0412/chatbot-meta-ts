// D7: entrega de la alerta de crisis al backend (que la envía por correo). axios simulado.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

import axios from 'axios';
import { registrarAlertaCrisisPorCorreo } from '../apiService';

const post = (axios as any).post as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('registrarAlertaCrisisPorCorreo', () => {
    it('manda solo el teléfono y devuelve si el correo está configurado en el backend', async () => {
        post.mockResolvedValue({ data: { data: { estado: 'registrada', correo_configurado: true } } });
        const r = await registrarAlertaCrisisPorCorreo('573001234567');
        expect(r).toEqual({ registrada: true, correoConfigurado: true, intentos: 1 });
        expect(post.mock.calls[0][0]).toContain('/chatbot/notificaciones/crisis');
        expect(post.mock.calls[0][1]).toEqual({ telefono: '573001234567' });
    });

    it('informa cuando el backend lo registró pero el correo no está configurado', async () => {
        post.mockResolvedValue({ data: { data: { estado: 'registrada', correo_configurado: false } } });
        expect((await registrarAlertaCrisisPorCorreo('573001234567')).correoConfigurado).toBe(false);
    });

    it('reintenta ante una caída del backend y termina bien si se recupera', async () => {
        post.mockRejectedValueOnce(new Error('ECONNREFUSED')).mockRejectedValueOnce({ response: { status: 503 } }).mockResolvedValue({ data: { data: { correo_configurado: true } } });
        const r = await registrarAlertaCrisisPorCorreo('573001234567', { esperaMs: 1 });
        expect(r).toEqual({ registrada: true, correoConfigurado: true, intentos: 3 });
    });

    it('si todos los intentos fallan devuelve registrada=false (nunca lanza)', async () => {
        post.mockRejectedValue(new Error('ECONNREFUSED'));
        const r = await registrarAlertaCrisisPorCorreo('573001234567', { esperaMs: 1, intentos: 3 });
        expect(r).toEqual({ registrada: false, correoConfigurado: null, intentos: 3 });
        expect(post).toHaveBeenCalledTimes(3);
    });

    it('un 4xx (teléfono inválido) no se reintenta', async () => {
        post.mockRejectedValue({ response: { status: 400 } });
        const r = await registrarAlertaCrisisPorCorreo('123', { esperaMs: 1 });
        expect(r.registrada).toBe(false);
        expect(post).toHaveBeenCalledTimes(1);
    });
});
