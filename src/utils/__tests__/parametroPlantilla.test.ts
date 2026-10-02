import { limpiarParametroPlantilla } from '../parametroPlantilla';

describe('limpiarParametroPlantilla', () => {
    it('quita el tabulador final y el doble espacio (caso real del 2026-10-01)', () => {
        expect(limpiarParametroPlantilla('MARIANA  LOPEZ PEREZ\t')).toBe('MARIANA LOPEZ PEREZ');
    });

    it('reemplaza saltos de línea y secuencias largas de espacios', () => {
        expect(limpiarParametroPlantilla('Juan\nPérez     Gómez\r\n')).toBe('Juan Pérez Gómez');
    });

    it('deja intacto un texto limpio', () => {
        expect(limpiarParametroPlantilla('jueves, 10 de octubre')).toBe('jueves, 10 de octubre');
    });

    it('envía "-" si el valor es vacío, nulo o solo espacios', () => {
        expect(limpiarParametroPlantilla('')).toBe('-');
        expect(limpiarParametroPlantilla(null)).toBe('-');
        expect(limpiarParametroPlantilla(undefined)).toBe('-');
        expect(limpiarParametroPlantilla(' \t ')).toBe('-');
    });

    it('convierte números a texto', () => {
        expect(limpiarParametroPlantilla(15)).toBe('15');
    });
});
