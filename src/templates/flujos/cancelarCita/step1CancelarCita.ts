import { addKeyword, EVENTS } from '@builderbot/bot';
import { datosinicialesComunes } from '../common/datosInicialesComunes';
import { abrirOSostenerSesion } from '../../../utils/proactiveSessionTimeout';
import { registrarActividadBot } from '../../../services/apiService';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion, flujoDesdeSeleccionMenu } from '../../../utils/trazabilidad';
import { limpiarClavesFlujosCita } from '../../../utils/estadoConversacion';


const step1CencelarCita = addKeyword(['280525004', '4', 'cancelar', 'Cancelo', 'Cancelar', 'cancelo'])
    .addAction(async (ctx, { state }) => {
        // T-04: se puede entrar sin pasar por welcomeFlow ("cancelar", "4", "Sí, cancelar" o "Necesito
        // cancelar" con el flag apagado). Sin sesión, los pasos siguientes la daban por vencida y el flujo
        // terminaba en silencio. Se abre (o renueva) ANTES de limpiar y guardar claves: si había vencido,
        // su cierre limpia el state.
        abrirOSostenerSesion(ctx.from);
        // TBOT-02 (defensa en profundidad): sin documento, citas ni selección de un recorrido anterior.
        await limpiarClavesFlujosCita(state);
        trackPaso(ctx.from, 'cancelar.s01_inicio');
        await registrarActividadBot('chat_flujo_cancelar_cita', ctx.from);
    })
    .addAnswer('Perfecto, te solicitaré algunos datos para poder cancelar tu cita. 😊🗓️', { capture: false })
    .addAction(async (ctx, { provider, state, gotoFlow }) => {
        await state.update({ flujoSeleccionadoMenu: 'cancelarCita' });
        return gotoFlow(datosinicialesComunes);
    });
export { step1CencelarCita };