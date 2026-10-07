import { addKeyword, EVENTS } from '@builderbot/bot';
import { stepConfirmaReprogramar } from './stepConfirmaReprogramar';
import { noConfirmaReprogramar } from './noConfirmaReprogramar';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { aplicarFiltroCaptura } from '../filtroCaptura';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin } from '../../../utils/trazabilidad';

const step7Reprogramar = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'reprogramar.s07_confirmacion' });
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
            const filtro = await aplicarFiltroCaptura(ctx, ctxFn, {
                paso: 'reprogramar.s07_confirmacion', reintentar: () => ctxFn.gotoFlow(step7Reprogramar),
            });
            if (filtro) return filtro.salida;
            if (ctx.body === 'Si') {
                trackPaso(ctx.from, 'reprogramar.s07_confirmacion', 'ok');
                return ctxFn.gotoFlow(stepConfirmaReprogramar)
            }
            if (ctx.body === 'No') {
                trackPaso(ctx.from, 'reprogramar.s07_confirmacion', 'ok', { metadata: { confirma: false } });
                return ctxFn.gotoFlow(noConfirmaReprogramar)
            }
            trackNoEntendido(ctx.from, 'reprogramar.s07_confirmacion');
        }

    );



export { step7Reprogramar };
