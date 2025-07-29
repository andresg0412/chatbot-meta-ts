import { addKeyword, EVENTS } from '@builderbot/bot';
import { menuFlow } from '../../menuFlow';
import { mesajeSalida } from './mensajeSalida';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';

const volverMenuPrincipal = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow);
        if (!sessionValid) {
            return endFlow();
        }
    })
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
            if (ctx.body === 'Volver al menú') {
                return ctxFn.gotoFlow(menuFlow)
            }
            if (ctx.body === 'Salir') {
                return ctxFn.gotoFlow(mesajeSalida);
            }
        }
    );

export { volverMenuPrincipal };