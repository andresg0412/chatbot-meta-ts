import { addKeyword, EVENTS } from '@builderbot/bot';
import { stepOpcionReprogramar } from './stepOpcionReprogramar';
import { stepConfirmaCancelarCita } from './stepConfirmaCancelarCita';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';

const step7CancelarCita = addKeyword(EVENTS.ACTION)
    .addAnswer(
        '¿Estás seguro que deseas cancelar tu cita? 🤔',
        {
            capture: true,
            buttons: [
                { body: 'Si' },
                { body: 'No' },
            ],
        },
        async (ctx, { provider, state, gotoFlow }) => {
            if (ctx.body === 'Si') {
                return gotoFlow(stepConfirmaCancelarCita)
            }
            if (ctx.body === 'No') {
                return gotoFlow(stepOpcionReprogramar)
            }
        }
    );

export { step7CancelarCita };
