// Constantes de horario laboral
export const WORKING_HOURS = {
  workDays: [1, 2, 3, 4, 5], // Lunes a Viernes
  start: 7, // 7 AM
  end: 19,  // 7 PM
};

/**
 * Verifica si el momento actual está dentro del horario laboral.
 * @returns {boolean} true si está en horario laboral, false si no.
 */
export function isWorkingHours(): boolean {
  const now = new Date();
  // Convertir hora actual a la zona horaria de Colombia
  const bogotaTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }));

  const hour = bogotaTime.getHours();
  const day = bogotaTime.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  console.log("Hora actual en Bogotá:", hour);
  console.log("Día actual en Bogotá:", day);

  if (!WORKING_HOURS.workDays.includes(day)) {
    return false;
  }
  return hour >= WORKING_HOURS.start && hour < WORKING_HOURS.end;
}
