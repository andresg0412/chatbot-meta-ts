import { clasificarEntradaCaptura } from '../flujos/filtroCaptura';

describe('clasificarEntradaCaptura', () => {
    it.each(['Salir', ' salir. ', 'EXIT!'])('clasifica salida: %s', (texto) => {
        expect(clasificarEntradaCaptura(texto).tipo).toBe('salir');
    });

    it.each([
        '_event_voice_note__0f3c1234',
        '_event_media__abc',
        '_event_location__abc',
    ])('clasifica multimedia: %s', (texto) => {
        expect(clasificarEntradaCaptura(texto).tipo).toBe('multimedia');
    });

    it.each(['280525005', 'Sí, lo tomo', 'No puedo', 'Confirmo asistencia'])(
        'deja pasar botones/ids globales: %s', (texto) => {
            expect(clasificarEntradaCaptura(texto).tipo).toBe('dejar_pasar');
        }
    );

    it.each(['3', '14:20', 'hola'])('deja que la captura procese: %s', (texto) => {
        expect(clasificarEntradaCaptura(texto).tipo).toBe('seguir');
    });
});
