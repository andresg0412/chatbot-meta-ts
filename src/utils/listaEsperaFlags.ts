// Interruptores (feature flags) de "lista de espera inteligente" y del protocolo de crisis.
// Ver proyecto-ips/docs/features/2026-09-26-lista-espera-runbook-produccion.md, sección 2.1.
//
// Todos se leen de process.env en cada llamada (no se cachean), igual que los interruptores que ya
// existían (LISTA_ESPERA_CASCADA_ENABLED, RECORDATORIOS_BOTONES_ENABLED). Cualquier cambio en .env
// exige `pm2 restart bot-meta --update-env`. Default seguro: todo apagado salvo que valga 'true'.

import { claveComparacionTelefono } from './telefono';

/** Cascada de ofertas de cupo: si es false, el poller solo observa (no envía ofertas, avisos ni pausas). */
export function isCascadaEnabled(): boolean {
    return process.env.LISTA_ESPERA_CASCADA_ENABLED === 'true';
}

/** Pregunta de inscripción a lista de espera al terminar de agendar (Fase 1). */
export function isListaEsperaOptinEnabled(): boolean {
    return process.env.LISTA_ESPERA_OPTIN_ENABLED === 'true';
}

/** Interceptor del protocolo de crisis (src/utils/crisisProtocol.ts). */
export function isCrisisProtocolEnabled(): boolean {
    return process.env.CRISIS_PROTOCOL_ENABLED === 'true';
}

/** Recordatorios con botones (Fase 3). */
export function isRecordatoriosBotonesEnabled(): boolean {
    return process.env.RECORDATORIOS_BOTONES_ENABLED === 'true';
}

/** Payloads de confirmación de recordatorios; apagado por defecto hasta validar los índices en Meta. */
export function isRecordatoriosPayloadEnabled(): boolean {
    return process.env.RECORDATORIOS_PAYLOAD_ENABLED === 'true';
}

/**
 * Campañas de invitación a la lista de espera (regularización y continua), ver
 * proyecto-ips/docs/features/2026-10-04-campanas-invitacion-lista-espera-implementacion.md, 6.2/6.5.
 * Apagado: los dos endpoints de campaña responden `{estado:'deshabilitada'}` sin llamar al backend
 * (salvo la previsualización, que es de solo lectura). Los flujos de respuesta a los botones siempre
 * están registrados (si no se envió ninguna plantilla, nadie toca esos botones).
 */
export function isInvitacionListaEsperaEnabled(): boolean {
    return process.env.LISTA_ESPERA_INVITACION_ENABLED === 'true';
}

/**
 * Lista piloto `LISTA_ESPERA_TELEFONOS_PILOTO` (separada por comas, formato 57XXXXXXXXXX o 10
 * dígitos). Devuelve las claves de comparación (últimos 10 dígitos). Vacía = sin restricción.
 */
export function obtenerTelefonosPiloto(): string[] {
    const raw = process.env.LISTA_ESPERA_TELEFONOS_PILOTO ?? '';
    return raw
        .split(',')
        .map((valor) => claveComparacionTelefono(valor.trim()))
        .filter((valor): valor is string => !!valor);
}

export function hayListaPiloto(): boolean {
    return obtenerTelefonosPiloto().length > 0;
}

/**
 * true si el teléfono puede recibir lo nuevo de lista de espera / recordatorios con botones:
 * - sin lista piloto configurada → siempre true (sin restricción);
 * - con lista piloto → solo si el número (comparado por sus últimos 10 dígitos) está en la lista.
 */
export function esTelefonoPiloto(telefono: unknown): boolean {
    const piloto = obtenerTelefonosPiloto();
    if (piloto.length === 0) return true;
    const clave = claveComparacionTelefono(telefono);
    return !!clave && piloto.includes(clave);
}
