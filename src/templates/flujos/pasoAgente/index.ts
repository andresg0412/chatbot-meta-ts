import { addKeyword, EVENTS } from '@builderbot/bot';
import { isWorkingHours } from '../../../utils';
import { menuFlow } from '../../menuFlow';
import { metricFlujoFinalizado, metricError } from '../../../utils/metrics';
import { closeUserSession } from '../../../utils/proactiveSessionManager';
import { registrarActividadBot } from '../../../services/apiService';


const NUMERO_ASESOR = '573158070460';

const pasoAgenteFlow = addKeyword(['280525005', '5', 'chatear con agente'])
    .addAction(async (ctx, ctxFn) => {
        try {
            await ctxFn.state.update({ flujoSeleccionadoMenu: 'agente' });
            if (isWorkingHours()) {
                metricFlujoFinalizado('agente');
                await ctxFn.flowDynamic(`Perfecto, a continuación te asignaré un asesor. Haz clic en el siguiente enlace para continuar tu atención:\n👉 *Ir al chat con asesor*: https://wa.me/${NUMERO_ASESOR}?text=Hola,%20deseo%20hablar%20con%20una%20asistente.`);
                await registrarActividadBot('chat_flujo_paso_agente', ctx.from, {
                    step: 'envio_agente'
                });
                closeUserSession(ctx.from);
                return ctxFn.endFlow();
            } else {
                await ctxFn.flowDynamic('Lo sentimos, en estos momentos nuestros agentes no están disponibles. Nuestros horarios de atención son de lunes a viernes de 7 am a 7 pm y sábados de 7 am a 1 pm. 📅⏰');
                await registrarActividadBot('chat_flujo_paso_agente', ctx.from, {
                    step: 'fuera_horario'
                });
                return ctxFn.gotoFlow(menuFlow);
            }
        } catch (e) {
            metricError(e, ctx.from);
            await ctxFn.flowDynamic('Ocurrió un error inesperado.');
        }
    });

export { pasoAgenteFlow };