import { addKeyword, EVENTS } from '@builderbot/bot';
import { isWorkingHours } from '../../../utils';
import { menuFlow } from '../../menuFlow';
import { metricFlujoFinalizado, metricError } from '../../../utils/metrics';
import { closeUserSession } from '../../../utils/proactiveSessionManager';
import { registrarActividadBot } from '../../../services/apiService';


const NUMERO_ASESOR = process.env.NUMERO_ASESOR_HUMANO || '573158070460';

const pqrsFlow = addKeyword(['280525006', 'PQRS', 'pqrs', '6', 'peticiones', 'quejas', 'reclamos', 'solicitudes'])
    .addAction(async (ctx, ctxFn) => {
        try {
            await ctxFn.state.update({ flujoSeleccionadoMenu: 'pqrs' });
            if (isWorkingHours()) {
                metricFlujoFinalizado('pqrs');
                await ctxFn.flowDynamic(`Perfecto, a continuación te asignaré un asesor. Haz clic en el siguiente enlace para continuar tu PQRS:\n👉 *Ir al chat con agente*: https://wa.me/${NUMERO_ASESOR}?text=Hola,%20necesito%20poner%20una%20PQRS`);
                await registrarActividadBot('chat_flujo_pqrs', ctx.from, {
                    step: 'envio_agente'
                });
                closeUserSession(ctx.from);
                return ctxFn.endFlow();
            } else {
                await ctxFn.flowDynamic('Lo sentimos, en estos momentos nuestros agentes no están disponibles. Nuestros horarios de atención son de lunes a viernes de 7 am a 7 pm y sábados de 7 am a 1 pm. 📅⏰');
                await registrarActividadBot('chat_flujo_pqrs', ctx.from, {
                    step: 'fuera_horario'
                });
                return ctxFn.gotoFlow(menuFlow);
            }
        } catch (e) {
            metricError(e, ctx.from);
            await ctxFn.flowDynamic('Ocurrió un error inesperado.');
        }
    });

export { pqrsFlow };