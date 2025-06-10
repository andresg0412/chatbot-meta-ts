import { addKeyword, EVENTS } from '@builderbot/bot';
import { volverMenuPrincipal } from '../common/volverMenuPrincipal';
import { actualizarEstadoCitaCancelar } from '../../../services/apiService';

const stepConfirmaCancelarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        const citaSeleccionadaCancelar = state.getMyState().citaSeleccionadaCancelar;
        if (!citaSeleccionadaCancelar) {
            await flowDynamic('No se encontró la cita a cancelar.');
            return gotoFlow(volverMenuPrincipal);
        }
        try {
            await actualizarEstadoCitaCancelar(
                citaSeleccionadaCancelar,
                'Cancelo'
            );
            await flowDynamic('Tu cita ha sido cancelada exitosamente. Quedo atenta a tu nueva disponibilidad.');
        } catch (e) {
            await flowDynamic('Ocurrió un error al cancelar la cita. Por favor, intenta nuevamente.');
        }
        return gotoFlow(volverMenuPrincipal);
    });

export { stepConfirmaCancelarCita };
