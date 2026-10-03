import { addKeyword, EVENTS } from '@builderbot/bot';
import { datosinicialesComunes } from '../common/datosInicialesComunes';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { registrarActividadBot } from '../../../services/apiService';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion, flujoDesdeSeleccionMenu } from '../../../utils/trazabilidad';
import { limpiarClavesFlujosCita } from '../../../utils/estadoConversacion';


const step1CencelarCita = addKeyword(['280525004', '4', 'cancelar', 'Cancelo', 'Cancelar', 'cancelo'])
    .addAction(async (ctx, { state, flowDynamic, endFlow }) => {
        // TBOT-02 (defensa en profundidad): sin documento, citas ni selección de un recorrido anterior.
        await limpiarClavesFlujosCita(state);
        // Verificar si la sesión ha expirado por inactividad
        //    const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow);
        //    if (!sessionValid) {
        //        return endFlow();
        //    }
        trackPaso(ctx.from, 'cancelar.s01_inicio');
        await registrarActividadBot('chat_flujo_cancelar_cita', ctx.from);
    })
    .addAnswer('Perfecto, te solicitaré algunos datos para poder cancelar tu cita. 😊🗓️', { capture: false })
    .addAction(async (ctx, { provider, state, gotoFlow }) => {
        await state.update({ flujoSeleccionadoMenu: 'cancelarCita' });
        return gotoFlow(datosinicialesComunes);
    });
export { step1CencelarCita };