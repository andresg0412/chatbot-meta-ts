import { addKeyword, EVENTS } from '@builderbot/bot';
import { step2AgendarCita } from './step2AgendarCita';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { registrarActividadBot } from '../../../services/apiService';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion } from '../../../utils/trazabilidad';


const step1AgendarCita = addKeyword(['280525002', 'Agendar cita', 'Agendar', 'agendar'])
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'agendar.s01_tipo_cita' });
        if (!sessionValid) {
            return endFlow();
        }
        await registrarActividadBot('chat_flujo_agendar', ctx.from);
    })
    .addAnswer(
        '¿Cómo deseas agendar tu cita?',
        {
            capture: true,
            buttons: [
                { body: 'Presencial' },
                { body: 'Virtual' },
            ],
        },
        async (ctx, { state, gotoFlow }) => {
            if (ctx.body === 'Presencial') {
                trackPaso(ctx.from, 'agendar.s01_tipo_cita', 'ok');
                await state.update({ tipoCitaAgendarCita: 'Presencial' });
                await registrarActividadBot('chat_flujo_agendar', ctx.from, {
                    tipo_cita: 'presencial'
                });
                return gotoFlow(step2AgendarCita)
            }
            if (ctx.body === 'Virtual') {
                trackPaso(ctx.from, 'agendar.s01_tipo_cita', 'ok');
                await state.update({ tipoCitaAgendarCita: 'Virtual' });
                await registrarActividadBot('chat_flujo_agendar', ctx.from, {
                    tipo_cita: 'virtual'
                });
                return gotoFlow(step2AgendarCita)
            }
            trackNoEntendido(ctx.from, 'agendar.s01_tipo_cita');
        }

    );

export { step1AgendarCita };
