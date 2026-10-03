// Respuesta al botón "Necesito cancelar" de los recordatorios con botones (48h/24h) — Fase 3 de
// "lista de espera inteligente"; TB-05 y TBOT-03 del informe QA 2026-10-02. La lógica, compartida con
// los otros dos botones, vive en ./respuestaRecordatorioComun.ts: documento → citas del paciente
// (lista si hay varias) → se muestra la cita y se pide "Sí, cancelar" / "No, mantener" → solo con "Sí"
// se cancela esa cita (`cita_id`).
//
// Importante (15.8): cancelar es real (Globho + BD) y dispara la detección de cupo liberado de Fase 2.

import { FLUJOS_ENTRADA, FLUJOS_ACCION } from './respuestaRecordatorioComun';

const necesitoCancelarFlow = FLUJOS_ENTRADA.necesito_cancelar;
const necesitoCancelarAccionFlow = FLUJOS_ACCION.necesito_cancelar;

export { necesitoCancelarFlow, necesitoCancelarAccionFlow };
