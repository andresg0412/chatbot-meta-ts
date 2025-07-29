import { addKeyword, EVENTS } from '@builderbot/bot';
import { step5AgendarCitaControl } from './step5AgendarCitaControl';
import { checkSessionTimeout } from '../../../../utils/proactiveSessionTimeout';

const step4AgendarCitaControl = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow);
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
        async (ctx, { state, gotoFlow }) => {
            await state.update({ especialidadAgendarCita: ctx.body });
            return gotoFlow(step5AgendarCitaControl);
        }
    );

export { step4AgendarCitaControl };