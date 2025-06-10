import { addKeyword, EVENTS } from '@builderbot/bot';
import { step7CancelarCita } from './step7CancelarCita';

const step6CancelarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        const numeroCita = ctx.body ? parseInt(ctx.body, 10) : 0;
        const { citasProgramadas } = state.getMyState();
        if (!citasProgramadas || !citasProgramadas[numeroCita - 1]) {
            await flowDynamic('Número de cita inválido. Por favor, intenta nuevamente.');
            return;
        }
        const citaSeleccionadaCancelar = citasProgramadas[numeroCita - 1];
        await state.update({ citaSeleccionadaCancelar });
        return gotoFlow(step7CancelarCita);
    });

export { step6CancelarCita };
