import { addKeyword, EVENTS } from '@builderbot/bot';
import { sanitizeString, isValidDocumentNumber } from '../../../utils/sanitize';
import { step16AgendarCita } from './step16AgendarCita';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion } from '../../../utils/trazabilidad';

const step15AgendarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'agendar.s15_documento' });
        if (!sessionValid) {
            return endFlow();
        }
    })
    .addAnswer('Ahora, por favor digita tu número de documento 🔢:',
        { capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const numeroDocumentoPaciente = sanitizeString(ctx.body, 20);
            if (!isValidDocumentNumber(numeroDocumentoPaciente)) {
                trackNoEntendido(ctx.from, 'agendar.s15_documento');
                await flowDynamic('El número de documento ingresado no es válido. Intenta nuevamente.');
                return gotoFlow(step15AgendarCita);
            }
            trackPaso(ctx.from, 'agendar.s15_documento', 'ok');
            await state.update({ numeroDocumentoPaciente, esperaNumeroDoc: false });
            return gotoFlow(step16AgendarCita);
        }
    );

export { step15AgendarCita };
