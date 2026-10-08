import { addKeyword, EVENTS } from '@builderbot/bot';
import { isWorkingHours } from '../../../utils';
import { menuFlow } from '../../menuFlow';
import { metricFlujoFinalizado, metricError } from '../../../utils/metrics';
import { closeUserSession } from '../../../utils/proactiveSessionManager';
import { abrirOSostenerSesion } from '../../../utils/proactiveSessionTimeout';
import { registrarActividadBot } from '../../../services/apiService';
import { trackPaso, trackFin } from '../../../utils/trazabilidad';
import { OPCIONES_REGEX } from '../keywordsBotones';
import { parsearPayloadOferta } from '../../../utils/ofertaPayload';
import { registrarSolicitudAgenteOfertaCupo } from '../../../services/apiService';


const NUMERO_ASESOR = process.env.NUMERO_ASESOR_HUMANO || '573158070460';

// La última alternativa es KW_HABLAR_CON_UN_AGENTE (keywordsBotones.ts): botón "Hablar con un agente".
const pasoAgenteFlow = addKeyword('/^\\s*5\\s*$|280525005|chatear con agente|hablar con (una )?asistente|^\\s*hablar con (un )?agente\\s*$/i', OPCIONES_REGEX)
    .addAction(async (ctx, ctxFn) => {
        try {
            // D1-bis: el botón "Hablar con un agente" de la oferta de cupo trae 'LEOFE:<oferta_id>:G'. Solo se
            // anota la solicitud (la oferta sigue vigente y, si vence, no cuenta como "sin respuesta"); nunca
            // retrasa ni cambia la atención del asesor.
            const payloadOferta = parsearPayloadOferta(ctx.payload);
            if (payloadOferta?.accion === 'G') {
                void registrarSolicitudAgenteOfertaCupo(payloadOferta.ofertaId, ctx.from).catch(() => undefined);
            }
            // T-04: entrada por keyword sin welcomeFlow. Fuera de horario se vuelve al menú, que antes
            // terminaba en silencio sin sesión. Se abre (o renueva) antes de guardar claves.
            abrirOSostenerSesion(ctx.from);
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
