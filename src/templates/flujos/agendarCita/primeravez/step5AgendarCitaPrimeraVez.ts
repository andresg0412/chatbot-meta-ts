import { addKeyword, EVENTS } from '@builderbot/bot';
import {
    step6AgendarCitaPrimeraVezPsicologia,
    step6AgendarCitaPrimeraVezNeuropsicologia,
    step6AgendarCitaPrimeraVezPsiquiatria,
} from './step6AgendarCitaPrimeraVez';
import { checkSessionTimeout } from '../../../../utils/proactiveSessionTimeout';

const step5AgendarCitaPrimeraVezPresencial = addKeyword(EVENTS.ACTION)
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
                { body: 'Psiquiatria' },
                { body: 'NeuroPsicologia' },
            ],
        },
        async (ctx, { state, gotoFlow }) => {
            if (ctx.body === 'Psicologia') {
                await state.update({ especialidadAgendarCita: 'Psicologia' });
                return gotoFlow(step6AgendarCitaPrimeraVezPsicologia)
            }
            if (ctx.body === 'Psiquiatria') {
                await state.update({ especialidadAgendarCita: 'Psiquiatria' });
                return gotoFlow(step6AgendarCitaPrimeraVezPsiquiatria)
            }
            if (ctx.body === 'NeuroPsicologia') {
                await state.update({ especialidadAgendarCita: 'Neuropsicologia' });
                return gotoFlow(step6AgendarCitaPrimeraVezNeuropsicologia)
            }
        }
    );

const step5AgendarCitaPrimeraVezVirtual = addKeyword(EVENTS.ACTION)
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
                { body: 'Psiquiatria' },
            ],
        },
        async (ctx, { state, gotoFlow }) => {
            if (ctx.body === 'Psicologia') {
                await state.update({ especialidadAgendarCita: 'Psicologia' });
                return gotoFlow(step6AgendarCitaPrimeraVezPsicologia)
            }
            if (ctx.body === 'Psiquiatria') {
                await state.update({ especialidadAgendarCita: 'Psiquiatria' });
                return gotoFlow(step6AgendarCitaPrimeraVezPsiquiatria)
            }
        }
    );

export {
    step5AgendarCitaPrimeraVezPresencial,
    step5AgendarCitaPrimeraVezVirtual
};