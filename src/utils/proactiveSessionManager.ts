// Sistema proactivo de timeout que cierra sesiones automáticamente
//
// Trazabilidad (proyecto-ips/docs/features/2026-09-29-trazabilidad-usuarios.md, 4.3.2 y 11.2): cada
// sesión tiene ahora un `sesionId` (UUID que se crea al abrir o reactivar la sesión), `inicioAt`,
// `ultimoFlujo`, `ultimoPaso`, `mensajes` y `documento`. Todos los cierres emiten `sesion_fin` con su
// motivo (solo con TRAZABILIDAD_V2_ENABLED=true: `trackEvento` no hace nada si está apagado). Los
// campos nuevos son opcionales en `userSessionsDB.json`, así que un archivo con el formato viejo
// ({lastActivity, isActive}) se sigue leyendo sin problema.
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { registrarActividadBot } from '../services/apiService';
import {
  registrarProveedorSesion,
  reiniciarIntentosNoEntendido,
  trackEvento,
  DisparadorSesion,
  MotivoFinSesion,
  InfoSesionTraza,
  ActualizacionSesionTraza,
} from './trazabilidad';
// TBOT-02: toda sesión que termina borra el state de @builderbot del número (ver estadoConversacion.ts).
import { limpiarEstadoConversacion } from './estadoConversacion';

// Ruta del archivo JSON para persistencia de sesiones
const SESSIONS_DB_PATH = path.join(__dirname, 'userSessionsDB.json');

// Configuración del timeout de sesión (1 hora en milisegundos)
const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hora

const META_MESSAGE_LIMIT_MS = 12 * 60 * 60 * 1000; // 12 horas

interface UserSession {
  lastActivity: number;
  isActive: boolean;
  timerId?: NodeJS.Timeout;
  // Trazabilidad (opcionales: el JSON viejo no los trae)
  sesionId?: string;
  inicioAt?: number;
  ultimoFlujo?: string;
  ultimoPaso?: string;
  mensajes?: number;
  documento?: string;
  /** Resultado de negocio alcanzado en la sesión (trackFin). Si existe, el timeout cuenta como 'completado'. */
  finNegocio?: string;
}

type PersistibleSession = Omit<UserSession, 'timerId'>;

let userSessions: Record<string, UserSession> = {};

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
        const session: UserSession = {
          ...(sessionData as any),
          timerId: undefined // Los timers no se pueden persistir
        };
        // Sesión activa del formato viejo (sin id): se le asigna uno para poder cerrarla con sesion_fin.
        if (session.isActive && !session.sesionId) {
          session.sesionId = randomUUID();
          session.inicioAt = session.inicioAt ?? session.lastActivity;
          session.mensajes = session.mensajes ?? 0;
        }
        userSessions[userId] = session;
      }
    } catch {
      userSessions = {};
    }
  }
}

function saveUserSessions() {
  // Guardamos solo los datos persistibles (no los timers)
  const persistibleSessions: Record<string, PersistibleSession> = {};

  for (const [userId, session] of Object.entries(userSessions)) {
    const { timerId, ...persistible } = session;
    persistibleSessions[userId] = persistible;
  }

  fs.writeFileSync(SESSIONS_DB_PATH, JSON.stringify(persistibleSessions), 'utf-8');
}

/** Emite `sesion_fin` para una sesión (llamar ANTES de limpiar sus datos). */
function emitirSesionFin(userId: string, session: UserSession, motivo: MotivoFinSesion): void {
  if (!session.sesionId) return;
  trackEvento({
    tipo_evento: 'sesion_fin',
    telefono: userId,
    sesion_id: session.sesionId,
    documento: session.documento ?? null,
    resultado: motivo,
    flujo: session.ultimoFlujo ?? null,
    paso: session.ultimoPaso ?? null,
    duracion_ms: session.inicioAt ? Date.now() - session.inicioAt : null,
    origen: 'sistema',
    metadata: { mensajes: session.mensajes ?? 0 },
  });
}

/** Motivo de cierre por inactividad: si la sesión ya alcanzó un final de negocio, no es un abandono. */
function motivoPorInactividad(session: UserSession, motivoBase: MotivoFinSesion): MotivoFinSesion {
  return motivoBase === 'timeout' && session.finNegocio ? 'completado' : motivoBase;
}

/**
 * Configura la referencia al bot para enviar mensajes proactivos
 * @param bot - Instancia del bot de BuilderBot
 */
export function setBotInstance(bot: any): void {
  botInstance = bot;
}

/**
 * Cierra una sesión por inactividad. Hoy el cierre es silencioso (el mensaje al paciente está
 * comentado). Registra `chat_abandonado` (legado, ahora con flujo/paso en la cola V2) y `sesion_fin`.
 * @param userId - ID del usuario
 * @param motivo - 'timeout' (timer de 1h) o 'reinicio_bot' (sesión que venció mientras el bot estaba caído)
 */
async function closeSessionProactively(userId: string, motivo: MotivoFinSesion = 'timeout'): Promise<void> {
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
  emitirSesionFin(userId, session, motivoPorInactividad(session, motivo));
  limpiarEstadoConversacion(userId);
  // Sin await: la estadística nunca bloquea (registrarActividadBot ya no espera al backend).
  reiniciarIntentosNoEntendido(userId);
  registrarActividadBot('chat_abandonado', userId, session.finNegocio ? { post_fin: true } : {}, {
    sesion_id: session.sesionId ?? null,
    flujo: session.ultimoFlujo ?? null,
    paso: session.ultimoPaso ?? null,
  }).catch(() => false);

  if (timeSinceLastActivity > META_MESSAGE_LIMIT_MS) {
    console.log(`⚠️ Sesión cerrada sin notificación para ${userId}: han pasado ${Math.floor(timeSinceLastActivity / (60 * 60 * 1000))} horas desde la última actividad (límite: 12h)`);
    return; // No enviar mensaje para evitar penalización de Meta
  }

  // Enviar mensaje de timeout al usuario
  /**if (botInstance) {
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
  }**/
}

/**
 * Actualiza la actividad de un usuario y programa/reprograma su timeout. Si no había una sesión activa
 * (o la que había ya venció), abre una nueva con un `sesionId` nuevo y emite `sesion_inicio`.
 * @param userId - ID del usuario
 * @param disparador - qué abrió la sesión (solo se usa si se abre una nueva)
 */
export function updateUserActivity(userId: string, disparador: DisparadorSesion = 'welcome'): void {
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

  const sigueActiva = !!existingSession
    && existingSession.isActive
    && !!existingSession.sesionId
    && (now - existingSession.lastActivity) <= SESSION_TIMEOUT_MS;

  if (sigueActiva) {
    existingSession.lastActivity = now;
    existingSession.timerId = timerId;
  } else {
    // Una sesión activa que ya venció (timer perdido) se cierra antes de abrir la nueva.
    if (existingSession?.isActive && existingSession.sesionId) {
      emitirSesionFin(userId, existingSession, motivoPorInactividad(existingSession, 'timeout'));
      // Cierre de la sesión vencida: su state no pasa a la nueva. Solo se llega aquí al abrir una sesión
      // (welcome o respuesta a plantilla, antes de cualquier captura), nunca a mitad de un flujo.
      limpiarEstadoConversacion(userId);
    }
    const sesionId = randomUUID();
    userSessions[userId] = {
      lastActivity: now,
      isActive: true,
      timerId,
      sesionId,
      inicioAt: now,
      // El mensaje que abrió la sesión ya pasó por el listener de msg_entrante antes de este punto.
      mensajes: 1,
    };
    trackEvento({
      tipo_evento: 'sesion_inicio',
      telefono: userId,
      sesion_id: sesionId,
      origen: 'sistema',
      metadata: { disparador },
    });
  }

  saveUserSessions();
  //console.log(`🔄 Actividad actualizada para ${userId}. Timer programado para ${new Date(now + SESSION_TIMEOUT_MS).toLocaleString()}`);
}

/** Cómo estaba la sesión antes de `renovarActividadSesion`. */
export type EstadoPrevioSesion = 'activa' | 'sin_sesion' | 'vencida';

/**
 * Renueva la actividad del usuario (reprograma el timer de 1 h) y dice cómo estaba la sesión ANTES:
 * - 'activa': seguía vigente; no se tocó el state.
 * - 'sin_sesion': no había sesión activa (nunca la hubo, o ya la cerró el timer o un fin de flujo, que ya
 *   limpiaron el state); se abrió una nueva.
 * - 'vencida': seguía marcada activa pero pasó más de 1 h (el timer no alcanzó a correr); `updateUserActivity`
 *   la cerró y LIMPIÓ el state antes de abrir la nueva.
 * Con 'sin_sesion'/'vencida' el state que tuviera el flujo en curso ya no está: hay que llamarla ANTES de
 * guardar claves nuevas, nunca después (T-02 del informe QA).
 */
export function renovarActividadSesion(userId: string, disparador: DisparadorSesion = 'keyword'): EstadoPrevioSesion {
  const session = userSessions[userId];
  const previo: EstadoPrevioSesion = !session || !session.isActive
    ? 'sin_sesion'
    : isSessionExpired(userId) ? 'vencida' : 'activa';
  updateUserActivity(userId, disparador);
  return previo;
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
 * Marca una sesión como inactiva/cerrada manualmente y emite `sesion_fin` con el motivo (solo si la
 * sesión seguía activa: cerrar dos veces no duplica el evento).
 * @param userId - ID del usuario
 * @param motivo - motivo real del cierre (default 'completado')
 */
export function closeUserSession(userId: string, motivo: MotivoFinSesion = 'completado'): void {
  reiniciarIntentosNoEntendido(userId);
  const session = userSessions[userId];
  if (session) {
    // Cancelar timer si existe
    if (session.timerId) {
      clearTimeout(session.timerId);
    }

    if (session.isActive) {
      emitirSesionFin(userId, session, motivo);
    }

    session.isActive = false;
    session.timerId = undefined;
    saveUserSessions();
  }
  // Fin de sesión (fin de flujo, "Salir", rate limit, crisis…): la próxima interacción empieza sin el
  // paciente, el documento ni el convenio de esta. Todos los llamadores leen lo que necesitan antes.
  limpiarEstadoConversacion(userId);
}

/**
 * Cierre por inactividad detectado al recibir un mensaje (checkSessionTimeout), cuando el timer no
 * alcanzó a cerrarla. Solo registra `chat_abandonado`/`sesion_fin` si la sesión seguía ACTIVA: si ya la
 * había cerrado el timer (o no había sesión), no se registra nada otra vez (antes se duplicaba).
 * @returns true si la sesión estaba activa y se cerró ahora.
 */
export function expirarSesionPorInactividad(userId: string): boolean {
  const session = userSessions[userId];
  if (!session || !session.isActive) {
    return false;
  }
  if (session.timerId) {
    clearTimeout(session.timerId);
  }
  session.isActive = false;
  session.timerId = undefined;
  saveUserSessions();
  emitirSesionFin(userId, session, motivoPorInactividad(session, 'timeout'));
  limpiarEstadoConversacion(userId);
  reiniciarIntentosNoEntendido(userId);
  registrarActividadBot('chat_abandonado', userId, session.finNegocio ? { post_fin: true } : {}, {
    sesion_id: session.sesionId ?? null,
    flujo: session.ultimoFlujo ?? null,
    paso: session.ultimoPaso ?? null,
  }).catch(() => false);
  return true;
}

/** Datos de trazabilidad de la sesión ACTIVA del usuario, o null. */
export function getSesionInfo(userId: string): InfoSesionTraza | null {
  const session = userSessions[userId];
  if (!session || !session.isActive || !session.sesionId) return null;
  return {
    sesionId: session.sesionId,
    documento: session.documento,
    ultimoFlujo: session.ultimoFlujo,
    ultimoPaso: session.ultimoPaso,
  };
}

/** Actualiza en memoria (sin escribir a disco) los datos de trazabilidad de la sesión activa. */
function actualizarSesionTraza(userId: string, cambios: ActualizacionSesionTraza): void {
  const session = userSessions[userId];
  if (!session || !session.isActive) return;
  if (cambios.ultimoFlujo) session.ultimoFlujo = cambios.ultimoFlujo;
  if (cambios.ultimoPaso) session.ultimoPaso = cambios.ultimoPaso;
  if (cambios.documento) session.documento = cambios.documento;
  if (cambios.limpiarFinNegocio) session.finNegocio = undefined;
  if (cambios.finNegocio) session.finNegocio = cambios.finNegocio;
}

function registrarMensajeSesion(userId: string): void {
  const session = userSessions[userId];
  if (!session || !session.isActive) return;
  session.mensajes = (session.mensajes ?? 0) + 1;
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
          emitirSesionFin(userId, session, 'timeout_12h');
          session.isActive = false;
          session.timerId = undefined;
          limpiarEstadoConversacion(userId);
          expiredUnsafeCount++;
          console.log(`🧹 Sesión ${userId} cerrada silenciosamente: ${Math.floor(timeSinceLastActivity / (60 * 60 * 1000))} horas de inactividad`);
        } else {
          // Menos de 12 horas: venció mientras el bot estaba abajo
          closeSessionProactively(userId, 'reinicio_bot');

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
      closeUserSession(userId, motivoPorInactividad(session, 'timeout'));
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
      emitirSesionFin(userId, session, 'timeout_12h');
      session.isActive = false;
      limpiarEstadoConversacion(userId);
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

// Acceso de src/utils/trazabilidad.ts a la sesión (sin importar este módulo desde allá).
registrarProveedorSesion({
  obtener: (telefono) => getSesionInfo(telefono),
  actualizar: (telefono, cambios) => actualizarSesionTraza(telefono, cambios),
  registrarMensaje: (telefono) => registrarMensajeSesion(telefono),
  cerrar: (telefono, motivo) => closeUserSession(telefono, motivo),
  asegurar: (telefono, disparador) => {
    const session = userSessions[telefono];
    if (!session || !session.isActive || isSessionExpired(telefono)) {
      updateUserActivity(telefono, disparador);
    }
  },
});

// Limpieza de respaldo cada 15 minutos (por si falla algún timer)
setInterval(cleanupExpiredSessions, 15 * 60 * 1000);
