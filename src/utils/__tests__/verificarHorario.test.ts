import { isWorkingHours } from '../verificarHorario';

describe('isWorkingHours: limites vigentes 07:00-19:00 Bogota', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it.each([
    ['domingo', '2026-10-04T10:00:00-05:00', false],
    ['dia laboral', '2026-10-06T09:00:00-05:00', true],
    ['antes de abrir', '2026-10-06T06:59:00-05:00', false],
    ['al abrir', '2026-10-06T07:00:00-05:00', true],
    ['antes de cerrar', '2026-10-06T18:59:00-05:00', true],
    ['al cerrar', '2026-10-06T19:00:00-05:00', false],
    ['fuera del horario', '2026-10-06T20:00:00-05:00', false],
  ])('%s', (_caso, instante, esperado) => {
    jest.setSystemTime(new Date(instante));
    expect(isWorkingHours()).toBe(esperado);
  });
});
