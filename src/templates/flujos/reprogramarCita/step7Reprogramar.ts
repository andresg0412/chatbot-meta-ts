import { addKeyword, EVENTS } from '@builderbot/bot';
import { stepConfirmaReprogramar } from './stepConfirmaReprogramar';
import { noConfirmaReprogramar } from './noConfirmaReprogramar';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';

const step7Reprogramar = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow);
        if (!sessionValid) {
            return endFlow();
        }
    })
    .addAnswer(
        '¿Estás seguro que deseas reprogramar tu cita? 🤔',
        {
            capture: true,
            buttons: [
                { body: 'Si' },
                { body: 'No' },
            ],
        },
        async (ctx, ctxFn) => {
            if (ctx.body === 'Si') {
                return ctxFn.gotoFlow(stepConfirmaReprogramar)
            }
            if (ctx.body === 'No') {
                return ctxFn.gotoFlow(noConfirmaReprogramar)
            }
        }

    );



export { step7Reprogramar };
