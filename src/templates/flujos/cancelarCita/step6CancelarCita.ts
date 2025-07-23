import { addKeyword, EVENTS } from '@builderbot/bot';
import { step7CancelarCita } from './step7CancelarCita';
import { sanitizeString } from '../../../utils/sanitize';

const step6CancelarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        const numeroCitaRaw = ctx.body;
        const numeroCita = parseInt(sanitizeString(numeroCitaRaw, 3), 10) || 0;
        const { citasProgramadas } = state.getMyState();
        if (!citasProgramadas || !citasProgramadas[numeroCita - 1]) {
            await flowDynamic('Número de cita inválido. Por favor, intenta nuevamente.');
            return gotoFlow(step6CancelarCita);
        }
        const citaSeleccionadaCancelar = citasProgramadas[numeroCita - 1];
        await state.update({ citaSeleccionadaCancelar });
        return gotoFlow(step7CancelarCita);
    });

export { step6CancelarCita };
