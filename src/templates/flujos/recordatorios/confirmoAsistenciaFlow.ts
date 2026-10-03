// Respuesta al botón "Confirmo asistencia" de los recordatorios con botones (Fase 3 de "lista de
// espera inteligente" — Funcionalidad 1; TB-05 del informe QA 2026-10-02). La lógica, compartida con
// "Necesito cancelar" y "No podré asistir", vive en ./respuestaRecordatorioComun.ts: documento →
// citas del paciente (lista si hay varias) → confirmación directa de la cita elegida, con `cita_id`.

import { FLUJOS_ENTRADA, FLUJOS_ACCION } from './respuestaRecordatorioComun';

const confirmoAsistenciaFlow = FLUJOS_ENTRADA.confirmo;
const confirmoAsistenciaAccionFlow = FLUJOS_ACCION.confirmo;

export { confirmoAsistenciaFlow, confirmoAsistenciaAccionFlow };
