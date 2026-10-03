import { addKeyword, EVENTS } from '@builderbot/bot';
import { menuFlow } from '../../menuFlow';
import { noAceptaPoliticas } from '../principal/noAceptaPoliticas';
import { registrarActividadBot } from '../../../services/apiService';
import { trackNoEntendido, trackPaso } from '../../../utils/trazabilidad';

const politicaDatosFlow = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx) => {
        trackPaso(ctx.from, 'politicas.pregunta');
    })
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
                trackPaso(ctx.from, 'politicas.pregunta', 'ok');
                await registrarActividadBot('chat_acepta_politicas', ctx.from);
                return ctxFn.gotoFlow(menuFlow)
            }
            if (ctx.body === 'No acepto'){
                await registrarActividadBot('chat_no_acepta_politicas', ctx.from);
                return ctxFn.gotoFlow(noAceptaPoliticas)
            }
            trackNoEntendido(ctx.from, 'politicas.pregunta');
        }

    )

export { politicaDatosFlow };
