import { addKeyword, EVENTS } from '@builderbot/bot';
import { step6Reprogramar } from './step6Reprogramar';
import { sanitizeString } from '../../../utils/sanitize';


const step5Reprogramar = addKeyword(EVENTS.ACTION)
    .addAnswer('Por favor, digita el número de la cita que deseas reprogramar 🗓️:',
        { capture: true },
        async (ctx, { state, flowDynamic, gotoFlow }) => {
            const esperaSeleccionCita = state.getMyState().esperaSeleccionCita;
            if (!esperaSeleccionCita) {
                await flowDynamic('No se está esperando una selección de cita. Por favor, intenta nuevamente.');
                return;
            }
            const numeroCita = sanitizeString(ctx.body, 3);
            await state.update({ esperaSeleccionCita: false, numeroCita });
            return gotoFlow(step6Reprogramar);
        }
    )


export { step5Reprogramar };
