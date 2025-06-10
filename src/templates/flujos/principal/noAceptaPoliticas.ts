import { addKeyword, EVENTS } from '@builderbot/bot';
import { politicaDatosFlow } from './politicasDatos';

const noAceptaPoliticas = addKeyword(EVENTS.ACTION)
    .addAnswer(
        `¡Ups! 😓 Para continuar, es importante que aceptes nuestra política de datos.`,
        { capture: false },
        async (ctx, ctxFn) => {
            return ctxFn.gotoFlow(politicaDatosFlow)
        }
    )

export { noAceptaPoliticas };