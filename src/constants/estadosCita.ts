// Estados de `agenda.estado_agenda` que el paciente puede gestionar (cancelar/reprogramar) desde el bot.
// Literales exactos del backend (mayúscula inicial, sin variantes): no normalizar mayúsculas, así valores
// sucios como 'PROGRAMADA' o estados cerrados ('Cancelado', 'Reprogramar', 'Anulado', 'Asistio',
// 'No Asistio') nunca se listan. Ver proyecto-ips/docs/features/2026-09-27-cancelar-reprogramar-confirmadas.md.
export const ESTADOS_CITA_GESTIONABLE = ['Pendiente', 'Confirmado'] as const;

export type EstadoCitaGestionable = (typeof ESTADOS_CITA_GESTIONABLE)[number];

export function esEstadoCitaGestionable(estado: unknown): estado is EstadoCitaGestionable {
    return (ESTADOS_CITA_GESTIONABLE as readonly string[]).includes(estado as string);
}
