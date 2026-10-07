import { construirPayloadRecordatorio, parsearPayloadRecordatorio } from '../recordatorioPayload';

describe('payload de recordatorio', () => {
    it.each([
        ['C', 'LEREC:A1B2C3D4:C'],
        ['X', 'LEREC:A1B2C3D4:X'],
        ['N', 'LEREC:A1B2C3D4:N'],
    ] as const)('construye y lee acción %s', (accion, payload) => {
        expect(construirPayloadRecordatorio('A1B2C3D4', accion)).toBe(payload);
        expect(parsearPayloadRecordatorio(payload)).toEqual({ citaId: 'A1B2C3D4', accion });
    });

    it.each([null, undefined, 'LEREC:A1:C', 'LEREC:A1B2C3D4:A', 'OTRO:A1B2C3D4:C'])(
        'ignora payload ilegible: %p',
        (payload) => expect(parsearPayloadRecordatorio(payload)).toBeNull(),
    );

    it('no construye un payload con id que no tenga ocho caracteres alfanuméricos', () => {
        expect(() => construirPayloadRecordatorio('A1', 'C')).toThrow();
    });
});
