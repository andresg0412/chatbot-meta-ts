import { addKeyword, EVENTS } from '@builderbot/bot';
import { menuFlow } from '../../menuFlow';
import { noAceptaPoliticas } from '../principal/noAceptaPoliticas';

const politicaDatosFlow = addKeyword(EVENTS.ACTION)
    .addAnswer(
        '¿Aceptas nuestras políticas de datos?',
        {
            capture: true,
            buttons: [
                { body: 'Acepto' },
                { body: 'No acepto' },
            ],
        },
        async (ctx, ctxFn) => {
            if (ctx.body === 'Acepto'){
                return ctxFn.gotoFlow(menuFlow)
            }
            if (ctx.body === 'No acepto'){
                return ctxFn.gotoFlow(noAceptaPoliticas)
            }
        }

    )

export { politicaDatosFlow };