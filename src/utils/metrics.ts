import fs from 'fs';
import path from 'path';

const METRICS_PATH = path.join(__dirname, 'metricsDB.json');

// Estructura por defecto
const defaultMetrics = {
  conversaciones_iniciadas: 0,
  usuarios_unicos: [],
  usuarios_recurrentes: [],
  flujo_reagendar_finalizados: 0,
  flujo_cancelar_finalizados: 0,
  flujo_agente_finalizados: 0,
  citas_reagendadas: 0,
  citas_canceladas: 0,
  errores: []
};

function loadMetrics() {
  if (fs.existsSync(METRICS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(METRICS_PATH, 'utf-8'));
    } catch {
      return { ...defaultMetrics };
    }
  }
  return { ...defaultMetrics };
}

function saveMetrics(metrics: any) {
  fs.writeFileSync(METRICS_PATH, JSON.stringify(metrics, null, 2), 'utf-8');
}

const metrics = loadMetrics();

export function metricConversationStarted(userId: string) {
  metrics.conversaciones_iniciadas++;
  if (!metrics.usuarios_unicos.includes(userId)) {
    metrics.usuarios_unicos.push(userId);
  } else if (!metrics.usuarios_recurrentes.includes(userId)) {
    metrics.usuarios_recurrentes.push(userId);
  }
  saveMetrics(metrics);
}

export function metricFlujoFinalizado(tipo: 'reagendar'|'cancelar'|'agente'|'agendar') {
  if (tipo === 'reagendar') metrics.flujo_reagendar_finalizados++;
  if (tipo === 'cancelar') metrics.flujo_cancelar_finalizados++;
  if (tipo === 'agente') metrics.flujo_agente_finalizados++;
  saveMetrics(metrics);
}

export function metricCita(tipo: 'reagendada'|'cancelada'|'agendada') {
  if (tipo === 'reagendada') metrics.citas_reagendadas++;
  if (tipo === 'cancelada') metrics.citas_canceladas++;
  if (tipo === 'agendada') metrics.citas_agendadas++;
  saveMetrics(metrics);
}

export function metricError(error: any, userId?: string) {
  metrics.errores.push({
    error: typeof error === 'string' ? error : (error?.message || 'Error desconocido'),
    userId,
    fecha: new Date().toISOString()
  });
  saveMetrics(metrics);
}

export function getMetrics() {
  return metrics;
}
