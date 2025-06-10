import { addKeyword, EVENTS } from '@builderbot/bot';
import { step7Reprogramar } from './step7Reprogramar';
import { sanitizeString } from '../../../utils/sanitize';

const step6Reprogramar = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
            const numeroCitaRaw = ctx.body;
            const numeroCita = parseInt(sanitizeString(numeroCitaRaw, 3), 10) || 0;
            const { citasProgramadas } = state.getMyState();
            if (!citasProgramadas || !citasProgramadas[numeroCita - 1]) {
                await flowDynamic('Número de cita inválido. Por favor, intenta nuevamente.');
                return;
            }
            const citaSeleccionadaProgramada = citasProgramadas[numeroCita - 1];
            await state.update({ citaSeleccionadaProgramada });
            return gotoFlow(step7Reprogramar);
        });



export { step6Reprogramar };
