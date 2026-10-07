jest.mock('../verificarHorario', () => ({ isWorkingHours: jest.fn(() => true) }));
jest.mock('../proactiveSessionManager', () => ({ closeUserSession: jest.fn() }));
jest.mock('../trazabilidad', () => ({ trackFin: jest.fn() }));

import { derivarAAsesorSinOpciones } from '../derivarAsesor';
import { closeUserSession } from '../proactiveSessionManager';
import { trackFin } from '../trazabilidad';

describe('derivarAAsesorSinOpciones', () => {
    const original = process.env.NUMERO_ASESOR_HUMANO;

    afterEach(() => {
        jest.clearAllMocks();
        if (original === undefined) delete process.env.NUMERO_ASESOR_HUMANO;
        else process.env.NUMERO_ASESOR_HUMANO = original;
    });

    it('usa mensaje neutral y privado para un catálogo que requiere asesor', async () => {
        process.env.NUMERO_ASESOR_HUMANO = '573000000000';
        const flowDynamic = jest.fn(async (_mensaje: string) => undefined);

        await derivarAAsesorSinOpciones({ from: '573001234567' }, flowDynamic, {
            flujo: 'reprogramar', paso: 'reprogramar.fechas', motivo: 'catalogo_solo_asesor',
        });

        expect(flowDynamic).toHaveBeenCalledTimes(1);
        const mensaje = flowDynamic.mock.calls[0][0];
        expect(mensaje).toBe(
            'Para mover esta cita, un asesor te ayudará directamente:\n' +
            '👉 https://wa.me/573000000000?text=Hola,%20deseo%20hablar%20con%20una%20asistente.'
        );
        expect(mensaje).not.toMatch(/no encontramos|horarios disponibles|crisis|especialidad|servicio|terapia/i);
        expect(trackFin).toHaveBeenCalledWith('573001234567', 'reprogramar', 'derivado_agente', {
            paso: 'reprogramar.fechas', metadata: { motivo: 'catalogo_solo_asesor' },
        });
        expect(closeUserSession).toHaveBeenCalledWith('573001234567', 'completado');
    });
});
