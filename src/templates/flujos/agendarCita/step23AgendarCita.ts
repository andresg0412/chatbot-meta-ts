import { addKeyword, EVENTS } from '@builderbot/bot';

const step23AgendarCitaColombia = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'Mostrar medio de pago Colombia 💳: (Pendiente definir)',
        { capture: false },
        async (ctx, ctxFn) => {
            return ctxFn.endFlow();
        }
    );


const step23AgendarCitaExterior = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'Mostrar medio de pago exterior 💳: (Pendiente definir)',
        { capture: false },
        async (ctx, ctxFn) => {
            return ctxFn.endFlow();
        }
    );


const step23AgendarCita = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'Agradecemos tu preferencia.',
        { capture: false },
        async (ctx, ctxFn) => {
            return ctxFn.endFlow();
        }
    );

export {
    step23AgendarCita,
    step23AgendarCitaExterior,
    step23AgendarCitaColombia
};