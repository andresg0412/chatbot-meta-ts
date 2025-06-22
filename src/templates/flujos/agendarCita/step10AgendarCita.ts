import { addKeyword, EVENTS } from '@builderbot/bot';
import { step11AgendarCita } from './step11AgendarCita';

const step10AgendarCita = addKeyword(EVENTS.ACTION)
    .addAnswer('Por favor, escribe el *número* de la hora que deseas seleccionar:',
        { capture: true },
        async (ctx, { state, flowDynamic, gotoFlow }) => {
            const { fechaSeleccionadaAgendar, horasDisponiblesAgendar, pasoSeleccionHora } = state.getMyState();
            const seleccionHoraAgendar = ctx.body ? parseInt(ctx.body, 10) : 0;
            const mostrarHoras = horasDisponiblesAgendar.slice(pasoSeleccionHora.inicio, pasoSeleccionHora.fin);
            if (seleccionHoraAgendar < 1 || seleccionHoraAgendar > mostrarHoras.length + 1) {
                await flowDynamic('Opción inválida. Por favor, selecciona una opción válida.');
                return gotoFlow(step10AgendarCita);
            }
            if (seleccionHoraAgendar === mostrarHoras.length + 1 && horasDisponiblesAgendar.length > pasoSeleccionHora.fin) {
                const nuevoInicio = pasoSeleccionHora.fin;
                const nuevoFin = Math.min(horasDisponiblesAgendar.length, pasoSeleccionHora.fin + 5);
                const nuevasHoras = horasDisponiblesAgendar.slice(nuevoInicio, nuevoFin);
                let mensaje = '*Más citas disponibles*:\n';
                nuevasHoras.forEach((cita, idx) => {
                    mensaje += `*${idx + 1}*. ${cita.HoraCita} - ${cita.HoraFinal} - ${cita.profesional}\n`;
                });
                if (horasDisponiblesAgendar.length > nuevoFin) {
                    mensaje += `*${nuevasHoras.length + 1}*. Ver más\n`;
                }
                await flowDynamic(mensaje);
                await state.update({ pasoSeleccionHora: { inicio: nuevoInicio, fin: nuevoFin } });
                return gotoFlow(step10AgendarCita);
            }
            const citaSeleccionadaHora = mostrarHoras[seleccionHoraAgendar - 1];
            await state.update({ citaSeleccionadaHora });
            //await flowDynamic(`Has seleccionado la siguiente cita:\n*Fecha*: ${citaSeleccionadaHora.FechaCita} \n*Hora*: ${citaSeleccionadaHora.HoraCita} - ${citaSeleccionadaHora.HoraFinal} \n*Profesional*: ${citaSeleccionadaHora.profesional} \n*Especialidad*: ${citaSeleccionadaHora.Especialidad} \n*Lugar*: ${citaSeleccionadaHora.lugar}.`);
            return gotoFlow(step11AgendarCita); // Asegúrate de que este paso exista y esté correctamente implementado
            //AQUI VAMOS
        }
    );

export { step10AgendarCita };