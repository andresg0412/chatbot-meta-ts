// Payload de los botones de la plantilla de invitación a la lista de espera ('LEINV:<id>:A|R'):
// proyecto-ips/docs/features/2026-10-04-campanas-invitacion-lista-espera-implementacion.md, 4.1 y 6.6.
import {
    construirPayloadInvitacion,
    parsearPayloadInvitacion,
    anotarCampanaDeInvitacion,
    campanaDeInvitacion,
    _limpiarCampanasAnotadasParaPruebas,
} from '../invitacionPayload';

describe('parsearPayloadInvitacion', () => {
    it.each([
        ['LEINV:I1J2K3L4:A', { invitacionId: 'I1J2K3L4', accion: 'A' }],
        ['LEINV:abcd1234:R', { invitacionId: 'abcd1234', accion: 'R' }],
    ])('"%s" → %j', (payload, esperado) => {
        expect(parsearPayloadInvitacion(payload)).toEqual(esperado);
    });

    it.each([
        undefined,
        null,
        '',
        123,
        'LEINV:I1J2K3L4',
        'LEINV:I1J2K3L4:X',
        'LEINV:I1J2K3L4:a',
        'LEINV:I1J2K3:A', // 6 caracteres
        'LEINV:I1J2K3L4M:A', // 9 caracteres
        'LEINV:I1J2-3L4:A',
        'leinv:I1J2K3L4:A',
        ' LEINV:I1J2K3L4:A',
        'LEINV:I1J2K3L4:A ',
        'LEINV:I1J2K3L4:A:extra',
        'CONFIRMAR_CITA',
        'Sí, quiero recibir avisos',
    ])('%j → null (cae al fallback por documento)', (payload) => {
        expect(parsearPayloadInvitacion(payload)).toBeNull();
    });
});

describe('construirPayloadInvitacion', () => {
    it('arma el payload de aceptar y rechazar y es reversible', () => {
        expect(construirPayloadInvitacion('I1J2K3L4', 'A')).toBe('LEINV:I1J2K3L4:A');
        expect(construirPayloadInvitacion('I1J2K3L4', 'R')).toBe('LEINV:I1J2K3L4:R');
        expect(parsearPayloadInvitacion(construirPayloadInvitacion('Zz9Yy8Xx', 'R'))).toEqual({ invitacionId: 'Zz9Yy8Xx', accion: 'R' });
    });

    it('lanza con un id fuera de formato (no se envía un payload inválido)', () => {
        expect(() => construirPayloadInvitacion('corto', 'A')).toThrow();
        expect(() => construirPayloadInvitacion('I1J2K3L4:A', 'A')).toThrow();
    });
});

describe('campaña de origen de cada invitación (trazabilidad)', () => {
    beforeEach(() => _limpiarCampanasAnotadasParaPruebas());

    it('devuelve la campaña anotada o null si no se conoce', () => {
        anotarCampanaDeInvitacion('I1J2K3L4', 'le_invit_reg');
        expect(campanaDeInvitacion('I1J2K3L4')).toBe('le_invit_reg');
        expect(campanaDeInvitacion('OTRA0000')).toBeNull();
        expect(campanaDeInvitacion(undefined)).toBeNull();
    });
});
