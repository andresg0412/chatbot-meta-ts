import { addKeyword, EVENTS } from '@builderbot/bot';
import { step2AgendarCita } from './step2AgendarCita';


const step1AgendarCita = addKeyword(['280525002', 'Agendar cita'])
    .addAnswer(
        '¿Cómo deseas agendar tu cita?',
        {
            capture: true,
            buttons: [
                { body: 'Presencial' },
                { body: 'Virtual' },
            ],
        },
        async (ctx, {state, gotoFlow}) => {
            if (ctx.body === 'Presencial'){
                await state.update({ tipoCitaAgendarCita: 'Presencial' });
                return gotoFlow(step2AgendarCita)
            }
            if (ctx.body === 'Virtual'){
                await state.update({ tipoCitaAgendarCita: 'Virtual' });
                return gotoFlow(step2AgendarCita)
            }
        }

    );

export { step1AgendarCita };
