import { addKeyword, EVENTS } from '@builderbot/bot';
import { menuFlow } from '../../menuFlow';

const volverMenuPrincipal = addKeyword(EVENTS.ACTION)
    .addAnswer(
        '¿Que deseas hacer?',
        {
            capture: true,
            buttons: [
                { body: 'Volver al menú' },
                { body: 'Salir' },
            ],
        },
        async (ctx, ctxFn) => {
            if (ctx.body === 'Volver al menú'){
                return ctxFn.gotoFlow(menuFlow)
            }
            if (ctx.body === 'Salir'){
                await ctxFn.flowDynamic('🌟 Agradecemos tu preferencia. Nuestra misión es orientarte en cada momento de tu vida. \nRecuerda que cuando lo desees puedes escribir *"hola"* para conversar nuevamente.');
                return ctxFn.endFlow();
            }
        }
    );

export { volverMenuPrincipal };