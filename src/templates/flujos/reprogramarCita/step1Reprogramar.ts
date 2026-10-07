import { addKeyword, EVENTS } from '@builderbot/bot';
import { datosinicialesComunes } from '../common/datosInicialesComunes';
import { abrirOSostenerSesion } from '../../../utils/proactiveSessionTimeout';
import { registrarActividadBot } from '../../../services/apiService';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin } from '../../../utils/trazabilidad';
import { limpiarClavesFlujosCita } from '../../../utils/estadoConversacion';
import { OPCIONES_REGEX } from '../keywordsBotones';


const step1Reprogramar = addKeyword('/^\\s*3\\s*$|280525003|reprogramar/i', OPCIONES_REGEX)
    .addAction(async (ctx, { state }) => {
        // T-04: igual que cancelar. Con "reprogramar"/"3" como primer mensaje (sin welcomeFlow) no había
        // sesión y checkSessionTimeout terminaba el flujo en silencio. Ahora se abre (o renueva) la sesión
        // antes de limpiar claves.
        abrirOSostenerSesion(ctx.from, { paso: 'reprogramar.s01_inicio' });
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
