import { addKeyword, EVENTS } from '@builderbot/bot';
import { volverMenuPrincipal } from '../common/volverMenuPrincipal';
import { stepOpcionReprogramar } from './stepOpcionReprogramar';
import { actualizarEstadoCitaCancelar } from '../../../services/apiService';

// Simulación de consulta a API externa para obtener citas agendadas
async function consultarCitasPorDocumento(tipoDoc: string, numeroDoc: string) {
    // Simulación de respuesta
    return [
        { id: '1', fecha: '2025-06-10', hora: '10:00 AM', lugar: 'Sede Norte' },
        { id: '2', fecha: '2025-06-15', hora: '2:00 PM', lugar: 'Sede Centro' },
    ];
}

const stepConfirmaCancelarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        const citaSeleccionadaCancelar = state.getMyState().citaSeleccionadaCancelar;
        if (!citaSeleccionadaCancelar) {
            await flowDynamic('No se encontró la cita a cancelar.');
            return gotoFlow(volverMenuPrincipal);
        }
        try {
            // Actualizar EstadoAgenda a 'Reprogramo' usando la función del apiService
            await actualizarEstadoCitaCancelar(
                citaSeleccionadaCancelar,
                'Reprogramo'
            );
            await flowDynamic('Tu cita ha sido cancelada exitosamente. Quedo atenta a tu nueva disponibilidad.');
        } catch (e) {
            await flowDynamic('Ocurrió un error al cancelar la cita. Por favor, intenta nuevamente.');
        }
        return gotoFlow(volverMenuPrincipal);
    });

const step7CancelarCita = addKeyword(EVENTS.ACTION)
    .addAnswer(
        '¿Estás seguro que deseas cancelar tu cita? 🤔',
        {
            capture: true,
            buttons: [
                { body: 'Si' },
                { body: 'No' },
            ],
        },
        async (ctx, { provider, state, gotoFlow }) => {
            if (ctx.body === 'Si'){
                // Ejecutar API para cancelar la cita
                return gotoFlow(stepConfirmaCancelarCita)
            }
            if (ctx.body === 'No'){
                return gotoFlow(stepOpcionReprogramar)
            }
        }

    );

const step6CancelarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
            // Obtener el número de cita seleccionado por el usuario
            const numeroCita = ctx.body ? parseInt(ctx.body, 10) : 0;
            const { citasProgramadas } = state.getMyState();
            if (!citasProgramadas || !citasProgramadas[numeroCita - 1]) {
                await flowDynamic('Número de cita inválido. Por favor, intenta nuevamente.');
                return;
            }
            const citaSeleccionadaCancelar = citasProgramadas[numeroCita - 1];
            await state.update({ citaSeleccionadaCancelar });
            return gotoFlow(step7CancelarCita);
        });

const step5CancelarCita = addKeyword(EVENTS.ACTION)
    .addAnswer('Por favor, escribe el número de la cita que deseas cancelar 🗓️:',
        { capture: true },
        async (ctx, { state, flowDynamic, gotoFlow }) => {
            const esperaSeleccionCita = state.getMyState().esperaSeleccionCita;
            if (!esperaSeleccionCita) {
                await flowDynamic('No se está esperando una selección de cita. Por favor, intenta nuevamente.');
                return;
            }
            await state.update({ esperaSeleccionCita: false });
            return gotoFlow(step6CancelarCita);
        }
    )

export { step5CancelarCita, step6CancelarCita, step7CancelarCita, stepConfirmaCancelarCita };
