import { addKeyword, EVENTS } from '@builderbot/bot';
import { step2AgendarCita } from './step2AgendarCita';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { isSessionExpired, expirarSesionPorInactividad } from '../../../utils/proactiveSessionManager';
import { welcomeFlow } from '../../welcomeFlow';
import { registrarActividadBot } from '../../../services/apiService';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion } from '../../../utils/trazabilidad';
import { limpiarClavesFlujosCita } from '../../../utils/estadoConversacion';


const step1AgendarCita = addKeyword(['280525002', 'Agendar cita', 'Agendar', 'agendar'])
    .addAction(async (ctx, { state, flowDynamic, endFlow, gotoFlow }) => {
        // T-04: con "agendar" como primer mensaje (sin welcomeFlow) no hay sesión y antes el flujo terminaba
        // en silencio. Aquí no se abre la sesión directamente (como en cancelar/reprogramar): agendar puede
        // registrar a un paciente nuevo, así que se pasa por la bienvenida, que pide aceptar la política de
        // datos y aplica el kill switch y el límite de intentos. Si la sesión seguía marcada activa pero
        // venció, se registra el abandono una sola vez antes.
        if (isSessionExpired(ctx.from)) {
            expirarSesionPorInactividad(ctx.from);
            return gotoFlow(welcomeFlow);
        }
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
