import { addKeyword, EVENTS } from '@builderbot/bot';
import { step7Reprogramar } from './step7Reprogramar';
import { sanitizeString } from '../../../utils/sanitize';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin } from '../../../utils/trazabilidad';

const step6Reprogramar = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'reprogramar.s06_selecciona_cita' });
        if (!sessionValid) {
            return endFlow();
        }
    })
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        const numeroCitaRaw = ctx.body;
        const numeroCita = parseInt(sanitizeString(numeroCitaRaw, 3), 10) || 0;
        const { citasProgramadas } = state.getMyState();
        if (!citasProgramadas || !citasProgramadas[numeroCita - 1]) {
            trackNoEntendido(ctx.from, 'reprogramar.s06_selecciona_cita');
            await flowDynamic('Número de cita inválido. Por favor, intenta nuevamente.');
            return;
        }
        const citaSeleccionadaProgramada = citasProgramadas[numeroCita - 1];
        trackPaso(ctx.from, 'reprogramar.s06_selecciona_cita', 'ok');
        await state.update({ citaSeleccionadaProgramada });
        return gotoFlow(step7Reprogramar);
    });



export { step6Reprogramar };
