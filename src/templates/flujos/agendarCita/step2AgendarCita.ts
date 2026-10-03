import { addKeyword, EVENTS } from '@builderbot/bot';
import { step4AgendarCitaPrimeraVez } from './primeravez/step4AgendarCitaPrimeraVez';
import { step4AgendarCitaControl } from './control/step4AgendarCitaControl';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { registrarActividadBot } from '../../../services/apiService';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion } from '../../../utils/trazabilidad';


const step2AgendarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'agendar.s02_tipo_consulta' });
        if (!sessionValid) {
            return endFlow();
        }
    })
    .addAnswer(
        'Selecciona el tipo de cita:',
        {
            capture: true,
            buttons: [
                { body: 'Primera vez' },
                { body: 'Control' },
            ],
        },
        async (ctx, { state, gotoFlow }) => {
            if (ctx.body === 'Primera vez') {
                trackPaso(ctx.from, 'agendar.s02_tipo_consulta', 'ok');
                await state.update({ tipoConsultaPaciente: 'Primera vez' });
                await registrarActividadBot('chat_flujo_agendar', ctx.from, {
                    tipo_consulta: 'primera vez'
                });
                return gotoFlow(step4AgendarCitaPrimeraVez);
            }
            if (ctx.body === 'Control') {
                trackPaso(ctx.from, 'agendar.s02_tipo_consulta', 'ok');
                await state.update({ tipoConsultaPaciente: 'Control' });
                await registrarActividadBot('chat_flujo_agendar', ctx.from, {
                    tipo_consulta: 'control'
                });
                return gotoFlow(step4AgendarCitaControl);
            }
            trackNoEntendido(ctx.from, 'agendar.s02_tipo_consulta');
        }
    );


export { step2AgendarCita };