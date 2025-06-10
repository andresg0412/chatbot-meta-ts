// Controla los intentos/mensajes por usuario en un archivo JSON
import { USER_SECURITY_LIMITS } from './securityLimits';
import fs from 'fs';
import path from 'path';

// Ruta del archivo JSON para persistencia
const DB_PATH = path.join(__dirname, 'userAttemptsDB.json');

// Estructura: { [userId]: { count: number, last: number, blockedUntil: number|null } }
let userAttempts: Record<string, { count: number, last: number, blockedUntil: number|null }> = {};
let lastResetDay: string = '';

function loadUserAttempts() {
  if (fs.existsSync(DB_PATH)) {
    try {
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      userAttempts = parsed.userAttempts || {};
      lastResetDay = parsed.lastResetDay || '';
    } catch {
      userAttempts = {};
      lastResetDay = '';
    }
  }
}

function saveUserAttempts() {
  fs.writeFileSync(DB_PATH, JSON.stringify({ userAttempts, lastResetDay }), 'utf-8');
}

function resetIfNewDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (lastResetDay !== today) {
    userAttempts = {};
    lastResetDay = today;
    saveUserAttempts();
  }
}

// Inicializa al cargar el módulo
loadUserAttempts();
resetIfNewDay();

export function checkAndRegisterUserAttempt(userId: string): { allowed: boolean, remaining: number, blockedUntil?: number } {
  resetIfNewDay();
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const blockMs = USER_SECURITY_LIMITS.BLOCK_TIME_MINUTES * 60 * 1000;
  if (!userAttempts[userId]) {
    userAttempts[userId] = { count: 1, last: now, blockedUntil: null };
    saveUserAttempts();
    return { allowed: true, remaining: USER_SECURITY_LIMITS.MAX_ATTEMPTS_PER_HOUR - 1 };
  }
  const user = userAttempts[userId];
  // Si está bloqueado
  if (user.blockedUntil && now < user.blockedUntil) {
    return { allowed: false, remaining: 0, blockedUntil: user.blockedUntil };
  }
  // Si pasó más de 1 hora, reinicia
  if (now - user.last > hourMs) {
    user.count = 1;
    user.last = now;
    user.blockedUntil = null;
    saveUserAttempts();
    return { allowed: true, remaining: USER_SECURITY_LIMITS.MAX_ATTEMPTS_PER_HOUR - 1 };
  }
  user.count++;
  user.last = now;
  if (user.count > USER_SECURITY_LIMITS.MAX_ATTEMPTS_PER_HOUR) {
    user.blockedUntil = now + blockMs;
    saveUserAttempts();
    return { allowed: false, remaining: 0, blockedUntil: user.blockedUntil };
  }
  saveUserAttempts();
  return { allowed: true, remaining: USER_SECURITY_LIMITS.MAX_ATTEMPTS_PER_HOUR - user.count };
}
