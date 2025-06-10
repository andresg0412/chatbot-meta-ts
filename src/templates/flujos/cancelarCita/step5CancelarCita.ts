import { addKeyword, EVENTS } from '@builderbot/bot';
import { step6CancelarCita } from './step6CancelarCita';
import { sanitizeString } from '../../../utils/sanitize';

const step5CancelarCita = addKeyword(EVENTS.ACTION)
    .addAnswer('Por favor, escribe el número de la cita que deseas cancelar 🗓️:',
        { capture: true },
        async (ctx, { state, flowDynamic, gotoFlow }) => {
            const esperaSeleccionCita = state.getMyState().esperaSeleccionCita;
            if (!esperaSeleccionCita) {
                await flowDynamic('No se está esperando una selección de cita. Por favor, intenta nuevamente.');
                return;
            }
            const numeroCita = sanitizeString(ctx.body, 3);
            await state.update({ esperaSeleccionCita: false, numeroCita });
            return gotoFlow(step6CancelarCita);
        }
    );

export { step5CancelarCita };
