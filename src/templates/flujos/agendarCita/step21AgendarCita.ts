import { addKeyword, EVENTS } from '@builderbot/bot';
import { step22AgendarCita } from './step22AgendarCita';
import { step22AgendarCitaMedioVirtual } from './step22AgendarCita';

const step21AgendarCita = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'Por favor, selecciona tu medio de pago de preferencia 💳:',
        {
            capture: true,
            buttons: [
                { body: 'Efectivo' },
                { body: 'Medios Virtuales' },
            ],
        },
        async (ctx, ctxFn) => {
            if (ctx.body === 'Efectivo'){
                return ctxFn.gotoFlow(step22AgendarCita)
            }
            if (ctx.body === 'Medios Virtuales'){
                return ctxFn.gotoFlow(step22AgendarCitaMedioVirtual)
            }
        }
    );

export { step21AgendarCita };