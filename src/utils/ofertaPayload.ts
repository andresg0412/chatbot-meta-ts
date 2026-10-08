// Payload de los botones de la plantilla de oferta de cupo (`cita_disponible_lista_espera`):
// proyecto-ips/docs/features/2026-10-07-lista-espera-aceptacion-y-escalamientos.md, D1 y D1-bis.
//
// Los botones de respuesta rápida de una PLANTILLA llegan como mensaje `type: 'button'`, y ahí
// @builderbot/provider-meta sí conserva `button.payload` en `ctx.payload` (mismo mecanismo ya probado con las
// invitaciones, utils/invitacionPayload.ts). El payload se fija en cada envío, por posición del botón
// (orden confirmado por German en Meta el 2026-10-07):
//   - botón index 0 ("Sí, lo tomo")           → 'LEOFE:<oferta_id>:A'
//   - botón index 1 ("No puedo")              → 'LEOFE:<oferta_id>:R'
//   - botón index 2 ("Hablar con un agente")  → 'LEOFE:<oferta_id>:G' (solo registra la solicitud; la oferta sigue vigente)
// `oferta_id` = 8 alfanuméricos (VARCHAR(8) de generate_short_id()).
//
// El id solo AHORRA el documento: si falta, llega ilegible o el backend no lo reconoce, el flujo cae al camino
// de siempre (pedir el documento). Nunca es un error visible para el paciente.

/** Acción del payload: A = "Sí, lo tomo", R = "No puedo", G = "Hablar con un agente". */
export type AccionPayloadOferta = 'A' | 'R' | 'G';

export const PREFIJO_PAYLOAD_OFERTA = 'LEOFE';

/** Formato exacto del contrato. Sin `trim` ni mayúsculas/minúsculas: lo genera el bot. */
export const REGEX_PAYLOAD_OFERTA = /^LEOFE:([A-Za-z0-9]{8}):([ARG])$/;

export interface PayloadOferta {
    ofertaId: string;
    accion: AccionPayloadOferta;
}

/** ¿El id tiene el formato del contrato? (si no, no se manda el payload y la plantilla sale como siempre). */
export function esOfertaIdValido(ofertaId: unknown): ofertaId is string {
    return typeof ofertaId === 'string' && /^[A-Za-z0-9]{8}$/.test(ofertaId);
}

/** 'LEOFE:<id>:A|R|G'. Lanza si el id no tiene el formato del contrato. */
export function construirPayloadOferta(ofertaId: string, accion: AccionPayloadOferta): string {
    const payload = `${PREFIJO_PAYLOAD_OFERTA}:${ofertaId}:${accion}`;
    if (!REGEX_PAYLOAD_OFERTA.test(payload)) {
        throw new Error('oferta_id con formato inválido para el payload de la plantilla');
    }
    return payload;
}

/** `ctx.payload` → `{ ofertaId, accion }`, o null si no viene o no cumple el formato. */
export function parsearPayloadOferta(payload: unknown): PayloadOferta | null {
    if (typeof payload !== 'string') return null;
    const match = REGEX_PAYLOAD_OFERTA.exec(payload);
    if (!match) return null;
    return { ofertaId: match[1], accion: match[2] as AccionPayloadOferta };
}

/**
 * Por qué se cayó al camino con documento. Se registra en la trazabilidad para ver, con datos, si Meta deja
 * de mandar el id en algún tipo de teléfono o versión de WhatsApp.
 */
export type MotivoFallbackOferta =
    | 'flag_apagado'
    | 'sin_payload'
    | 'payload_invalido'
    | 'oferta_no_encontrada'
    | 'celular_distinto'
    | 'varias_ofertas'
    | 'error_backend';
