import { addKeyword, EVENTS } from '@builderbot/bot';
import { step5CancelarCita } from '../cancelarCita/step5CancelarCita';
import { step5Reprogramar } from '../reprogramarCita/step5Reprogramar';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion, flujoDesdeSeleccionMenu } from '../../../utils/trazabilidad';
import { MENSAJE_CONVERSACION_TERMINADA } from '../../../utils/estadoConversacion';

const datosinicialesComunes5 = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow, endFlow }) => {
        const flujoSeleccionadoMenu = state.getMyState()?.flujoSeleccionadoMenu;
        trackPaso(ctx.from, 'comun.c05_seleccion', 'mostrado', { flujo: flujoDesdeSeleccionMenu(flujoSeleccionadoMenu) });
        if (flujoSeleccionadoMenu === 'cancelarCita') {
            return gotoFlow(step5CancelarCita);
        } else if (flujoSeleccionadoMenu === 'reprogramarCita') {
            return gotoFlow(step5Reprogramar);
        } else {
            // Antes: "Opción no válida" + gotoFlow a este mismo paso, un ciclo sin fin (nada cambia el
            // flujo entre vueltas). Sin flujo en curso (TBOT-02: state limpio) se termina la conversación.
            return endFlow(MENSAJE_CONVERSACION_TERMINADA);
        }
    });

export { datosinicialesComunes5 };
