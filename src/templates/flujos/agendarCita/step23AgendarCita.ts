import { addKeyword, EVENTS } from '@builderbot/bot';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { closeUserSession } from '../../../utils/proactiveSessionManager';

const step23AgendarCitaColombia = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow);
        if (!sessionValid) {
            return endFlow();
        }
    })
    .addAnswer(
        'Mostrar medio de pago Colombia 💳: (Pendiente definir)',
        { capture: false },
        async (ctx, ctxFn) => {
            closeUserSession(ctx.from);
            return ctxFn.endFlow();
        }
    );


const step23AgendarCitaExterior = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'Mostrar medio de pago exterior 💳: (Pendiente definir)',
        { capture: false },
        async (ctx, ctxFn) => {
            closeUserSession(ctx.from);
            return ctxFn.endFlow();
        }
    );


const step23AgendarCita = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'Agradecemos tu preferencia.',
        { capture: false },
        async (ctx, ctxFn) => {
            closeUserSession(ctx.from);
            return ctxFn.endFlow();
        }
    );

export {
    step23AgendarCita,
    step23AgendarCitaExterior,
    step23AgendarCitaColombia
};