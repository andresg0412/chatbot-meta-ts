import { addKeyword, EVENTS } from '@builderbot/bot';
import { step11AgendarCita } from './step11AgendarCita';
import { construirMensajeHorasDisponibles } from '../../../utils/construirMensajeSalida';

const step10AgendarCita = addKeyword(EVENTS.ACTION)
    .addAnswer('Por favor, escribe el *número* de la hora que deseas seleccionar:',
        { capture: true },
        async (ctx, { state, flowDynamic, gotoFlow }) => {
            try {
                const { citasFechaSeleccionada, pasoSeleccionHora } = state.getMyState();
                const seleccionHoraAgendar = ctx.body ? parseInt(ctx.body, 10) : 0;
                if (isNaN(seleccionHoraAgendar)) {
                    await flowDynamic('Por favor, ingresa un número válido.');
                    return gotoFlow(step10AgendarCita);
                }
                const mostrarHoras = citasFechaSeleccionada.slice(pasoSeleccionHora.inicio, pasoSeleccionHora.fin);
                if (seleccionHoraAgendar < 1 || seleccionHoraAgendar > mostrarHoras.length + 1) {
                    await flowDynamic('Opción inválida. Por favor, selecciona una opción válida.');
                    return gotoFlow(step10AgendarCita);
                }
                if (seleccionHoraAgendar === mostrarHoras.length + 1 && citasFechaSeleccionada.length > pasoSeleccionHora.fin) {
                    const nuevoInicio = pasoSeleccionHora.fin;
                    const nuevoFin = Math.min(citasFechaSeleccionada.length, pasoSeleccionHora.fin + 5);
                    const nuevasHoras = citasFechaSeleccionada.slice(nuevoInicio, nuevoFin);
                    const mensaje = construirMensajeHorasDisponibles(nuevasHoras, citasFechaSeleccionada.length, nuevoFin, `*Más citas disponibles*:`)
                    await flowDynamic(mensaje);
                    await state.update({ pasoSeleccionHora: { inicio: nuevoInicio, fin: nuevoFin } });
                    return gotoFlow(step10AgendarCita);
                }
                const citaSeleccionadaHora = mostrarHoras[seleccionHoraAgendar - 1];
                await state.update({ citaSeleccionadaHora });
                return gotoFlow(step11AgendarCita);
            } catch (error) {
                console.error('Error en step10AgendarCita:', error);
                await flowDynamic('Ocurrió un error inesperado. Por favor, intenta nuevamente.');
                return gotoFlow(step10AgendarCita);
            }
        }
    );

export { step10AgendarCita };