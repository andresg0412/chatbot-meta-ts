import { leerNumeroOpcion, pareceHora } from '../seleccionNumerica';

describe('leerNumeroOpcion', () => {
    it.each([
        ['2', 2], [' 2. ', 2], ['2)', 2], ['12', 12],
        ['2:20', null], ['2 pm', null], ['123', null], ['2 por favor', null],
    ])('%p -> %p', (texto, esperado) => {
        expect(leerNumeroOpcion(texto)).toBe(esperado);
    });
});

describe('pareceHora', () => {
    it.each(['8:40am', '8.40', '3 pm', '10am'])('reconoce %s', (texto) => {
        expect(pareceHora(texto)).toBe(true);
    });
    it('no confunde una opcion simple', () => expect(pareceHora('2')).toBe(false));
});
