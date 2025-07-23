import { addKeyword, EVENTS } from '@builderbot/bot';
import { step19AgendarCita } from './step19AgendarCita';
import { volverMenuPrincipal } from '../common';

const step18AgendarCita2 = addKeyword(EVENTS.ACTION)
    .addAnswer(
        '¿Confirmas la cita? ✅',
        {
            capture: true,
            buttons: [
                { body: 'Si' },
                { body: 'No' },
            ],
        },
        async (ctx, ctxFn) => {
            if (ctx.body === 'Si') {
                return ctxFn.gotoFlow(step19AgendarCita);
            }
            if (ctx.body === 'No') {
                await ctxFn.flowDynamic('Recuerda que puedes agendar tu cita cuando lo requieras.');
                return ctxFn.gotoFlow(volverMenuPrincipal);
            }
        }
    );

const step18AgendarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        const citaSeleccionadaHora = state.getMyState().citaSeleccionadaHora;
        await flowDynamic(`Has seleccionado la siguiente cita:\n*Fecha*: ${citaSeleccionadaHora.fechacita} \n*Hora*: ${citaSeleccionadaHora.horacita} \n*Profesional*: ${citaSeleccionadaHora.profesional} \n*Especialidad*: ${citaSeleccionadaHora.especialidad} \n*Lugar*: ${citaSeleccionadaHora.lugar}.`);
        return gotoFlow(step18AgendarCita2);
    })

export {
    step18AgendarCita,
    step18AgendarCita2,
};