import { addKeyword, EVENTS } from '@builderbot/bot';
import { sanitizeString, isValidDocumentNumber } from '../../../utils/sanitize';
import { step16AgendarCita } from './step16AgendarCita';

const step15AgendarCita = addKeyword(EVENTS.ACTION)
    .addAnswer('Ahora, por favor digita tu número de documento 🔢:',
        {capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const numeroDocumentoPaciente = sanitizeString(ctx.body, 20);
            if (!isValidDocumentNumber(numeroDocumentoPaciente)) {
                await flowDynamic('El número de documento ingresado no es válido. Intenta nuevamente.');
                return gotoFlow(step15AgendarCita);
            }
            await state.update({ numeroDocumentoPaciente, esperaNumeroDoc: false });
            return gotoFlow(step16AgendarCita);
        }
    );

export { step15AgendarCita };
