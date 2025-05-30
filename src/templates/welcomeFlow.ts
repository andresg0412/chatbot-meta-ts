import { createBot, createProvider, createFlow, addKeyword, utils, EVENTS } from '@builderbot/bot';
import { politicaDatosFlow } from './flujos/principal/politicasDatos';

const welcomeFlow = addKeyword(EVENTS.WELCOME)
    .addAction(async (ctx, ctxFn) => {
        await ctxFn.flowDynamic(`¡Bienvenido a la IPS Cenro de Orientación! 👋 \n Soy Dianita 👩🏻‍💻, tu asistente virtual. \n Para comenzar, es importante que aceptes nuestra política de datos personales 📃 la cual puedes encontrar en 👉🏼:`);
        return ctxFn.gotoFlow(politicaDatosFlow);
    })
    

export { welcomeFlow };