// Respuesta al botón "No podré asistir" del recordatorio de 2h (job `daily`) — Fase 3 de "lista de
// espera inteligente"; TB-05 y TBOT-03 del informe QA 2026-10-02. Mismo recorrido que "Necesito
// cancelar" (./respuestaRecordatorioComun.ts); solo cambia el botón de origen en la trazabilidad.
//
// Importante (15.8): cancelar es real (Globho + BD) y dispara la detección de cupo liberado de Fase 2.

import { FLUJOS_ENTRADA, FLUJOS_ACCION } from './respuestaRecordatorioComun';

const noPodreAsistirFlow = FLUJOS_ENTRADA.no_podre_asistir;
const noPodreAsistirAccionFlow = FLUJOS_ACCION.no_podre_asistir;

export { noPodreAsistirFlow, noPodreAsistirAccionFlow };
