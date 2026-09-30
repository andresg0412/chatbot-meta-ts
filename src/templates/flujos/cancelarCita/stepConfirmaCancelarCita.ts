import { addKeyword, EVENTS } from '@builderbot/bot';
import { volverMenuPrincipal } from '../common/volverMenuPrincipal';
//import { actualizarEstadoCitaCancelar } from '../../../services/apiService';
import { metricFlujoFinalizado, metricCita, metricError } from '../../../utils/metrics';
import { cancelarCita } from '../../../services/apiService';
import { closeUserSession } from '../../../utils/proactiveSessionManager';
import { registrarActividadBot } from '../../../services/apiService';
import { triggerCascadaTickNow } from '../../../utils/listaEsperaCascadaPoller';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion, flujoDesdeSeleccionMenu } from '../../../utils/trazabilidad';


const stepConfirmaCancelarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow, endFlow }) => {
        try {
            trackPaso(ctx.from, 'cancelar.confirma_cancelar');
            const citaSeleccionadaCancelar = state.getMyState().citaSeleccionadaCancelar;
            if (!citaSeleccionadaCancelar) {
                await flowDynamic('No se encontró la cita a cancelar.');
                return gotoFlow(volverMenuPrincipal);
            }
            const response = await cancelarCita(citaSeleccionadaCancelar.agenda_id_externa);
            if (!response) {
                trackErrorBackend(ctx.from, 'cancelar.confirma_cancelar', '/chatbot/cancelarcita', { siempre: true });
                trackFin(ctx.from, 'cancelar', 'error_backend', { paso: 'cancelar.confirma_cancelar', citaIdExterna: citaSeleccionadaCancelar.agenda_id_externa });
                // El backend no confirmó la cancelación: no se informa éxito, no se cuenta como flujo
                // finalizado ni se dispara la cascada de lista de espera.
                await registrarActividadBot('chat_flujo_cancelar_cita', ctx.from, {
                    step: 'error_cancelacion'
                });
                await flowDynamic('No pudimos cancelar tu cita en este momento. Por favor, intenta nuevamente más tarde o comunícate con un asesor.');
                return gotoFlow(volverMenuPrincipal);
            }
            // Path rápido de la cascada de lista de espera (Fase 2): fire-and-forget, no bloquea
            // la respuesta al paciente ni puede romper el flujo de cancelación si falla.
            try {
                triggerCascadaTickNow();
            } catch (cascadaError) {
                console.error('[stepConfirmaCancelarCita] Error disparando triggerCascadaTickNow():', cascadaError);
            }
            metricFlujoFinalizado('cancelar');
            trackFin(ctx.from, 'cancelar', 'cita_cancelada', { paso: 'cancelar.confirma_cancelar', citaIdExterna: citaSeleccionadaCancelar.agenda_id_externa });
            await registrarActividadBot('chat_flujo_cancelar_cita', ctx.from, {
                step: 'cita_cancelada'
            });
            await flowDynamic('Tu cita ha sido cancelada exitosamente. Quedo atenta a tu nueva disponibilidad.');
        } catch (e) {
            metricError(e, ctx.from);
            trackPaso(ctx.from, 'cancelar.confirma_cancelar', 'error');
            trackFin(ctx.from, 'cancelar', 'error_backend', { paso: 'cancelar.confirma_cancelar' });
            closeUserSession(ctx.from);
            await flowDynamic('Ocurrió un error al cancelar la cita. Por favor, intenta nuevamente.');
            return endFlow();
        }
        return gotoFlow(volverMenuPrincipal);
    });

export { stepConfirmaCancelarCita };
