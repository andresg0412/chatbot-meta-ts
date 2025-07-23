// Constantes de horario laboral
export const WORKING_HOURS = {
  workDays: [1, 2, 3, 4, 5], // Lunes a Viernes
  start: 8, // 8 AM
  end: 18,  // 6 PM
};

/**
 * Verifica si el momento actual está dentro del horario laboral.
 * @returns {boolean} true si está en horario laboral, false si no.
 */
export function isWorkingHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado

  if (!WORKING_HOURS.workDays.includes(day)) {
    return false;
  }
  return hour >= WORKING_HOURS.start && hour < WORKING_HOURS.end;
}
