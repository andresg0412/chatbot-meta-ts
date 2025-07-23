import { addKeyword, EVENTS } from '@builderbot/bot';
import { step12AgendarCita } from './step12AgendarCita';

const step11AgendarCita = addKeyword(EVENTS.ACTION)
    .addAnswer('Para agendar tu cita, requerimos los siguientes datos.',
        {capture: false},
        async (ctx, { gotoFlow }) => {
            return gotoFlow(step12AgendarCita);
        }
    );

export { step11AgendarCita };