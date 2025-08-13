import { addKeyword, EVENTS } from '@builderbot/bot';
import { datosinicialesComunes } from '../common/datosInicialesComunes';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { registrarActividadBot } from '../../../services/apiService';


const step1CencelarCita = addKeyword(['280525004', '4', 'cancelar'])
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        // Verificar si la sesión ha expirado por inactividad
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow);
        if (!sessionValid) {
            return endFlow();
        }
        await registrarActividadBot('chat_flujo_cancelar_cita', ctx.from);
    })
    .addAnswer('Perfecto, te solicitaré algunos datos para poder cancelar tu cita. 😊🗓️', { capture: false })
    .addAction(async (ctx, { provider, state, gotoFlow }) => {
        await state.update({ flujoSeleccionadoMenu: 'cancelarCita' });
        return gotoFlow(datosinicialesComunes);
    });
export { step1CencelarCita };