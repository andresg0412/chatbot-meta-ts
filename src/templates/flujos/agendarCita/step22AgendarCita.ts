import { addKeyword, EVENTS } from '@builderbot/bot';
import { step23AgendarCita } from './step23AgendarCita';

const step22AgendarCita = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'Tu pago podrá ser efectuado en nuestras instalaciones 24 horas antes de la consulta. ¡Estamos aquí para ayudarte!',
        { capture: false },
        async (ctx, ctxFn) => {
            return ctxFn.gotoFlow(step23AgendarCita);
        }
    );

export { step22AgendarCita };