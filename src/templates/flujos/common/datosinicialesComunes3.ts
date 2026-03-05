import { addKeyword, EVENTS } from '@builderbot/bot';
import { datosinicialesComunes4 } from './datosinicialesComunes4';
import { sanitizeString, isValidDocumentNumber } from '../../../utils/sanitize';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';

const datosinicialesComunes3 = addKeyword(EVENTS.ACTION)
    .addAnswer('Ahora, por favor digita tu número de documento 🔢:',
        { capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const numeroDoc = sanitizeString(ctx.body, 20);
            if (!isValidDocumentNumber(numeroDoc)) {
                await flowDynamic('El número de documento ingresado no es válido. Intenta nuevamente.');
                return gotoFlow(datosinicialesComunes3);
            }
            await state.update({ numeroDoc, esperaNumeroDoc: false, esperaSeleccionCita: true });
            return gotoFlow(datosinicialesComunes4);
        }
    );

export { datosinicialesComunes3 };
