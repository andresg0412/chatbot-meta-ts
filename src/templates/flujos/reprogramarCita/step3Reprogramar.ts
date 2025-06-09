import { addKeyword, EVENTS } from '@builderbot/bot';
import { stepConfirmaReprogramar } from './stepConfirmaReprogramar';
import { noConfirmaReprogramar } from './noConfirmaReprogramar';

// Simulación de consulta a API externa para obtener citas agendadas
async function consultarCitasPorDocumento(tipoDoc: string, numeroDoc: string) {
    // Simulación de respuesta
    return [
        { id: '1', fecha: '2025-06-10', hora: '10:00 AM', lugar: 'Sede Norte' },
        { id: '2', fecha: '2025-06-15', hora: '2:00 PM', lugar: 'Sede Centro' },
    ];
}

const step7Reprogramar = addKeyword(EVENTS.ACTION)
    .addAnswer(
        '¿Estás seguto que deseas reprogramar tu cita? 🤔',
        {
            capture: true,
            buttons: [
                { body: 'Si' },
                { body: 'No' },
            ],
        },
        async (ctx, ctxFn) => {
            if (ctx.body === 'Si'){
                return ctxFn.gotoFlow(stepConfirmaReprogramar)
            }
            if (ctx.body === 'No'){
                return ctxFn.gotoFlow(noConfirmaReprogramar)
            }
        }

    );

const step6Reprogramar = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
            const numeroCita = ctx.body ? parseInt(ctx.body, 10) : 0;
            const { citasProgramadas } = state.getMyState();
            if (!citasProgramadas || !citasProgramadas[numeroCita - 1]) {
                await flowDynamic('Número de cita inválido. Por favor, intenta nuevamente.');
                return;
            }
            const citaSeleccionadaProgramada = citasProgramadas[numeroCita - 1];
            await state.update({ citaSeleccionadaProgramada });
            return gotoFlow(step7Reprogramar);
        });

const step5Reprogramar = addKeyword(EVENTS.ACTION)
    .addAnswer('Por favor, digita el número de la cita que deseas reprogramar 🗓️:',
        { capture: true },
        async (ctx, { state, flowDynamic, gotoFlow }) => {
            const esperaSeleccionCita = state.getMyState().esperaSeleccionCita;
            if (!esperaSeleccionCita) {
                await flowDynamic('No se está esperando una selección de cita. Por favor, intenta nuevamente.');
                return;
            }
            await state.update({ esperaSeleccionCita: false });
            return gotoFlow(step6Reprogramar);
        }
    )


export { step5Reprogramar, step6Reprogramar, step7Reprogramar };
