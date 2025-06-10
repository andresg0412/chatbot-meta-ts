import { addKeyword, EVENTS } from '@builderbot/bot';
import { stepHoraSeleccionada } from './stepHoraSeleccionada';

const stepSeleccionaFechaReprogramar = addKeyword(EVENTS.ACTION)
    .addAnswer('Por favor, escribe el *número* de la fecha que deseas ver las horas disponibles:',
        { capture: true },
        async (ctx, { state, flowDynamic, gotoFlow }) => {
            const { fechasOrdenadas, citasPorFecha, pasoSeleccionFecha } = state.getMyState();
            const seleccion = ctx.body ? parseInt(ctx.body, 10) : 0;
            const mostrarFechas = fechasOrdenadas.slice(pasoSeleccionFecha.inicio, pasoSeleccionFecha.fin);
            if (seleccion < 1 || seleccion > mostrarFechas.length + 1) {
                await flowDynamic('Opción inválida. Por favor, selecciona una opción válida.');
                return;
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
                return gotoFlow(stepSeleccionaFechaReprogramar);
            }
            const fechaSeleccionadaAgendar = mostrarFechas[seleccion - 1];
            const horasDisponiblesAgendar = citasPorFecha[fechaSeleccionadaAgendar];
            let mensaje = `Horas disponibles para el *${fechaSeleccionadaAgendar}*:\n`;
            horasDisponiblesAgendar.forEach((cita, idx) => {
                mensaje += `${idx + 1}. ${cita.HoraCita} - ${cita.HoraFinal} - ${cita.profesional} (${cita.lugar})\n`;
            });
            await flowDynamic(mensaje);
            await state.update({ fechaSeleccionadaAgendar, horasDisponiblesAgendar });
            return gotoFlow(stepHoraSeleccionada);
        }
    );

export { stepSeleccionaFechaReprogramar };
