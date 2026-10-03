import { addKeyword, EVENTS } from '@builderbot/bot';
import { datosinicialesComunes } from '../common/datosInicialesComunes';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { registrarActividadBot } from '../../../services/apiService';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin } from '../../../utils/trazabilidad';
import { limpiarClavesFlujosCita } from '../../../utils/estadoConversacion';


const step1Reprogramar = addKeyword(['280525003', '3', 'reprogramar cita', 'reprogramar', 'Reprogramar'])
    .addAction(async (ctx, { state, flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'reprogramar.s01_inicio' });
        if (!sessionValid) {
            return endFlow();
        }
        // TBOT-02 (defensa en profundidad): sin documento, citas, profesional ni fechas de un recorrido
        // anterior (reprogramar y agendar comparten claves como profesionalId o citaSeleccionadaHora).
        await limpiarClavesFlujosCita(state);
    })
    .addAnswer('Perfecto, te solicitaré algunos datos para poder reprogramar tu cita. 😊🗓️', { capture: false })
    .addAction(async (ctx, { provider, state, gotoFlow }) => {
        await state.update({ flujoSeleccionadoMenu: 'reprogramarCita' });
        await registrarActividadBot('chat_flujo_reprogramar', ctx.from);
        return gotoFlow(datosinicialesComunes);
    });
export { step1Reprogramar };
