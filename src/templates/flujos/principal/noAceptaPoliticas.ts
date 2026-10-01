import { addKeyword, EVENTS } from '@builderbot/bot';
import { politicaDatosFlow } from './politicasDatos';
import { trackPaso } from '../../../utils/trazabilidad';

// Trazabilidad: `politicas.no_acepta` es final en el catálogo, pero la conversación vuelve a preguntar
// la política (el paciente todavía puede aceptar). Por eso aquí NO se cierra la sesión con
// 'no_acepta_politicas': cerrarla haría que el "Acepto" siguiente cayera en una sesión vencida.
const noAceptaPoliticas = addKeyword(EVENTS.ACTION)
    .addAnswer(
        `¡Ups! 😓 Para continuar, es importante que aceptes nuestra política de datos.`,
        { capture: false },
        async (ctx, ctxFn) => {
            trackPaso(ctx.from, 'politicas.no_acepta');
            return ctxFn.gotoFlow(politicaDatosFlow)
        }
    )

export { noAceptaPoliticas };
