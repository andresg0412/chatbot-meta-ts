import { addKeyword, EVENTS } from '@builderbot/bot';
import { datosinicialesComunes4 } from './datosinicialesComunes4';
import { sanitizeString, isValidDocumentNumber } from '../../../utils/sanitize';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { aplicarFiltroCaptura } from '../filtroCaptura';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion, flujoDesdeSeleccionMenu } from '../../../utils/trazabilidad';

const datosinicialesComunes3 = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state }) => {
        trackPaso(ctx.from, 'comun.c03_documento', 'mostrado', { flujo: flujoDesdeSeleccionMenu(state.getMyState()?.flujoSeleccionadoMenu) });
    })
    .addAnswer('Ahora, por favor digita tu número de documento 🔢:',
        { capture: true },
        async (ctx, fns) => {
            const { state, gotoFlow, flowDynamic, endFlow } = fns;
            const filtro = await aplicarFiltroCaptura(ctx, { flowDynamic, endFlow }, {
                paso: 'comun.c03_documento', reintentar: () => gotoFlow(datosinicialesComunes3),
            });
            if (filtro) return filtro.salida;
            const numeroDoc = sanitizeString(ctx.body, 20);
            if (!isValidDocumentNumber(numeroDoc)) {
                trackNoEntendido(ctx.from, 'comun.c03_documento', 1, { flujo: flujoDesdeSeleccionMenu(state.getMyState()?.flujoSeleccionadoMenu) });
                await flowDynamic('El número de documento ingresado no es válido. Intenta nuevamente.');
                return gotoFlow(datosinicialesComunes3);
            }
            await state.update({ numeroDoc, esperaNumeroDoc: false, esperaSeleccionCita: true });
            return gotoFlow(datosinicialesComunes4);
        }
    );

export { datosinicialesComunes3 };
