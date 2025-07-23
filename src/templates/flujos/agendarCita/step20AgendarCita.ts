import { addKeyword, EVENTS } from '@builderbot/bot';
import { step21AgendarCita } from './step21AgendarCita';

const step20AgendarCita = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'Aprovecha el 10% de descuento por realizar el pago anticipado. Esta es una gran oportunidad para ahorrar en tu cita médica.',
        {
            capture: false,
        },
        async (ctx, ctxFn) => {
            return ctxFn.gotoFlow(step21AgendarCita);
        }
    );

export { step20AgendarCita };