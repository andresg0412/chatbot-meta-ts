import { addKeyword, EVENTS } from '@builderbot/bot';
import { step2AgendarCita } from './step2AgendarCita';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { registrarActividadBot } from '../../../services/apiService';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion } from '../../../utils/trazabilidad';
import { limpiarClavesFlujosCita } from '../../../utils/estadoConversacion';


const step1AgendarCita = addKeyword(['280525002', 'Agendar cita', 'Agendar', 'agendar'])
    .addAction(async (ctx, { state, flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'agendar.s01_tipo_cita' });
        if (!sessionValid) {
            return endFlow();
        }
        // TBOT-02 (defensa en profundidad): cada agendamiento empieza sin paciente, documento, convenio ni
        // cita de un recorrido anterior, así que el documento siempre se pide en este recorrido (Control:
        // ct06; Primera vez, Particular y Convenio: s14/s15) antes de agendar a nombre de alguien.
        await limpiarClavesFlujosCita(state);
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
