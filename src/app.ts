import { join } from 'path'
import { createBot, createProvider, createFlow, addKeyword, utils, EVENTS } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { MetaProvider as Provider } from '@builderbot/provider-meta'
import "dotenv/config";
import templates from './templates';
import { setBotInstance, restoreActiveTimers } from './utils/proactiveSessionManager';

const PORT = process.env.PORT ?? 3008

const main = async () => {
    const adapterProvider = createProvider(Provider, {
        jwtToken: process.env.jwtToken,
        numberId: process.env.numberId,
        verifyToken: process.env.verifyToken,
        version: 'v18.0'
    })
    const adapterDB = new Database()

    const { handleCtx, httpServer } = await createBot({
        flow: templates,
        provider: adapterProvider,
        database: adapterDB,
    })

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

    // PASO 1: Limpiar sesiones muy antiguas ANTES de restaurar timers
    cleanupOldSessionsWithoutNotification();

    // PASO 2: Restaurar timers de sesiones activas después de reinicio
    restoreActiveTimers();
    
    // PASO 3: Programar limpieza periódica para evitar acumulación
    setInterval(cleanupOldSessionsWithoutNotification, 2 * 60 * 60 * 1000); // Cada 2 horas

    console.log('✅ Sistema proactivo inicializado con protección contra alertas de Meta');

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
            if (intent === 'remove') bot.blacklist.remove(number)
            if (intent === 'add') bot.blacklist.add(number)

            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', number, intent }))
        })
    )

    httpServer(+PORT)
}

main()
