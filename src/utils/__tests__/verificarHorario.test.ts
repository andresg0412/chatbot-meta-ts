const RealDate = Date;

import { isWorkingHours, WORKING_HOURS } from '../verificarHorario';

describe('isWorkingHours', () => {
  it('debe retornar false en fin de semana', () => {
    const realDate = Date;
    global.Date = class extends Date {
      constructor() {
        super();
        return new realDate('2025-06-01T10:00:00'); // Domingo
      }
    } as any;
    expect(isWorkingHours()).toBe(false);
    global.Date = realDate;
  });

  it('debe retornar true en horario laboral', () => {
    const realDate = Date;
    global.Date = class extends Date {
      constructor() {
        super();
        return new realDate('2025-06-03T09:00:00'); // Martes 9am
      }
    } as any;
    expect(isWorkingHours()).toBe(true);
    global.Date = realDate;
  });

  it('debe retornar false fuera de horario laboral', () => {
    const realDate = Date;
    global.Date = class extends Date {
      constructor() {
        super();
        return new realDate('2025-06-03T20:00:00'); // Martes 8pm
      }
    } as any;
    expect(isWorkingHours()).toBe(false);
    global.Date = realDate;
  });

  it('debe retornar false si es un día laboral pero antes del horario', () => {
    global.Date = class extends RealDate {
      constructor() {
        super();
        return new RealDate('2025-06-03T07:00:00'); // Martes 7am
      }
    } as any;
    expect(isWorkingHours()).toBe(false);
  });

  it('debe retornar false si es un día laboral pero justo al final del horario', () => {
    global.Date = class extends RealDate {
      constructor() {
        super();
        return new RealDate('2025-06-03T18:00:00'); // Martes 6pm
      }
    } as any;
    expect(isWorkingHours()).toBe(false);
  });

  it('debe retornar true si es justo al inicio del horario', () => {
    global.Date = class extends RealDate {
      constructor() {
        super();
        return new RealDate('2025-06-03T08:00:00'); // Martes 8am
      }
    } as any;
    expect(isWorkingHours()).toBe(true);
  });
});
