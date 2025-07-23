import { addKeyword, EVENTS } from '@builderbot/bot';
import { menuFlow } from '../../menuFlow';
import { mesajeSalida } from './mensajeSalida';

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
                return ctxFn.gotoFlow(mesajeSalida);
            }
        }
    );

export { volverMenuPrincipal };