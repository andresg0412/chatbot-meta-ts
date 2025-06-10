import { addKeyword, EVENTS } from '@builderbot/bot';
import { step6Reprogramar } from './step6Reprogramar';


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


export { step5Reprogramar };
