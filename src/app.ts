import { join } from 'path'
import { createBot, createProvider, createFlow, addKeyword, utils, EVENTS } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { MetaProvider as Provider } from '@builderbot/provider-meta'
import "dotenv/config";
import templates from './templates';
import { setBotInstance, restoreActiveTimers } from './utils/proactiveSessionManager';
import { cleanupOldSessionsWithoutNotification } from './utils';
import { executeDailyCampaign } from './controllers/campaignController';
import { executeReminderCampaign } from './controllers/reminderCampaignController';
import { executeConfirmationCampaign } from './controllers/executeCampaignController';
import { executeRecuperacionCampaign } from './controllers/recuperacionCampaignController';
import { executeConAsistenciaCampaign } from './controllers/conAsistenciaCampaignController';
import { createCrisisInterceptor } from './utils/crisisProtocol';
import { startCascadaPoller } from './utils/listaEsperaCascadaPoller';
import { procesarNoticeProvider } from './utils/avisoAsesor';
import { obtenerBloqueadosPorCrisis, quitarBloqueoPorCrisis } from './utils/crisisBlacklistStore';
import { isCrisisProtocolEnabled } from './utils/listaEsperaFlags';
import { iniciarTrazabilidad, trackEvento } from './utils/trazabilidad';
import { crearListenerMensajeEntrante, crearMiddlewareEstadosMeta } from './utils/trazabilidadMeta';

const PORT = process.env.PORT ?? 3008

process.on('uncaughtException', (error) => {
    console.error('🚨 uncaughtException (proceso NO se detiene):', error);
});

process.on('unhandledRejection', (reason) => {
    console.error('🚨 unhandledRejection (proceso NO se detiene):', reason);
});

const main = async () => {
    const adapterProvider = createProvider(Provider, {
        jwtToken: process.env.jwtToken,
        numberId: process.env.numberId,
        verifyToken: process.env.verifyToken,
        version: 'v18.0'
    })
    const adapterDB = new Database()

    // Protocolo de crisis (ver src/utils/crisisProtocol.ts): se registra ANTES de createBot() para
    // que este listener corra primero cuando llegue un mensaje (Node invoca los listeners de un
    // mismo evento en orden de registro) y pueda bloquear el flujo automático (blacklist) antes de
    // que el propio framework empiece a procesar el mensaje entrante.
    let botInstance: { dynamicBlacklist?: { add: (n: string | string[]) => any; checkIf?: (n: string) => boolean } } | undefined;

    // Función cruda de envío reutilizada por el protocolo de crisis y por el poller de cascada de
    // lista de espera (Fase 2) — no duplicar esta función en más sitios.
    const sendRaw = async (to: string, message: string) => adapterProvider.sendMessage(to, message, {});

    adapterProvider.on(
        'message',
        createCrisisInterceptor(() => botInstance, sendRaw)
    );

    // Trazabilidad (docs/features/2026-09-29-trazabilidad-usuarios.md, 4.3.4): `msg_entrante` por cada
    // mensaje recibido. Se registra DESPUÉS del interceptor de crisis (así `en_blacklist` ya refleja un
    // bloqueo por crisis de este mismo mensaje) y antes de createBot (corre antes que el flujo). Nunca
    // guarda el texto del paciente (P7).
    adapterProvider.on('message', crearListenerMensajeEntrante(() => botInstance));

    // Trazabilidad: estados de entrega de Meta (`wa_estado`) leídos del POST /webhook sin tocar la
    // respuesta del provider (P4). Middleware global de polka: corre antes del handler del provider y
    // con el body ya parseado (bodyParser.json() se registra al construir el servidor).
    adapterProvider.server.use(crearMiddlewareEstadosMeta());

    // Runbook B6: el provider convierte los webhooks de estado 'failed' de Meta en un evento 'notice'.
    // Si corresponde a un aviso reciente al asesor (crisis / escalamiento), se registra en chat_stats.
    adapterProvider.on('notice', procesarNoticeProvider);

    const bot = await createBot({
        flow: templates,
        provider: adapterProvider,
        database: adapterDB,
    })
    botInstance = bot as any;

    // Runbook B8: restaurar los números bloqueados por el protocolo de crisis (persistidos en
    // src/utils/crisisBlacklistDB.json) para que un reinicio no los desbloquee sin intervención
    // humana. Se restauran aunque CRISIS_PROTOCOL_ENABLED esté en false: apagar la detección no debe
    // liberar a alguien que ya estaba bloqueado. Se liberan con POST /v1/blacklist {intent:'remove'}.
    try {
        const bloqueadosPorCrisis = obtenerBloqueadosPorCrisis();
        if (bloqueadosPorCrisis.length > 0) {
            bot.dynamicBlacklist.add(bloqueadosPorCrisis);
        }
        console.log(
            `[crisisProtocol] Protocolo de crisis ${isCrisisProtocolEnabled() ? 'ACTIVO' : 'inactivo (CRISIS_PROTOCOL_ENABLED != true)'}; ` +
            `${bloqueadosPorCrisis.length} número(s) bloqueado(s) por crisis restaurado(s) en la lista negra.`
        );
    } catch (error) {
        console.error('[crisisProtocol] Error restaurando la lista negra por crisis:', error);
    }
    const { handleCtx, httpServer } = bot

    // Configurar el bot para el sistema de timeout proactivo
    // Usar el método del provider correctamente
    const botForTimeout = {
        sendMessage: async (to: string, message: string) => {
            try {
                return await adapterProvider.sendMessage(to, message, {});
            } catch (error) {
                console.error('Error en sendMessage del provider:', error);
                throw error;
            }
        }
    };

    setBotInstance(botForTimeout);

    console.log('🚀 Sistema de timeout proactivo inicializado');

    // Trazabilidad: reenvía el spool de una ejecución anterior, arranca el flush por lotes y guarda la
    // cola en el spool en SIGTERM/SIGINT. No hace nada con TRAZABILIDAD_V2_ENABLED != true.
    iniciarTrazabilidad();

    // PASO 1: Limpiar sesiones muy antiguas ANTES de restaurar timers
    cleanupOldSessionsWithoutNotification();

    // PASO 2: Restaurar timers de sesiones activas después de reinicio
    restoreActiveTimers();

    // PASO 3: Programar limpieza periódica para evitar acumulación
    setInterval(cleanupOldSessionsWithoutNotification, 2 * 60 * 60 * 1000); // Cada 2 horas

    console.log('✅ Sistema proactivo inicializado con protección contra alertas de Meta');

    // Poller de la cascada de ofertas de cupo de lista de espera (Fase 2) — ver
    // src/utils/listaEsperaCascadaPoller.ts y docs/features/2026-09-07-lista-espera-inteligente.md,
    // sección 13.4-a. Reutiliza el mismo `sendRaw` que ya usa el protocolo de crisis.
    startCascadaPoller(sendRaw);

    adapterProvider.server.post(
        '/v1/messages',
        handleCtx(async (bot, req, res) => {
            const { number, message, urlMedia } = req.body
            await bot.sendMessage(number, message, { media: urlMedia ?? null })
            return res.end('sended')
        })
    )

    adapterProvider.server.post(
        '/v1/register',
        handleCtx(async (bot, req, res) => {
            const { number, name } = req.body
            await bot.dispatch('REGISTER_FLOW', { from: number, name })
            return res.end('trigger')
        })
    )

    adapterProvider.server.post(
        '/v1/samples',
        handleCtx(async (bot, req, res) => {
            const { number, name } = req.body
            await bot.dispatch('SAMPLES', { from: number, name })
            return res.end('trigger')
        })
    )

    adapterProvider.server.post(
        '/v1/blacklist',
        handleCtx(async (bot, req, res) => {
            const { number, intent } = req.body
            // Runbook B8: al reactivar un número, quitarlo también del registro persistente de
            // bloqueos por crisis (antes de la línea original, que lanza si el número no está).
            if (intent === 'remove') quitarBloqueoPorCrisis(number)
            if (intent === 'remove') bot.blacklist.remove(number)
            if (intent === 'add') bot.blacklist.add(number)
            if (intent === 'add' || intent === 'remove') {
                trackEvento({
                    tipo_evento: 'control_blacklist',
                    telefono: typeof number === 'string' ? number : null,
                    sesion_id: null,
                    resultado: intent,
                    origen: 'sistema',
                })
            }

            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', number, intent }))
        })
    )

    // Endpoint para ejecutar campaña diaria (cron)
    adapterProvider.server.post(
        '/v1/campaigns/daily',
        executeDailyCampaign
    )

    // Endpoint para ejecutar campaña de recordatorio (cron o manual) 48 horas
    adapterProvider.server.post(
        '/v1/campaigns/reminder',
        executeReminderCampaign
    )

    // Endpoint para ejecutar campaña de confirmación (cron o manual) 24 horas
    adapterProvider.server.post(
        '/v1/campaigns/execute',
        executeConfirmationCampaign
    )

    // Endpoint para ejecutar campaña de recuperación de pacientes sin asistencia
    adapterProvider.server.post(
        '/v1/campaigns/recuperacion',
        executeRecuperacionCampaign
    )

    // Endpoint para ejecutar campaña de usuarios con asistencia
    adapterProvider.server.post(
        '/v1/campaigns/conasistencia',
        executeConAsistenciaCampaign
    )

    httpServer(+PORT)
}

main()
