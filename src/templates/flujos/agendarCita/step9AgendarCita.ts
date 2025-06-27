import { addKeyword, EVENTS } from '@builderbot/bot';
import { step10AgendarCita } from './step10AgendarCita'; // Asegúrate de que este archivo exista y esté correctamente implementado
// Aquí deberías importar el siguiente paso real (ejemplo: step10AgendarCita)

const step9AgendarCita = addKeyword(EVENTS.ACTION)
    .addAnswer('Por favor, escribe el *número* de la fecha que deseas ver las horas disponibles:',
        { capture: true },
        async (ctx, { state, flowDynamic, gotoFlow }) => {
            try {
                const { fechasOrdenadas, citasPorFecha, pasoSeleccionFecha } = state.getMyState();
                const seleccion = ctx.body ? parseInt(ctx.body, 10) : 0;
                if (isNaN(seleccion)) {
                    await flowDynamic('Por favor, ingresa un número válido.');
                    return gotoFlow(step9AgendarCita);
                }
                const mostrarFechas = fechasOrdenadas.slice(pasoSeleccionFecha.inicio, pasoSeleccionFecha.fin);
                if (seleccion < 1 || seleccion > mostrarFechas.length + 1) {
                    await flowDynamic('Opción inválida. Por favor, selecciona una opción válida.');
                    return gotoFlow(step9AgendarCita);
                }
                if (seleccion === mostrarFechas.length + 1 && fechasOrdenadas.length > pasoSeleccionFecha.fin) {
                    const nuevoInicio = pasoSeleccionFecha.fin;
                    const nuevoFin = Math.min(fechasOrdenadas.length, pasoSeleccionFecha.fin + 3);
                    const nuevasFechas = fechasOrdenadas.slice(nuevoInicio, nuevoFin);
                    let mensaje = '*Más fechas con citas disponibles*:\n';
                    nuevasFechas.forEach((fecha, idx) => {
                        mensaje += `*${idx + 1}*. ${fecha}\n`;
                    });
                    if (fechasOrdenadas.length > nuevoFin) {
                        mensaje += `*${nuevasFechas.length + 1}*. Ver más\n`;
                    }
                    await flowDynamic(mensaje);
                    await state.update({ pasoSeleccionFecha: { inicio: nuevoInicio, fin: nuevoFin } });
                    return gotoFlow(step9AgendarCita);
                }
                const fechaSeleccionadaAgendar = mostrarFechas[seleccion - 1];
                const horasDisponiblesAgendar = citasPorFecha[fechaSeleccionadaAgendar];
                const mostrarHoras = horasDisponiblesAgendar.slice(0, 5);
                let mensaje = `Horas disponibles para el *${fechaSeleccionadaAgendar}*:\n`;
                mostrarHoras.forEach((cita, idx) => {
                    mensaje += `*${idx + 1}*. ${cita.HoraCita} - ${cita.HoraFinal} - ${cita.profesional}\n`;
                });
                if (horasDisponiblesAgendar.length > 5) {
                    mensaje += `*${mostrarHoras.length + 1}*. Ver más\n`;
                }
                await flowDynamic(mensaje);
                await state.update({ fechaSeleccionadaAgendar, horasDisponiblesAgendar, pasoSeleccionHora: { inicio: 0, fin: 5 } });
                return gotoFlow(step10AgendarCita);
            } catch (error) {
                console.error('Error en step9AgendarCita:', error);
                await flowDynamic('Ocurrió un error al procesar tu solicitud. Por favor, inténtalo de nuevo más tarde.');
                return gotoFlow(step9AgendarCita);
            }
        }
    );

export { step9AgendarCita };