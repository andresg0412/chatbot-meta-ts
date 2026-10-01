import { addKeyword, EVENTS } from '@builderbot/bot';
import { stepOpcionReprogramar } from './stepOpcionReprogramar';
import { stepConfirmaCancelarCita } from './stepConfirmaCancelarCita';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion, flujoDesdeSeleccionMenu } from '../../../utils/trazabilidad';

const step7CancelarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx) => {
        trackPaso(ctx.from, 'cancelar.s07_confirmacion');
    })
    .addAnswer(
        '¿Estás seguro que deseas cancelar tu cita? 🤔',
        {
            capture: true,
            buttons: [
                { body: 'Si' },
                { body: 'No' },
            ],
        },
        async (ctx, { provider, state, gotoFlow }) => {
            if (ctx.body === 'Si') {
                trackPaso(ctx.from, 'cancelar.s07_confirmacion', 'ok');
                return gotoFlow(stepConfirmaCancelarCita)
            }
            if (ctx.body === 'No') {
                trackPaso(ctx.from, 'cancelar.s07_confirmacion', 'ok', { metadata: { confirma: false } });
                return gotoFlow(stepOpcionReprogramar)
            }
            trackNoEntendido(ctx.from, 'cancelar.s07_confirmacion');
        }
    );

export { step7CancelarCita };
