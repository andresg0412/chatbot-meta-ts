import { addKeyword, EVENTS } from '@builderbot/bot';
import { step5CancelarCita } from '../cancelarCita/step5CancelarCita';
import { step5Reprogramar } from '../reprogramarCita/step5Reprogramar';

const datosinicialesComunes5 = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        const flujoSeleccionadoMenu = state.getMyState().flujoSeleccionadoMenu;
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
