import { addKeyword, EVENTS } from '@builderbot/bot';
import { stepConfirmaReprogramar } from './stepConfirmaReprogramar';
import { noConfirmaReprogramar } from './noConfirmaReprogramar';


const step7Reprogramar = addKeyword(EVENTS.ACTION)
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
            if (ctx.body === 'Si'){
                return ctxFn.gotoFlow(stepConfirmaReprogramar)
            }
            if (ctx.body === 'No'){
                return ctxFn.gotoFlow(noConfirmaReprogramar)
            }
        }

    );



export { step7Reprogramar };
