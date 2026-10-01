// Protocolo de crisis — interceptor transversal (Fase 1 de "lista de espera inteligente").
// Ver proyecto-ips/docs/features/2026-09-07-lista-espera-inteligente.md, sección 7 y 9 (pregunta 3).
//
// Detección por palabras clave (MVP explícitamente aceptado como punto de partida — no es NLP,
// tiene huecos conocidos de falsos negativos/positivos; ver pregunta abierta 3 del documento de
// análisis, pendiente de validar con el cliente si esto es suficiente o se requiere algo más robusto).
//
// Mecanismo de corte de flujo: se registra este interceptor directamente sobre el EventEmitter del
// provider (`adapterProvider.on('message', ...)`) ANTES de que `createBot()` registre su propio
// listener interno (`handleMsg`). Como Node invoca los listeners de un mismo evento en el orden en
// que se registraron, este interceptor corre primero para cada mensaje entrante. Si detecta contenido
// de riesgo, agrega el número a `bot.dynamicBlacklist` (el mismo mecanismo ya expuesto hoy por
// POST /v1/blacklist) de forma SÍNCRONA (antes de cualquier `await`) — así, cuando el listener interno
// del framework corre justo después y hace `if (this.dynamicBlacklist.checkIf(from)) return;`
// (ver node_modules/@builderbot/bot/dist/index.cjs, función handleMsg), el mensaje actual YA no se
// procesa ni por el flujo en curso ni por ningún flujo nuevo. Esto corta el flujo automático sin
// necesidad de forkear/parchear el framework.
//
// El desbloqueo del número (tras la intervención humana) se hace hoy con el endpoint que ya existe:
// POST /v1/blacklist { number, intent: 'remove' }.

import { registrarActividadBot } from '../services/apiService';
import { isCrisisProtocolEnabled } from './listaEsperaFlags';
import { registrarBloqueoPorCrisis } from './crisisBlacklistStore';
import { enviarAvisoAsesor } from './avisoAsesor';
import { enmascararTelefono } from './telefono';
import { cerrarSesionTraza } from './trazabilidad';

/**
 * Palabras/frases que sugieren ideación suicida, autolesión o crisis aguda.
 * Deliberadamente amplio (prioriza no dejar pasar un caso real sobre evitar falsos positivos) —
 * un falso positivo solo implica que un humano revisa una conversación que no lo necesitaba;
 * un falso negativo aquí es el escenario que este protocolo existe para evitar.
 */
const CRISIS_KEYWORDS: RegExp[] = [
  /suicid/i,
  /quitarme\s+la\s+vida/i,
  /quitarse\s+la\s+vida/i,
  /matarme/i,
  /me\s+quiero\s+morir/i,
  /quiero\s+morir/i,
  /no\s+quiero\s+vivir/i,
  /no\s+quiero\s+seguir\s+viviendo/i,
  /acabar\s+con\s+mi\s+vida/i,
  /terminar\s+con\s+(mi|esta)\s+vida/i,
  /hacerme\s+da[nñ]o/i,
  /lastimarme/i,
  /autolesi[oó]n/i,
  /cortarme/i,
  /ya\s+no\s+aguanto\s+m[aá]s/i,
  /no\s+vale\s+la\s+pena\s+vivir/i,
  /quiero\s+desaparecer/i,
  /no\s+quiero\s+existir/i,
  /mejor\s+estar[ií]a\s+muert[oa]/i
];

export function containsCrisisContent(text: unknown): boolean {
  if (!text || typeof text !== 'string') return false;
  return CRISIS_KEYWORDS.some((re) => re.test(text));
}

interface CrisisCapableBot {
  dynamicBlacklist?: {
    add: (numbers: string | string[]) => any;
    checkIf?: (number: string) => boolean;
  };
}

type SendRawMessage = (to: string, message: string) => Promise<any>;

/**
 * Crea el listener a registrar en `adapterProvider.on('message', ...)`.
 * `getBot` es un accessor perezoso porque el interceptor se registra ANTES de que exista la
 * instancia del bot (createBot() todavía no ha corrido en ese punto de app.ts) — mismo patrón de
 * "referencia diferida" que ya usa proactiveSessionManager.ts (setBotInstance/botInstance).
 */
export function createCrisisInterceptor(getBot: () => CrisisCapableBot | undefined, sendRaw: SendRawMessage) {
  return function crisisInterceptor(ctx: any): void {
    try {
      // Runbook B4: interruptor CRISIS_PROTOCOL_ENABLED (default false). Apagado, el interceptor no
      // hace nada (ni detecta, ni bloquea, ni envía, ni registra).
      if (!isCrisisProtocolEnabled()) {
        return;
      }

      const from: string | undefined = ctx?.from;
      const body: string | undefined = ctx?.body;

      if (!from || !body || !containsCrisisContent(body)) {
        return;
      }

      // --- Tramo síncrono: debe ejecutarse ANTES de cualquier `await` de esta función ---
      const bot = getBot();
      if (bot?.dynamicBlacklist) {
        bot.dynamicBlacklist.add(from);
      } else {
        console.error('[crisisProtocol] No hay instancia de bot disponible todavía; no se pudo bloquear el flujo automático para', from);
      }
      // --- Fin del tramo síncrono ---

      // Trazabilidad: la sesión termina por crisis (`sesion_fin{crisis}`; solo con TRAZABILIDAD_V2_ENABLED).
      cerrarSesionTraza(from, 'crisis');

      // Runbook B8: persistir el bloqueo para que sobreviva a un `pm2 restart` (se restaura al
      // arrancar en app.ts). Se hace después del tramo síncrono; si falla solo se loguea.
      try {
        registrarBloqueoPorCrisis(from);
      } catch (persistError) {
        console.error('[crisisProtocol] No se pudo persistir el bloqueo por crisis:', persistError);
      }

      console.error(`[crisisProtocol] Contenido de riesgo detectado para ${from}. Flujo automático bloqueado (blacklist). Requiere intervención humana y liberar el número luego vía POST /v1/blacklist {intent:'remove'}.`);

      // Mensaje de contención al usuario. No usa "psicología"/"terapia"/"sesión" (regla de privacidad
      // transversal, ver MEMORY.md sección 9 / bot-flow-developer.md sección 1).
      sendRaw(
        from,
        'Gracias por escribirnos. Lo que compartes es muy importante y queremos que recibas ayuda de una persona lo antes posible. ' +
        'Un miembro de nuestro equipo se va a poner en contacto contigo muy pronto.\n\n' +
        'Si sientes que estás en peligro inmediato, por favor comunícate ya con la Línea 123 o con la Línea de Salud Mental 106, disponibles las 24 horas.'
      ).catch((err) => console.error('[crisisProtocol] Error enviando mensaje de contención al usuario:', err));

      // Escalamiento a un humano. Canal PLACEHOLDER (env CANAL_ESCALAMIENTO_CRISIS) — pendiente de
      // definir con el cliente cuál debe ser el canal real (ver pregunta 3 del documento de análisis).
      const canalEscalamiento = process.env.CANAL_ESCALAMIENTO_CRISIS;
      if (canalEscalamiento) {
        // No se incluye el texto original del mensaje del paciente: es contenido potencialmente
        // clínico/sensible y este mensaje viaja por WhatsApp (persistido por Meta e ilegible en este
        // proceso una vez enviado) — el único lugar aceptable para el texto crudo es el console.error
        // de depuración de esta misma función. El humano que reciba esta alerta debe contactar
        // directamente al número para conocer el contexto.
        // Runbook B6: se envía con enviarAvisoAsesor (Graph API directo) y no con sendRaw (provider),
        // porque el provider no propaga errores: así un aviso no entregado (p. ej. ventana de 24h
        // cerrada) queda registrado en chat_stats como 'aviso_asesor_fallido'.
        enviarAvisoAsesor({
          tipo: 'crisis',
          canal: canalEscalamiento,
          referencia: `tel:${enmascararTelefono(from)}`,
          mensaje: `⚠️ ALERTA — PROTOCOLO DE CRISIS\nNúmero: ${from}\nSe detectó contenido de riesgo y se bloqueó el flujo automático para este número. Por privacidad, este aviso no incluye el texto del mensaje — contacta directamente al paciente para conocer el contexto.\n\nPara reactivar el bot para este número una vez atendido, usar POST /v1/blacklist {"number":"${from}","intent":"remove"}.`
        }).catch((err) => console.error('[crisisProtocol] Error notificando al canal de escalamiento:', err));
      } else {
        console.error('[crisisProtocol] CANAL_ESCALAMIENTO_CRISIS no está configurado en .env — no se pudo notificar a un humano automáticamente.');
        // Runbook B6: también queda registrado en chat_stats (fase 'canal_no_configurado').
        enviarAvisoAsesor({ tipo: 'crisis', canal: '', referencia: `tel:${enmascararTelefono(from)}`, mensaje: '' }).catch(() => undefined);
      }

      // Registro de evento — solo metadata, nunca el texto del mensaje (no persistir contenido
      // clínico/sensible en chat_stats, ver MEMORY.md sección 10, hallazgo 7).
      registrarActividadBot('crisis_detectada', from, { accion: 'flujo_bloqueado' }).catch(() => { });
    } catch (err) {
      console.error('[crisisProtocol] Error inesperado en el interceptor de crisis:', err);
    }
  };
}
