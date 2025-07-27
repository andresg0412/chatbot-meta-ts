import { addKeyword, EVENTS } from '@builderbot/bot';
import { volverMenuPrincipal } from '../common/volverMenuPrincipal';
//import { actualizarEstadoCitaCancelar } from '../../../services/apiService';
import { metricFlujoFinalizado, metricCita, metricError } from '../../../utils/metrics';
import { cancelarCita } from '../../../services/apiService';

const stepConfirmaCancelarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow, endFlow }) => {
        try {
            const citaSeleccionadaCancelar = state.getMyState().citaSeleccionadaCancelar;
            if (!citaSeleccionadaCancelar) {
                await flowDynamic('No se encontró la cita a cancelar.');
                return gotoFlow(volverMenuPrincipal);
            }
            const response = await cancelarCita(citaSeleccionadaCancelar.agenda_id_externa);
            metricFlujoFinalizado('cancelar');
            await flowDynamic('Tu cita ha sido cancelada exitosamente. Quedo atenta a tu nueva disponibilidad.');
        } catch (e) {
            metricError(e, ctx.from);
            await flowDynamic('Ocurrió un error al cancelar la cita. Por favor, intenta nuevamente.');
            return endFlow();
        }
        return gotoFlow(volverMenuPrincipal);
    });

export { stepConfirmaCancelarCita };
