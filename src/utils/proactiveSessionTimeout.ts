// Middleware actualizado para manejar timeouts proactivos
import {
  isSessionExpired,
  updateUserActivity,
  closeUserSession,
  expirarSesionPorInactividad,
  getRemainingSessionTime
} from './proactiveSessionManager';
import { trackPaso, ResultadoPaso } from './trazabilidad';
import type { PasoId } from '../constants/pasosTrazabilidad';

/** Paso del catálogo de trazabilidad que se registra (`flujo_paso`) si la sesión es válida. */
export interface TrazaPaso {
  paso: PasoId;
  /** Flujo en curso; si se omite se usa el del catálogo (o el de la sesión para los pasos `comun.*`). */
  flujo?: string;
  resultado?: ResultadoPaso;
}

/**
 * Middleware que verifica si una sesión ha expirado y actualiza actividad
 * @param userId - ID del usuario
 * @param flowDynamic - Función para enviar mensajes dinámicos (opcional para compatibilidad)
 * @param endFlow - Función para terminar el flujo (opcional para compatibilidad)
 * @param traza - Paso del catálogo de trazabilidad (opcional): si la sesión es válida emite `flujo_paso`
 *   y actualiza el último flujo/paso de la sesión.
 * @returns true si la sesión es válida, false si ha expirado
 */
export async function checkSessionTimeout(
  userId: string,
  flowDynamic?: (message: string) => Promise<void>,
  endFlow?: () => any,
  traza?: TrazaPaso
): Promise<boolean> {

  // Verificar si la sesión ha expirado
  if (isSessionExpired(userId)) {
    // Si la sesión seguía activa (el timer no alcanzó a cerrarla) se cierra y se registra el abandono
    // una sola vez. Si ya estaba cerrada (por el timer o porque nunca hubo sesión) no se registra nada:
    // antes se emitía `chat_abandonado` otra vez aquí (doble conteo).
    if (typeof expirarSesionPorInactividad === 'function') {
      expirarSesionPorInactividad(userId);
    } else {
      closeUserSession(userId);
    }

    // Para compatibilidad con el sistema anterior, enviar mensaje si se proporciona flowDynamic
    // (aunque normalmente el mensaje ya se envió proactivamente)
    //if (flowDynamic) {
    //  await flowDynamic(
    //    '⏰ Tu sesión ha expirado por inactividad.\n\n' +
    //    'Para continuar, escribe *"hola"* para iniciar una nueva conversación.'
    //  );
    //}

    return false; // Sesión expirada
  }

  // La sesión es válida, actualizar actividad (esto programa/reprograma el timer automático)
  updateUserActivity(userId);
  if (traza) {
    trackPaso(userId, traza.paso, traza.resultado ?? 'mostrado', traza.flujo ? { flujo: traza.flujo } : undefined);
  }
  return true; // Sesión válida
}

/**
 * Función helper para obtener tiempo restante de sesión
 * @param userId - ID del usuario
 * @returns string con el tiempo restante formateado
 */
export function getFormattedRemainingTime(userId: string): string {
  const minutes = getRemainingSessionTime(userId);

  if (minutes === 0) {
    return 'Sesión inactiva';
  }

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  return `${minutes}m`;
}

/**
 * Función para cerrar una sesión manualmente (útil para testing o casos especiales)
 * @param userId - ID del usuario
 */
export function forceCloseSession(userId: string): void {
  closeUserSession(userId);
}
