// Fase 2 (punto 2.3): el middleware del webhook avisa al backend de los estados `failed` de Meta, sin
// bloquear ni romper nunca la respuesta al webhook.
jest.mock('../../services/apiService', () => ({
    marcarOfertaNoEntregada: jest.fn(async () => true),
}));

import { crearMiddlewareEstadosMeta } from '../trazabilidadMeta';
import * as api from '../../services/apiService';

const mockedApi = api as jest.Mocked<typeof api>;

function webhook(statuses: any[]) {
    return { entry: [{ changes: [{ value: { statuses } }] }] };
}

beforeEach(() => jest.clearAllMocks());

describe('crearMiddlewareEstadosMeta — estados failed', () => {
    it('un estado failed llama una vez a marcarOfertaNoEntregada y deja pasar la petición', () => {
        const next = jest.fn();
        crearMiddlewareEstadosMeta()(
            { method: 'POST', path: '/webhook', body: webhook([{ id: 'wamid.A', status: 'failed', timestamp: '1760000000', errors: [{ code: 131026 }] }]) },
            {}, next
        );
        expect(mockedApi.marcarOfertaNoEntregada).toHaveBeenCalledTimes(1);
        expect(mockedApi.marcarOfertaNoEntregada).toHaveBeenCalledWith('wamid.A', '131026');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('sent, delivered y read no llaman al backend', () => {
        const next = jest.fn();
        crearMiddlewareEstadosMeta()(
            { method: 'POST', path: '/webhook', body: webhook([
                { id: 'wamid.B', status: 'sent' }, { id: 'wamid.C', status: 'delivered' }, { id: 'wamid.D', status: 'read' },
            ]) },
            {}, next
        );
        expect(mockedApi.marcarOfertaNoEntregada).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('si el backend falla, el middleware igual llama a next y no lanza', async () => {
        mockedApi.marcarOfertaNoEntregada.mockRejectedValueOnce(new Error('backend caído'));
        const next = jest.fn();
        expect(() => crearMiddlewareEstadosMeta()(
            { method: 'POST', path: '/webhook', body: webhook([{ id: 'wamid.E', status: 'failed' }]) },
            {}, next
        )).not.toThrow();
        await new Promise((r) => setTimeout(r, 10));
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('un cuerpo mal formado o una ruta distinta no llaman al backend y siguen su camino', () => {
        const next = jest.fn();
        const mw = crearMiddlewareEstadosMeta();
        mw({ method: 'POST', path: '/webhook', body: { entry: 'raro' } }, {}, next);
        mw({ method: 'GET', path: '/webhook', body: webhook([{ id: 'wamid.F', status: 'failed' }]) }, {}, next);
        mw({ method: 'POST', path: '/otra', body: webhook([{ id: 'wamid.G', status: 'failed' }]) }, {}, next);
        expect(mockedApi.marcarOfertaNoEntregada).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(3);
    });
});
