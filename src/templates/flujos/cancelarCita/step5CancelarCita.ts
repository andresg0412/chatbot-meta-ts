import { addKeyword, EVENTS } from '@builderbot/bot';
import { step6CancelarCita } from './step6CancelarCita';
import { sanitizeString } from '../../../utils/sanitize';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { registrarActividadBot } from '../../../services/apiService';


const step5CancelarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        await registrarActividadBot('chat_flujo_cancelar_cita', ctx.from, {
            step: 'consulta_citas_agendadas'
        });
    })
    .addAnswer('Por favor, escribe el *NÚMERO* de la cita que deseas cancelar 🗓️: (Ejemplo: 1)',
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
