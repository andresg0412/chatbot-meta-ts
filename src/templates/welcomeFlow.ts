import { createBot, createProvider, createFlow, addKeyword, utils, EVENTS } from '@builderbot/bot';
import { politicaDatosFlow } from './flujos/principal/politicasDatos';
import { checkAndRegisterUserAttempt } from '../utils/userRateLimiter';
import { metricConversationStarted } from '../utils/metrics';
import { updateUserActivity, closeUserSession } from '../utils/proactiveSessionManager';
import { isNumberValid } from '../constants/killSwichConstants';
import { esBotHabilitado } from '../services/citasService';
import { registrarActividadBot } from '../services/apiService';

const welcomeFlow = addKeyword(EVENTS.WELCOME)
    .addAction(async (ctx, ctxFn) => {
        if (!ctx.from) {
            console.warn('⚠️ Mensaje entrante sin remitente (ctx.from indefinido), se ignora:', ctx);
            return ctxFn.endFlow();
        }
        if (!esBotHabilitado()) {
            await ctxFn.flowDynamic(
                'Lo sentimos, el servicio no está disponible en este momento. ' +
                'Por favor intenta más tarde.'
            );
            return ctxFn.endFlow();
        }
        await registrarActividadBot('chat_inicio', ctx.from);
        metricConversationStarted(ctx.from);
        updateUserActivity(ctx.from);
        await ctxFn.state.update({ celular: ctx.from });
        const rate = checkAndRegisterUserAttempt(ctx.from);
        if (!rate.allowed) {
            closeUserSession(ctx.from);
            await ctxFn.flowDynamic(`Has superado el límite de intentos. Intenta nuevamente después de ${(Math.ceil((rate.blockedUntil - Date.now())/60000))} minutos.`);
            return ctxFn.endFlow();
        }
        await ctxFn.flowDynamic(`¡Bienvenido a la IPS Centro de Orientación! 👋 \nSoy *Dianita* 👩🏻‍💻, tu asistente virtual. \nPara comenzar, es importante que aceptes nuestra política de datos personales 📃 la cual puedes encontrar en:\n👉🏼 https://www.centrodeorientacion.com.co/politica-privacidad/`);
        return ctxFn.gotoFlow(politicaDatosFlow);
    })

const exitFlow = addKeyword(['Salir', 'Exit', 'salir', 'exit'])
    .addAction(async (ctx, ctxFn) => {
        if (!ctx.from) {
            console.warn('⚠️ Mensaje entrante sin remitente (ctx.from indefinido), se ignora:', ctx);
            return ctxFn.endFlow();
        }
        closeUserSession(ctx.from);
        await ctxFn.flowDynamic('Gracias por usar nuestro servicio. ¡Hasta luego! 👋');
        return ctxFn.endFlow();
    })
    

export { welcomeFlow, exitFlow };