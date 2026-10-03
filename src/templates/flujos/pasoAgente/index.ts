import { addKeyword, EVENTS } from '@builderbot/bot';
import { isWorkingHours } from '../../../utils';
import { menuFlow } from '../../menuFlow';
import { metricFlujoFinalizado, metricError } from '../../../utils/metrics';
import { closeUserSession } from '../../../utils/proactiveSessionManager';
import { registrarActividadBot } from '../../../services/apiService';
import { trackPaso, trackFin } from '../../../utils/trazabilidad';


const NUMERO_ASESOR = process.env.NUMERO_ASESOR_HUMANO || '573158070460';

const pasoAgenteFlow = addKeyword(['280525005', '5', 'chatear con agente', 'Hablar con asistente', 'Hablar con una asistente'])
    .addAction(async (ctx, ctxFn) => {
        try {
            await ctxFn.state.update({ flujoSeleccionadoMenu: 'agente' });
            trackPaso(ctx.from, 'agente.envio');
            if (isWorkingHours()) {
                trackFin(ctx.from, 'agente', 'derivado_agente', { paso: 'agente.envio' });
                metricFlujoFinalizado('agente');
                await ctxFn.flowDynamic(`Perfecto, a continuación te asignaré un asesor. Haz clic en el siguiente enlace para continuar tu atención:\n👉 *Ir al chat con asesor*: https://wa.me/${NUMERO_ASESOR}?text=Hola,%20deseo%20hablar%20con%20una%20asistente.`);
                await registrarActividadBot('chat_flujo_paso_agente', ctx.from, {
                    step: 'envio_agente'
                });
                closeUserSession(ctx.from);
                return ctxFn.endFlow();
            } else {
                trackFin(ctx.from, 'agente', 'fuera_horario', { paso: 'agente.envio' });
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