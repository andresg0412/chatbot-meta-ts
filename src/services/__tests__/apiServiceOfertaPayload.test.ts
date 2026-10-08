// D1 de proyecto-ips/docs/features/2026-10-07-lista-espera-aceptacion-y-escalamientos.md: la plantilla de oferta de
// cupo lleva el id de la oferta en el payload de sus tres botones SOLO con LISTA_ESPERA_OFERTA_PAYLOAD_ENABLED y un
// id con el formato del contrato; en cualquier otro caso sale EXACTAMENTE como antes (axios simulado: no se llama a Meta).
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

import axios from 'axios';
import {
    enviarPlantillaOfertaCupo,
    registrarIntencionOfertaCupo,
    responderOfertaCupoSinDocumento,
    registrarSolicitudAgenteOfertaCupo,
    registrarDecisionPostRechazoOfertaCupo,
    reservarRecordatoriosInvitaciones,
} from '../apiService';

const post = (axios as any).post as jest.Mock;
const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ENV_ORIGINAL, numberId: 'NUM', jwtToken: 'TOKEN', NOMBRE_PLANTILLA_OFERTA_CUPO: 'cita_disponible_lista_espera' };
    delete process.env.LISTA_ESPERA_OFERTA_PAYLOAD_ENABLED;
    post.mockImplementation(async (url: string) => {
        if (url.includes('graph.facebook.com')) return { status: 200, data: { messages: [{ id: 'wamid.1', message_status: 'accepted' }] } };
        return { status: 200, data: { code: 200, data: {} } };
    });
});
afterAll(() => {
    process.env = ENV_ORIGINAL;
});

const enviar = (ofertaId?: string) =>
    enviarPlantillaOfertaCupo('Ana', '573001234567', 'Profesional X', '2026-10-20', '09:00:00', 30, ofertaId);
const componentes = () => post.mock.calls[0][1].template.components as any[];

describe('enviarPlantillaOfertaCupo: payload de los botones', () => {
    it('apagado (default): sin componentes de botón, idéntico a antes', async () => {
        await enviar('OFER0001');
        expect(componentes()).toHaveLength(1);
        expect(componentes()[0].type).toBe('body');
        expect(componentes()[0].parameters).toHaveLength(5);
    });

    it('encendido con un id válido: tres botones por posición con A, R y G', async () => {
        process.env.LISTA_ESPERA_OFERTA_PAYLOAD_ENABLED = 'true';
        await enviar('OFER0001');

        const botones = componentes().filter((c) => c.type === 'button');
        expect(botones).toEqual([
            { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'LEOFE:OFER0001:A' }] },
            { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: 'LEOFE:OFER0001:R' }] },
            { type: 'button', sub_type: 'quick_reply', index: '2', parameters: [{ type: 'payload', payload: 'LEOFE:OFER0001:G' }] },
        ]);
        // El cuerpo (5 variables, orden y contenido) no cambia.
        expect(componentes()[0].parameters.map((p: any) => p.text)).toEqual(['Ana', 'Profesional X', '20 de octubre de 2026', '09:00', '30']);
    });

    it.each([undefined, '', 'corto', 'demasiado1', 'AB-12345'])('encendido pero con un id inválido (%p): sale sin payload, no falla', async (id) => {
        process.env.LISTA_ESPERA_OFERTA_PAYLOAD_ENABLED = 'true';
        const resultado = await enviar(id as any);
        expect(resultado.exito).toBe(true);
        expect(componentes().filter((c) => c.type === 'button')).toHaveLength(0);
    });

    it('no menciona la especialidad en ningún parámetro', async () => {
        process.env.LISTA_ESPERA_OFERTA_PAYLOAD_ENABLED = 'true';
        await enviar('OFER0001');
        expect(JSON.stringify(post.mock.calls[0][1])).not.toMatch(/psicolog|terapia|sesi[oó]n/i);
    });
});

describe('llamadas nuevas al backend', () => {
    it('registrarIntencionOfertaCupo: con id lo manda; sin id el cuerpo es el de siempre', async () => {
        post.mockResolvedValue({ data: { data: { estado: 'vigente' } } });
        await registrarIntencionOfertaCupo('573001234567', 'acepta', 'OFER0001');
        expect(post.mock.calls[0][1]).toEqual({ celular: '573001234567', respuesta: 'acepta', oferta_id: 'OFER0001' });
        await registrarIntencionOfertaCupo('573001234567', 'acepta');
        expect(post.mock.calls[1][1]).toEqual({ celular: '573001234567', respuesta: 'acepta' });
    });

    it('registrarIntencionOfertaCupo devuelve { ok: false } ante un error de red (nunca lanza)', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        post.mockRejectedValue(new Error('timeout'));
        await expect(registrarIntencionOfertaCupo('573001234567', 'acepta', 'OFER0001')).resolves.toEqual({ ok: false });
    });

    it('responderOfertaCupoSinDocumento: sin documento, con o sin oferta_id', async () => {
        post.mockResolvedValue({ status: 200, data: { code: 200, data: { registrado: true } } });
        await responderOfertaCupoSinDocumento('573001234567', 'rechaza', 'OFER0001');
        expect(post.mock.calls[0][1]).toEqual({ celular: '573001234567', respuesta: 'rechaza', oferta_id: 'OFER0001' });
        await responderOfertaCupoSinDocumento('573001234567', 'acepta');
        expect(post.mock.calls[1][1]).toEqual({ celular: '573001234567', respuesta: 'acepta' });
    });

    it('responderOfertaCupoSinDocumento conserva el status y el cause de un error HTTP', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        post.mockRejectedValue({ response: { status: 409, data: { cause: 'OFERTA_AMBIGUA' } } });
        await expect(responderOfertaCupoSinDocumento('573001234567', 'acepta')).resolves.toMatchObject({ ok: false, code: 409, cause: 'OFERTA_AMBIGUA' });
    });

    it('registrarSolicitudAgenteOfertaCupo: true si se registró, false (sin lanzar) si falla', async () => {
        post.mockResolvedValueOnce({ data: { data: { registrado: true } } });
        await expect(registrarSolicitudAgenteOfertaCupo('OFER0001', '573001234567')).resolves.toBe(true);
        expect(post.mock.calls[0][1]).toEqual({ oferta_id: 'OFER0001', celular: '573001234567' });
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        post.mockRejectedValueOnce(new Error('caído'));
        await expect(registrarSolicitudAgenteOfertaCupo('OFER0001', '573001234567')).resolves.toBe(false);
    });

    it('registrarDecisionPostRechazoOfertaCupo', async () => {
        post.mockResolvedValueOnce({ data: { data: { estado: 'retirada' } } });
        await expect(registrarDecisionPostRechazoOfertaCupo('LE000001', '573001234567', 'sale')).resolves.toEqual({ ok: true, data: { estado: 'retirada' } });
        expect(post.mock.calls[0][1]).toEqual({ lista_espera_id: 'LE000001', celular: '573001234567', decision: 'sale' });
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        post.mockRejectedValueOnce(new Error('caído'));
        await expect(registrarDecisionPostRechazoOfertaCupo('LE000001', '573001234567', 'sigue')).resolves.toEqual({ ok: false });
    });

    it('reservarRecordatoriosInvitaciones llama al endpoint de recordatorios', async () => {
        post.mockResolvedValueOnce({ status: 200, data: { code: 200, data: { invitaciones: [], motivo_fin: 'sin_candidatas' } } });
        const r = await reservarRecordatoriosInvitaciones({ campana_tipo: 'regularizacion', lote: 10, solo_telefonos: [] });
        expect(post.mock.calls[0][0]).toContain('/listaespera/invitaciones/reservar-recordatorios');
        expect(post.mock.calls[0][1]).toEqual({ campana_tipo: 'regularizacion', lote: 10, solo_telefonos: [] });
        expect(r.ok).toBe(true);
    });
});
