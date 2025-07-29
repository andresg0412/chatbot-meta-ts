// Middleware actualizado para manejar timeouts proactivos
import { 
  isSessionExpired, 
  updateUserActivity, 
  closeUserSession,
  getRemainingSessionTime 
} from './proactiveSessionManager';

/**
 * Middleware que verifica si una sesión ha expirado y actualiza actividad
 * @param userId - ID del usuario
 * @param flowDynamic - Función para enviar mensajes dinámicos (opcional para compatibilidad)
 * @param endFlow - Función para terminar el flujo (opcional para compatibilidad)
 * @returns true si la sesión es válida, false si ha expirado
 */
export async function checkSessionTimeout(
  userId: string, 
  flowDynamic?: (message: string) => Promise<void>,
  endFlow?: () => any
): Promise<boolean> {
  
  // Verificar si la sesión ha expirado
  if (isSessionExpired(userId)) {
    // Marcar como cerrada (el mensaje ya fue enviado proactivamente)
    closeUserSession(userId);
    
    // Para compatibilidad con el sistema anterior, enviar mensaje si se proporciona flowDynamic
    // (aunque normalmente el mensaje ya se envió proactivamente)
    if (flowDynamic) {
      await flowDynamic(
        '⏰ Tu sesión ha expirado por inactividad.\n\n' +
        'Para continuar, escribe *"hola"* para iniciar una nueva conversación.'
      );
    }
    
    return false; // Sesión expirada
  }
  
  // La sesión es válida, actualizar actividad (esto programa/reprograma el timer automático)
  updateUserActivity(userId);
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
