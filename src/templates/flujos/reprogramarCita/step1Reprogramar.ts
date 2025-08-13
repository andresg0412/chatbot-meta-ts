import { addKeyword, EVENTS } from '@builderbot/bot';
import { datosinicialesComunes } from '../common/datosInicialesComunes';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { registrarActividadBot } from '../../../services/apiService';


const step1Reprogramar = addKeyword(['280525003', '3', 'reprogramar cita', 'reprogramar', 'Reprogramar'])
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow);
        if (!sessionValid) {
            return endFlow();
        }
    })
    .addAnswer('Perfecto, te solicitaré algunos datos para poder reprogramar tu cita. 😊🗓️', { capture: false })
    .addAction(async (ctx, { provider, state, gotoFlow }) => {
        await state.update({ flujoSeleccionadoMenu: 'reprogramarCita' });
        await registrarActividadBot('chat_flujo_reprogramar', ctx.from);
        return gotoFlow(datosinicialesComunes);
    });
export { step1Reprogramar };
