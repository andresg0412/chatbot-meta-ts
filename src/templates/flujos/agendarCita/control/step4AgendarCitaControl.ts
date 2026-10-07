import { addKeyword, EVENTS } from '@builderbot/bot';
import { step5AgendarCitaControl } from './step5AgendarCitaControl';
import { checkSessionTimeout } from '../../../../utils/proactiveSessionTimeout';
import { aplicarFiltroCaptura } from '../../filtroCaptura';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion } from '../../../../utils/trazabilidad';

const step4AgendarCitaControl = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'agendar.ct04_especialidad' });
        if (!sessionValid) {
            return endFlow();
        }
    })
    .addAnswer(
        'Selecciona la especialidad:',
        {
            capture: true,
            buttons: [
                { body: 'Psicologia' },
                { body: 'NeuroPsicologia' },
            ],
        },
        async (ctx, fns) => {
            const { state, gotoFlow, flowDynamic, endFlow } = fns;
            const filtro = await aplicarFiltroCaptura(ctx, { flowDynamic, endFlow }, {
                paso: 'agendar.ct04_especialidad', reintentar: () => gotoFlow(step4AgendarCitaControl),
            });
            if (filtro) return filtro.salida;
            trackPaso(ctx.from, 'agendar.ct04_especialidad', 'ok');
            await state.update({ especialidadAgendarCita: ctx.body });
            return gotoFlow(step5AgendarCitaControl);
        }
    );

export { step4AgendarCitaControl };
