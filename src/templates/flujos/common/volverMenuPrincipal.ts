import { addKeyword, EVENTS } from '@builderbot/bot';
import { menuFlow } from '../../menuFlow';
import { mesajeSalida } from './mensajeSalida';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion, flujoDesdeSeleccionMenu } from '../../../utils/trazabilidad';

const volverMenuPrincipal = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'comun.volver_menu' });
        if (!sessionValid) {
            return endFlow();
        }
    })
    .addAnswer(
        '¿Que deseas hacer?',
        {
            capture: true,
            buttons: [
                { body: 'Volver al menú' },
                { body: 'Salir' },
            ],
        },
        async (ctx, ctxFn) => {
            if (ctx.body === 'Volver al menú') {
                trackPaso(ctx.from, 'comun.volver_menu', 'ok');
                return ctxFn.gotoFlow(menuFlow)
            }
            if (ctx.body === 'Salir') {
                trackPaso(ctx.from, 'comun.volver_menu', 'ok', { metadata: { opcion: 'salir' } });
                return ctxFn.gotoFlow(mesajeSalida);
            }
            trackNoEntendido(ctx.from, 'comun.volver_menu');
        }
    );

export { volverMenuPrincipal };