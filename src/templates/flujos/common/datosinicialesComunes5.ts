import { addKeyword, EVENTS } from '@builderbot/bot';
import { step5CancelarCita } from '../cancelarCita/step5CancelarCita';
import { step5Reprogramar } from '../reprogramarCita/step5Reprogramar';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion, flujoDesdeSeleccionMenu } from '../../../utils/trazabilidad';

const datosinicialesComunes5 = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        const flujoSeleccionadoMenu = state.getMyState().flujoSeleccionadoMenu;
        trackPaso(ctx.from, 'comun.c05_seleccion', 'mostrado', { flujo: flujoDesdeSeleccionMenu(flujoSeleccionadoMenu) });
        if (flujoSeleccionadoMenu === 'cancelarCita') {
            return gotoFlow(step5CancelarCita);
        } else if (flujoSeleccionadoMenu === 'reprogramarCita') {
            return gotoFlow(step5Reprogramar);
        } else {
            await flowDynamic('Opción no válida. Por favor, intenta nuevamente.');
            return gotoFlow(datosinicialesComunes5);
        }
    });

export { datosinicialesComunes5 };
