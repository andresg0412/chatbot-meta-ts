import { addKeyword, EVENTS } from '@builderbot/bot';
import { step19AgendarCita } from './step19AgendarCita';
import { volverMenuPrincipal } from '../common';

const step18AgendarCita = addKeyword(EVENTS.ACTION)
    .addAnswer(
        '¿Confirmas la cita? ✅',
        {
            capture: true,
            buttons: [
                { body: 'Si' },
                { body: 'No' },
            ],
        },
        async (ctx, ctxFn) => {
            if (ctx.body === 'Si') {
                return ctxFn.gotoFlow(step19AgendarCita);
            }
            if (ctx.body === 'No') {
                await ctxFn.flowDynamic('Recuerda que puedes agendar tu cita cuando lo requieras.');
                return ctxFn.gotoFlow(volverMenuPrincipal);
            }
        }
    );

export { step18AgendarCita };