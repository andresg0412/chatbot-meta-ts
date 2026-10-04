// Payload de los botones de la plantilla de invitación a la lista de espera:
// proyecto-ips/docs/features/2026-10-04-campanas-invitacion-lista-espera-implementacion.md, 4.1 y 6.6.
//
// Los botones de respuesta rápida de una PLANTILLA llegan como mensaje `type: 'button'`, y ahí
// @builderbot/provider-meta sí conserva `button.payload` en `ctx.payload` (a diferencia de `context.id`
// en los mensajes `interactive`, que descarta). El payload se fija en cada envío:
//   - botón index 0 ("Sí, quiero recibir avisos") → 'LEINV:<invitacion_id>:A'
//   - botón index 1 ("No, gracias")               → 'LEINV:<invitacion_id>:R'
// `invitacion_id` = 8 alfanuméricos (VARCHAR(8) de generate_short_id()).
//
// Nunca se ha verificado en producción que `ctx.payload` llegue (prueba T-P2). Si no llega, o llega
// ilegible, el flujo cae al fallback por documento (por-documento + lista).

import type { CampanaTraza } from './trazabilidad';

export type AccionInvitacion = 'A' | 'R';

export const PREFIJO_PAYLOAD_INVITACION = 'LEINV';

/** Formato exacto del contrato. Sin `trim` ni mayúsculas/minúsculas: lo genera el bot. */
export const REGEX_PAYLOAD_INVITACION = /^LEINV:([A-Za-z0-9]{8}):([AR])$/;

export interface PayloadInvitacion {
    invitacionId: string;
    accion: AccionInvitacion;
}

/** 'LEINV:<id>:A' | 'LEINV:<id>:R'. Lanza si el id no tiene el formato del contrato (no se envía nada). */
export function construirPayloadInvitacion(invitacionId: string, accion: AccionInvitacion): string {
    const payload = `${PREFIJO_PAYLOAD_INVITACION}:${invitacionId}:${accion}`;
    if (!REGEX_PAYLOAD_INVITACION.test(payload)) {
        throw new Error('invitacion_id con formato inválido para el payload de la plantilla');
    }
    return payload;
}

/** `ctx.payload` → `{ invitacionId, accion }`, o null si no viene o no cumple el formato. */
export function parsearPayloadInvitacion(payload: unknown): PayloadInvitacion | null {
    if (typeof payload !== 'string') return null;
    const match = REGEX_PAYLOAD_INVITACION.exec(payload);
    if (!match) return null;
    return { invitacionId: match[1], accion: match[2] as AccionInvitacion };
}

// ---------------------------------------------------------------------------
// Campaña de origen de cada invitación (solo para la trazabilidad de la respuesta).
//
// `campana_respuesta` con `campana: null` el backend lo atribuye a los recordatorios (reminder/execute/
// daily, chat-stats.service.ts). Para no marcar como respondido un recordatorio cuando el paciente
// responde una invitación, el ejecutor anota aquí la campaña de cada invitación que envía, y el flujo de
// respuesta la busca por el `invitacion_id` del payload. Es memoria del proceso (PM2 fork): tras un
// reinicio, o en el fallback sin payload, no se conoce y se manda null (lo que permite el contrato).
// ---------------------------------------------------------------------------

const MAX_CAMPANAS_ANOTADAS = 5000;
const campanaPorInvitacion = new Map<string, CampanaTraza>();

export function anotarCampanaDeInvitacion(invitacionId: string, campana: CampanaTraza): void {
    if (!invitacionId) return;
    if (campanaPorInvitacion.size >= MAX_CAMPANAS_ANOTADAS) {
        // Se descarta la más antigua (orden de inserción del Map).
        const primera = campanaPorInvitacion.keys().next().value;
        if (primera !== undefined) campanaPorInvitacion.delete(primera);
    }
    campanaPorInvitacion.set(invitacionId, campana);
}

export function campanaDeInvitacion(invitacionId: unknown): CampanaTraza | null {
    if (typeof invitacionId !== 'string') return null;
    return campanaPorInvitacion.get(invitacionId) ?? null;
}

/** Solo para pruebas. */
export function _limpiarCampanasAnotadasParaPruebas(): void {
    campanaPorInvitacion.clear();
}
