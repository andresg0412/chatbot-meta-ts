// Payload de los botones de la oferta de cupo (D1/D1-bis de proyecto-ips/docs/features/
// 2026-10-07-lista-espera-aceptacion-y-escalamientos.md) y mensajes de la confirmación de un toque.
import {
    construirPayloadOferta,
    esOfertaIdValido,
    parsearPayloadOferta,
    REGEX_PAYLOAD_OFERTA,
} from '../ofertaPayload';
import { mensajeConfirmarOferta, minutosParaMostrar, BOTONES_CONFIRMAR_OFERTA, BOTONES_POST_RECHAZO } from '../mensajesOfertaCupo';
import { esBotonDeOtraPlantilla } from '../../templates/flujos/palabrasGlobales';

describe('construirPayloadOferta / parsearPayloadOferta', () => {
    it.each(['A', 'R', 'G'] as const)('ida y vuelta para la acción %s', (accion) => {
        const payload = construirPayloadOferta('AB12cd34', accion);
        expect(payload).toBe(`LEOFE:AB12cd34:${accion}`);
        expect(parsearPayloadOferta(payload)).toEqual({ ofertaId: 'AB12cd34', accion });
    });

    it('rechaza ids con formato inválido al construir (no se envía nada)', () => {
        for (const id of ['', 'corto', 'demasiado1', 'AB12-d34', 'AB12 d34']) {
            expect(() => construirPayloadOferta(id, 'A')).toThrow();
        }
    });

    it('parsear devuelve null para todo lo que no cumple el contrato exacto', () => {
        for (const crudo of [undefined, null, 42, {}, '', 'LEOFE:AB12cd34', 'LEOFE:AB12cd34:X', 'LEOFE:AB12cd34:a',
            'leofe:AB12cd34:A', ' LEOFE:AB12cd34:A', 'LEOFE:AB12cd34:A ', 'LEINV:AB12cd34:A', 'LEREC:AB12cd34:C', 'LEOFE:AB12cd3:A']) {
            expect(parsearPayloadOferta(crudo)).toBeNull();
        }
    });

    it('no se confunde con los payloads de invitaciones ni de recordatorios', () => {
        expect(REGEX_PAYLOAD_OFERTA.test('LEINV:AB12cd34:A')).toBe(false);
        expect(REGEX_PAYLOAD_OFERTA.test('LEREC:AB12cd34:C')).toBe(false);
    });

    it('esOfertaIdValido', () => {
        expect(esOfertaIdValido('AB12cd34')).toBe(true);
        expect(esOfertaIdValido('AB12cd3')).toBe(false);
        expect(esOfertaIdValido(undefined)).toBe(false);
        expect(esOfertaIdValido(12345678)).toBe(false);
    });
});

describe('mensajes de la confirmación de un toque', () => {
    const cupo = { profesional: 'Ana Pérez', fecha_cita: '2026-10-20', hora_cita: '09:00:00' };

    it('lleva profesional, fecha larga, hora HH:MM, el aviso de que se libera la cita actual y los 10 minutos', () => {
        const texto = mensajeConfirmarOferta(cupo, 10);
        expect(texto).toContain('20 de octubre de 2026');
        expect(texto).toContain('09:00');
        expect(texto).not.toContain('09:00:00');
        expect(texto).toContain('con Ana Pérez');
        expect(texto).toContain('tu cita actual quedará liberada para otra persona');
        expect(texto).toContain('Tienes 10 minutos para confirmar');
    });

    it('nunca menciona la especialidad ni palabras clínicas', () => {
        expect(mensajeConfirmarOferta(cupo, 10)).not.toMatch(/psicolog|terapia|sesi[oó]n|psiquiatr/i);
    });

    it('sin profesional no deja un "con" colgando', () => {
        expect(mensajeConfirmarOferta({ ...cupo, profesional: null }, 10)).not.toMatch(/ con \./);
    });

    it.each([
        [10, 10], [25, 10], [9.9, 9], [4, 4], [1, 1], [0.4, 1], [0, 10], [-3, 10],
        [undefined, 10], [null, 10], ['abc', 10],
    ])('minutosParaMostrar(%p) = %p (tope 10, nunca promete de más; sin dato = 10)', (entrada, esperado) => {
        expect(minutosParaMostrar(entrada)).toBe(esperado);
    });

    it('singular con un solo minuto', () => {
        expect(mensajeConfirmarOferta(cupo, 1)).toContain('Tienes 1 minuto para confirmar');
    });

    it('los botones de sesión caben en el límite de WhatsApp (20 caracteres)', () => {
        for (const boton of [...BOTONES_CONFIRMAR_OFERTA, ...BOTONES_POST_RECHAZO]) {
            expect(boton.body.length).toBeLessThanOrEqual(20);
        }
    });
});

describe('palabras globales: los botones de confirmación ceden el paso en cualquier captura', () => {
    it.each(['Sí, adelantar', 'No, dejar así', ' Sí, adelantar '])('"%s" es un botón de otra plantilla', (texto) => {
        expect(esBotonDeOtraPlantilla(texto)).toBe(true);
    });
    it('un texto parecido pero distinto no lo es', () => {
        expect(esBotonDeOtraPlantilla('quiero adelantar mi cita')).toBe(false);
    });
});
