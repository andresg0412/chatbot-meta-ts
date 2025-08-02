// Sistema proactivo de timeout que cierra sesiones automáticamente
import fs from 'fs';
import path from 'path';

// Ruta del archivo JSON para persistencia de sesiones
const SESSIONS_DB_PATH = path.join(__dirname, 'userSessionsDB.json');

// Configuración del timeout de sesión (1 hora en milisegundos)
const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hora

const META_MESSAGE_LIMIT_MS = 12 * 60 * 60 * 1000; // 12 horas


// Estructura: { [userId]: { lastActivity: number, isActive: boolean, timerId?: NodeJS.Timeout } }
let userSessions: Record<string, { 
  lastActivity: number, 
  isActive: boolean, 
  timerId?: NodeJS.Timeout 
}> = {};

// Referencia al bot para enviar mensajes proactivos
let botInstance: any = null;

function loadUserSessions() {
  if (fs.existsSync(SESSIONS_DB_PATH)) {
    try {
      const data = fs.readFileSync(SESSIONS_DB_PATH, 'utf-8');
      const sessions = JSON.parse(data) || {};
      
      // Al cargar, no recuperamos los timers (se perdieron al reiniciar)
      // Solo cargamos los datos de sesión
      for (const [userId, sessionData] of Object.entries(sessions)) {
        userSessions[userId] = {
          ...(sessionData as any),
          timerId: undefined // Los timers no se pueden persistir
        };
      }
    } catch {
      userSessions = {};
    }
  }
}

function saveUserSessions() {
  // Guardamos solo los datos persistibles (no los timers)
  const persistibleSessions: Record<string, { lastActivity: number, isActive: boolean }> = {};
  
  for (const [userId, session] of Object.entries(userSessions)) {
    persistibleSessions[userId] = {
      lastActivity: session.lastActivity,
      isActive: session.isActive
    };
  }
  
  fs.writeFileSync(SESSIONS_DB_PATH, JSON.stringify(persistibleSessions), 'utf-8');
}

/**
 * Configura la referencia al bot para enviar mensajes proactivos
 * @param bot - Instancia del bot de BuilderBot
 */
export function setBotInstance(bot: any): void {
  botInstance = bot;
}

/**
 * Cierra una sesión proactivamente enviando mensaje al usuario
 * * SOLO si han pasado menos de 12 horas desde la última actividad
 * @param userId - ID del usuario
 */
async function closeSessionProactively(userId: string): Promise<void> {
  const session = userSessions[userId];
  if (!session || !session.isActive) {
    return; // La sesión ya fue cerrada
  }

  // Verificar si han pasado más de 12 horas desde la última actividad
  const now = Date.now();
  const timeSinceLastActivity = now - session.lastActivity;

  // Marcar sesión como inactiva
  session.isActive = false;
  session.timerId = undefined;
  saveUserSessions();

  if (timeSinceLastActivity > META_MESSAGE_LIMIT_MS) {
    console.log(`⚠️ Sesión cerrada sin notificación para ${userId}: han pasado ${Math.floor(timeSinceLastActivity / (60 * 60 * 1000))} horas desde la última actividad (límite: 12h)`);
    return; // No enviar mensaje para evitar penalización de Meta
  }

  // Enviar mensaje de timeout al usuario
  if (botInstance) {
    try {
      const timeoutMessage = 
        '⏰ Tu sesión ha expirado por inactividad de más de 1 hora.\n\n' +
        '🌟 Agradecemos tu preferencia. Nuestra misión es orientarte en cada momento de tu vida.\n\n' +
        'Recuerda que cuando lo desees puedes escribir *"hola"* para iniciar una nueva conversación.';
      
      await botInstance.sendMessage(userId, timeoutMessage);
      //console.log(`✅ Sesión cerrada proactivamente para usuario: ${userId}`);
    } catch (error) {
      console.error(`❌ Error enviando mensaje de timeout a ${userId}:`, error);
    }
  }
}

/**
 * Actualiza la actividad de un usuario y programa/reprograma su timeout
 * @param userId - ID del usuario
 */
export function updateUserActivity(userId: string): void {
  const now = Date.now();
  const existingSession = userSessions[userId];

  // Cancelar timer existente si existe
  if (existingSession?.timerId) {
    clearTimeout(existingSession.timerId);
  }

  // Programar nuevo timer para cerrar sesión en 1 hora
  const timerId = setTimeout(() => {
    closeSessionProactively(userId);
  }, SESSION_TIMEOUT_MS);

  // Actualizar sesión
  userSessions[userId] = {
    lastActivity: now,
    isActive: true,
    timerId: timerId
  };

  saveUserSessions();
  //console.log(`🔄 Actividad actualizada para ${userId}. Timer programado para ${new Date(now + SESSION_TIMEOUT_MS).toLocaleString()}`);
}

/**
 * Verifica si la sesión de un usuario ha expirado por inactividad
 * @param userId - ID del usuario
 * @returns true si la sesión ha expirado, false si sigue activa
 */
export function isSessionExpired(userId: string): boolean {
  const userSession = userSessions[userId];
  
  if (!userSession || !userSession.isActive) {
    return true; // No hay sesión activa, consideramos expirada
  }
  
  const now = Date.now();
  const timeSinceLastActivity = now - userSession.lastActivity;
  
  return timeSinceLastActivity > SESSION_TIMEOUT_MS;
}

/**
 * Marca una sesión como inactiva/cerrada manualmente
 * @param userId - ID del usuario
 */
export function closeUserSession(userId: string): void {
  const session = userSessions[userId];
  if (session) {
    // Cancelar timer si existe
    if (session.timerId) {
      clearTimeout(session.timerId);
    }
    
    session.isActive = false;
    session.timerId = undefined;
    saveUserSessions();
  }
}

/**
 * Obtiene el tiempo restante de sesión en minutos
 * @param userId - ID del usuario
 * @returns minutos restantes o 0 si no hay sesión activa
 */
export function getRemainingSessionTime(userId: string): number {
  const userSession = userSessions[userId];
  
  if (!userSession || !userSession.isActive) {
    return 0;
  }
  
  const now = Date.now();
  const timeSinceLastActivity = now - userSession.lastActivity;
  const remainingTime = SESSION_TIMEOUT_MS - timeSinceLastActivity;
  
  return Math.max(0, Math.ceil(remainingTime / (60 * 1000))); // en minutos
}

/**
 * Restaura timers para sesiones activas después de reiniciar el bot
 * Esta función debe llamarse al inicializar el bot
 */
export function restoreActiveTimers(): void {
  const now = Date.now();
  let restoredCount = 0;
  let expiredSafeCount = 0;
  let expiredUnsafeCount = 0;
  
  for (const [userId, session] of Object.entries(userSessions)) {
    if (session.isActive) {
      const timeSinceLastActivity = now - session.lastActivity;
      
      if (timeSinceLastActivity >= SESSION_TIMEOUT_MS) {
        // La sesión ya debería haber expirado, cerrarla inmediatamente
        if (timeSinceLastActivity > META_MESSAGE_LIMIT_MS) {
          // Más de 12 horas: cerrar sin enviar mensaje
          session.isActive = false;
          session.timerId = undefined;
          expiredUnsafeCount++;
          console.log(`🧹 Sesión ${userId} cerrada silenciosamente: ${Math.floor(timeSinceLastActivity / (60 * 60 * 1000))} horas de inactividad`);
        } else {
          // Menos de 12 horas: cerrar con mensaje
          closeSessionProactively(userId);
          expiredSafeCount++;
        }
      } else {
        // Reprogramar timer para el tiempo restante
        const remainingTime = SESSION_TIMEOUT_MS - timeSinceLastActivity;
        const timerId = setTimeout(() => {
          closeSessionProactively(userId);
        }, remainingTime);
        
        session.timerId = timerId;
        restoredCount++;
      }
    }
  }
  if (expiredUnsafeCount > 0) {
    saveUserSessions();
  }
  
  console.log(`🔄 Timers restaurados para ${restoredCount} sesiones activas`);
}

/**
 * Limpia sesiones expiradas del sistema (mantener para compatibilidad)
 */
export function cleanupExpiredSessions(): void {
  const now = Date.now();
  let hasChanges = false;
  
  for (const userId in userSessions) {
    const session = userSessions[userId];
    if (session.isActive && (now - session.lastActivity) > SESSION_TIMEOUT_MS) {
      closeUserSession(userId);
      hasChanges = true;
    }
  }
  
  if (hasChanges) {
    console.log('🧹 Sesiones expiradas limpiadas');
  }
}

export function cleanupOldSessionsWithoutNotification(): void {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const userId in userSessions) {
    const session = userSessions[userId];
    const timeSinceLastActivity = now - session.lastActivity;
    
    // Si han pasado más de 12 horas, marcar como inactiva sin enviar mensaje
    if (session.isActive && timeSinceLastActivity > META_MESSAGE_LIMIT_MS) {
      session.isActive = false;
      if (session.timerId) {
        clearTimeout(session.timerId);
        session.timerId = undefined;
      }
      cleanedCount++;
      console.log(`🧹 Sesión limpiada silenciosamente: ${userId} (${Math.floor(timeSinceLastActivity / (60 * 60 * 1000))} horas)`);
    }
  }
  
  if (cleanedCount > 0) {
    saveUserSessions();
    console.log(`🧹 ${cleanedCount} sesiones antiguas limpiadas sin notificación para evitar alertas de Meta`);
  }
}

/**
 * Obtiene estadísticas de sesiones activas
 */
export function getActiveSessionsCount(): number {
  return Object.values(userSessions).filter(session => session.isActive).length;
}

// Inicializar al cargar el módulo
loadUserSessions();

// Limpieza de respaldo cada 15 minutos (por si falla algún timer)
setInterval(cleanupExpiredSessions, 15 * 60 * 1000);
