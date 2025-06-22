import { addKeyword, EVENTS } from '@builderbot/bot';

const step23AgendarCita = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'Agradecemos tu preferencia.',
        { capture: false },
        async (ctx, ctxFn) => {
            return ctxFn.endFlow();
        }
    );

export { step23AgendarCita };