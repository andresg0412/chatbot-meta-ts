import { addKeyword, EVENTS } from '@builderbot/bot';
import { step6Reprogramar } from './step6Reprogramar';
import { sanitizeString } from '../../../utils/sanitize';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { registrarActividadBot } from '../../../services/apiService';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin } from '../../../utils/trazabilidad';



const step5Reprogramar = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'reprogramar.s05_lista_citas' });
        if (!sessionValid) {
            return endFlow();
        }
        await registrarActividadBot('chat_flujo_reprogramar', ctx.from, {
            step: 'consulta_citas_agendadas'
        });
    })
    .addAnswer('Por favor, digita el número de la cita que deseas reprogramar 🗓️:',
        { capture: true },
        async (ctx, { state, flowDynamic, gotoFlow }) => {
            const esperaSeleccionCita = state.getMyState().esperaSeleccionCita;
            if (!esperaSeleccionCita) {
                trackNoEntendido(ctx.from, 'reprogramar.s05_lista_citas');
                await flowDynamic('No se está esperando una selección de cita. Por favor, intenta nuevamente.');
                return;
            }
            const numeroCita = sanitizeString(ctx.body, 3);
            await state.update({ esperaSeleccionCita: false, numeroCita });
            return gotoFlow(step6Reprogramar);
        }
    )


export { step5Reprogramar };
