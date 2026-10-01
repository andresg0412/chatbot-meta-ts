import { addKeyword, EVENTS } from '@builderbot/bot';
import { menuFlow } from '../../menuFlow';
import { datosinicialesComunes4 } from '../common';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { closeUserSession } from '../../../utils/proactiveSessionManager';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion, flujoDesdeSeleccionMenu } from '../../../utils/trazabilidad';

const stepOpcionReprogramar = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx) => {
        trackPaso(ctx.from, 'cancelar.opcion_reprogramar');
    })
    .addAnswer(
        '¿Que deseas hacer?',
        {
            capture: true,
            buttons: [
                { body: 'Reprogramar cita' },
                { body: 'Volver al menú' },
                { body: 'Salir' },
            ],
        },
        async (ctx, { provider, state, gotoFlow, flowDynamic, endFlow }) => {
            if (ctx.body === 'Reprogramar cita') {
                trackPaso(ctx.from, 'cancelar.opcion_reprogramar', 'ok', { metadata: { opcion: 'reprogramar' } });
                // A partir de aquí el flujo en curso es reprogramar (los pasos comunes lo heredan de la sesión).
                trackPaso(ctx.from, 'reprogramar.s01_inicio', 'mostrado', { metadata: { desde: 'cancelar' } });
                await state.update({ flujoSeleccionadoMenu: 'reprogramarCita' });
                return gotoFlow(datosinicialesComunes4);
            }
            if (ctx.body === 'Volver al menú') {
                trackPaso(ctx.from, 'cancelar.opcion_reprogramar', 'ok', { metadata: { opcion: 'menu' } });
                return gotoFlow(menuFlow)
            }
            if (ctx.body === 'Salir') {
                trackPaso(ctx.from, 'cancelar.opcion_reprogramar', 'ok', { metadata: { opcion: 'salir' } });
                closeUserSession(ctx.from, 'salir');
                await flowDynamic('Agradecemos tu preferencia. Nuestra misión es orientarte en cada momento de tu vida. \n Recuerda que cuando lo desees puedes escribir *"hola"* para conversar nuevamente.');
                return endFlow();
            }
            trackNoEntendido(ctx.from, 'cancelar.opcion_reprogramar');
        }
    );

export { stepOpcionReprogramar };