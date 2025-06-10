import { addKeyword, EVENTS } from '@builderbot/bot';
import { preguntarConfirmarBotones } from './seleccionaCitaReprogramar';

const stepHoraSeleccionada = addKeyword(EVENTS.ACTION)
    .addAnswer('Por favor, escribe el número de la hora que deseas seleccionar:',
        { capture: true },
        async (ctx, { state, flowDynamic, gotoFlow }) => {
            const seleccionHoraAgendar = ctx.body ? parseInt(ctx.body, 10) : 0;
            const horasDisponiblesAgendar = state.getMyState().horasDisponiblesAgendar;
            if (!horasDisponiblesAgendar || seleccionHoraAgendar < 1 || seleccionHoraAgendar > horasDisponiblesAgendar.length) {
                await flowDynamic('Opción inválida. Por favor, selecciona una hora válida.');
                return;
            }
            const citaSeleccionadaHora = horasDisponiblesAgendar[seleccionHoraAgendar - 1];
            await state.update({ citaSeleccionadaHora });
            await flowDynamic(`Has seleccionado la siguiente cita:\n*Fecha*: ${citaSeleccionadaHora.FechaCita} \n*Hora*: ${citaSeleccionadaHora.HoraCita} - ${citaSeleccionadaHora.HoraFinal} \n*Profesional*: ${citaSeleccionadaHora.profesional} \n*Especialidad*: ${citaSeleccionadaHora.Especialidad} \n*Lugar*: ${citaSeleccionadaHora.lugar}.`);
            return gotoFlow(preguntarConfirmarBotones);
        }
    );

export { stepHoraSeleccionada };
