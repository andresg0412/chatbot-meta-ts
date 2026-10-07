import { indiceHoraEscrita } from '../seleccionNumerica';
import { construirMensajeHorasDisponibles, construirMensajeFechasDisponibles } from '../construirMensajeSalida';

const citas = (...horas: string[]) => horas.map(horacita => ({ horacita, profesional: 'Profesional' }));

it.each([
    ['8:40am', ['08:40', '14:20'], 0], ['2:20 pm', ['08:40', '14:20'], 1],
    ['2:20', ['14:20'], 0], ['2:20', ['02:20', '14:20'], null],
    ['8:40am', ['08:40', '08:40'], null], ['25:20', ['01:20'], null],
    ['8:60am', ['08:00'], null], ['quiero 8:40am', ['08:40'], null],
    ['12:00 am', ['00:00', '12:00'], 0], ['12:00 pm', ['00:00', '12:00'], 1],
    ['08:40', ['08:40:00'], 0], ['3', ['03:00'], null], ['7 p. m.', ['19:00'], 0],
])('hora escrita %s en %j -> %s', (texto, horas, esperado) => {
    expect(indiceHoraEscrita(texto as string, citas(...horas as string[]))).toBe(esperado);
});

it('segunda página de siete horas muestra 6 y 7; no inventa Ver más al finalizar', () => {
    const todas = citas('08:00', '08:40', '09:20', '10:00', '10:40', '11:20', '12:00');
    expect(construirMensajeHorasDisponibles(todas.slice(5), 7, 7, 'Horas:', 5))
        .toBe('Horas:\n*6*. 11:20 - Profesional\n*7*. 12:00 - Profesional\n');
    expect(construirMensajeHorasDisponibles(todas.slice(0, 5), 7, 5, 'Horas:')).toContain('*6*. Ver más');
    expect(construirMensajeFechasDisponibles(['d4', 'd5', 'd6'], 7, 6, 'Fechas:', 3))
        .toBe('Fechas:\n*4*. d4\n*5*. d5\n*6*. d6\n*7*. Ver más\n');
});
