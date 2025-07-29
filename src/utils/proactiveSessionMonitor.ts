// Monitor mejorado para el sistema proactivo de sesiones
import fs from 'fs';
import path from 'path';
import { getActiveSessionsCount } from './proactiveSessionManager';

const SESSIONS_DB_PATH = path.join(__dirname, 'userSessionsDB.json');

interface SessionData {
  lastActivity: number;
  isActive: boolean;
}

interface SessionsDB {
  [userId: string]: SessionData;
}

/**
 * Obtiene estadísticas detalladas de las sesiones
 */
export function getProactiveSessionStats() {
  if (!fs.existsSync(SESSIONS_DB_PATH)) {
    return {
      totalSessions: 0,
      activeSessions: 0,
      expiredSessions: 0,
      activeTimers: 0,
      sessions: []
    };
  }

  try {
    const data = fs.readFileSync(SESSIONS_DB_PATH, 'utf-8');
    const sessions: SessionsDB = JSON.parse(data) || {};
    
    const now = Date.now();
    const hourMs = 60 * 60 * 1000; // 1 hora
    
    let activeSessions = 0;
    let expiredSessions = 0;
    const sessionDetails = [];
    
    for (const [userId, sessionData] of Object.entries(sessions)) {
      const timeSinceLastActivity = now - sessionData.lastActivity;
      const isExpired = timeSinceLastActivity > hourMs;
      const willExpireIn = Math.max(0, hourMs - timeSinceLastActivity);
      
      if (sessionData.isActive && !isExpired) {
        activeSessions++;
      } else {
        expiredSessions++;
      }
      
      sessionDetails.push({
        userId,
        isActive: sessionData.isActive && !isExpired,
        lastActivity: new Date(sessionData.lastActivity).toLocaleString(),
        minutesInactive: Math.floor(timeSinceLastActivity / (60 * 1000)),
        willExpireIn: Math.ceil(willExpireIn / (60 * 1000)), // minutos hasta expirar
        status: sessionData.isActive && !isExpired ? 'Activa' : 'Expirada/Inactiva',
        hasProactiveTimer: sessionData.isActive && !isExpired ? '✅ Timer programado' : '❌ Sin timer'
      });
    }
    
    return {
      totalSessions: Object.keys(sessions).length,
      activeSessions,
      expiredSessions,
      activeTimers: getActiveSessionsCount(),
      sessions: sessionDetails
    };
    
  } catch (error) {
    console.error('Error leyendo sesiones:', error);
    return {
      totalSessions: 0,
      activeSessions: 0,
      expiredSessions: 0,
      activeTimers: 0,
      sessions: []
    };
  }
}

/**
 * Muestra un reporte detallado del sistema proactivo
 */
export function printProactiveSessionReport() {
  const stats = getProactiveSessionStats();
  
  console.log('\n🚀 REPORTE DE SESIONES PROACTIVAS');
  console.log('===================================');
  console.log(`📊 Total de sesiones registradas: ${stats.totalSessions}`);
  console.log(`✅ Sesiones activas: ${stats.activeSessions}`);
  console.log(`🎯 Timers activos programados: ${stats.activeTimers}`);
  console.log(`❌ Sesiones expiradas/inactivas: ${stats.expiredSessions}`);
  console.log('\n⚡ VENTAJAS DEL SISTEMA PROACTIVO:');
  console.log('- ✅ Cierre automático después de 1 hora de inactividad');
  console.log('- ✅ Mensaje de timeout enviado proactivamente');
  console.log('- ✅ No consume recursos indefinidamente');
  console.log('- ✅ Timers se reprograman con cada actividad');
  
  console.log('\n📋 DETALLE DE SESIONES:');
  
  if (stats.sessions.length === 0) {
    console.log('No hay sesiones registradas.');
  } else {
    stats.sessions.forEach((session, index) => {
      console.log(`\n${index + 1}. Usuario: ${session.userId}`);
      console.log(`   Estado: ${session.status}`);
      console.log(`   Timer: ${session.hasProactiveTimer}`);
      console.log(`   Última actividad: ${session.lastActivity}`);
      console.log(`   Tiempo inactivo: ${session.minutesInactive} minutos`);
      if (session.isActive) {
        console.log(`   ⏰ Expirará automáticamente en: ${session.willExpireIn} minutos`);
      }
    });
  }
  
  console.log('\n===================================');
  console.log('💡 El sistema envía mensajes de timeout automáticamente');
  console.log('🔧 Para ver timers en tiempo real, usa: npm run sessions:watch');
  console.log('===================================\n');
}

/**
 * Función para mostrar estadísticas en tiempo real
 */
export function watchSessions() {
  console.log('👀 Monitoreando sesiones en tiempo real (Ctrl+C para salir)...\n');
  
  const showStats = () => {
    console.clear();
    printProactiveSessionReport();
  };
  
  // Mostrar inmediatamente
  showStats();
  
  // Actualizar cada 30 segundos
  const interval = setInterval(showStats, 30000);
  
  // Limpiar en exit
  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('\n👋 Monitor detenido');
    process.exit(0);
  });
}

// Si se ejecuta directamente, mostrar reporte
if (require.main === module) {
  const arg = process.argv[2];
  if (arg === 'watch') {
    watchSessions();
  } else {
    printProactiveSessionReport();
  }
}
