import { addKeyword, EVENTS } from '@builderbot/bot';
import {
    step6AgendarCitaPrimeraVezPsicologia,
    step6AgendarCitaPrimeraVezNeuropsicologia,
    step6AgendarCitaPrimeraVezPsiquiatria,
} from './step6AgendarCitaPrimeraVez';
import { checkSessionTimeout } from '../../../../utils/proactiveSessionTimeout';
import { registrarActividadBot } from '../../../../services/apiService';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion } from '../../../../utils/trazabilidad';


const step5AgendarCitaPrimeraVezPresencial = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'agendar.pv05_especialidad' });
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
                trackPaso(ctx.from, 'agendar.pv05_especialidad', 'ok');
                await state.update({ especialidadAgendarCita: 'Psicologia' });
                await registrarActividadBot('chat_flujo_agendar', ctx.from, {
                    especialidad: 'Psicologia',
                });
                return gotoFlow(step6AgendarCitaPrimeraVezPsicologia)
            }
            if (ctx.body === 'Psiquiatria') {
                trackPaso(ctx.from, 'agendar.pv05_especialidad', 'ok');
                await state.update({ especialidadAgendarCita: 'Psiquiatria' });
                await registrarActividadBot('chat_flujo_agendar', ctx.from, {
                    especialidad: 'Psiquiatria',
                });
                return gotoFlow(step6AgendarCitaPrimeraVezPsiquiatria)
            }
            if (ctx.body === 'NeuroPsicologia') {
                trackPaso(ctx.from, 'agendar.pv05_especialidad', 'ok');
                await state.update({ especialidadAgendarCita: 'Neuropsicologia' });
                await registrarActividadBot('chat_flujo_agendar', ctx.from, {
                    especialidad: 'Neuropsicologia',
                });
                return gotoFlow(step6AgendarCitaPrimeraVezNeuropsicologia)
            }
            trackNoEntendido(ctx.from, 'agendar.pv05_especialidad');
        }
    );

const step5AgendarCitaPrimeraVezVirtual = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'agendar.pv05_especialidad' });
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
                trackPaso(ctx.from, 'agendar.pv05_especialidad', 'ok');
                await state.update({ especialidadAgendarCita: 'Psicologia' });
                await registrarActividadBot('chat_flujo_agendar', ctx.from, {
                    especialidad: 'Psicologia',
                });
                return gotoFlow(step6AgendarCitaPrimeraVezPsicologia)
            }
            if (ctx.body === 'Psiquiatria') {
                trackPaso(ctx.from, 'agendar.pv05_especialidad', 'ok');
                await state.update({ especialidadAgendarCita: 'Psiquiatria' });
                await registrarActividadBot('chat_flujo_agendar', ctx.from, {
                    especialidad: 'Psiquiatria',
                });
                return gotoFlow(step6AgendarCitaPrimeraVezPsiquiatria)
            }
            trackNoEntendido(ctx.from, 'agendar.pv05_especialidad');
        }
    );

export {
    step5AgendarCitaPrimeraVezPresencial,
    step5AgendarCitaPrimeraVezVirtual
};