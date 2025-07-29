import { createBot, createProvider, createFlow, addKeyword, utils, EVENTS } from '@builderbot/bot';
import { politicaDatosFlow } from './flujos/principal/politicasDatos';
import { checkAndRegisterUserAttempt } from '../utils/userRateLimiter';
import { metricConversationStarted } from '../utils/metrics';
import { updateUserActivity } from '../utils/proactiveSessionManager';

const welcomeFlow = addKeyword(EVENTS.WELCOME)
    .addAction(async (ctx, ctxFn) => {
        metricConversationStarted(ctx.from);
        updateUserActivity(ctx.from);
        await ctxFn.state.update({ celular: ctx.from });
        const rate = checkAndRegisterUserAttempt(ctx.from);
        if (!rate.allowed) {
            await ctxFn.flowDynamic(`Has superado el límite de intentos. Intenta nuevamente después de ${(Math.ceil((rate.blockedUntil - Date.now())/60000))} minutos.`);
            return ctxFn.endFlow();
        }
        await ctxFn.flowDynamic(`¡Bienvenido a la IPS Cenro de Orientación! 👋 \nSoy *Dianita* 👩🏻‍💻, tu asistente virtual. \nPara comenzar, es importante que aceptes nuestra política de datos personales 📃 la cual puedes encontrar en:\n👉🏼 https://www.centrodeorientacion.com.co/politica-privacidad/`);
        return ctxFn.gotoFlow(politicaDatosFlow);
    })
    

export { welcomeFlow };