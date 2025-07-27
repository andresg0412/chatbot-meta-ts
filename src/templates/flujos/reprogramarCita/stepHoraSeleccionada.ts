import { addKeyword, EVENTS } from '@builderbot/bot';
import { preguntarConfirmarBotones } from './seleccionaCitaReprogramar';
import { construirMensajeHorasDisponibles } from '../../../utils/construirMensajeSalida';

const stepHoraSeleccionada = addKeyword(EVENTS.ACTION)
    .addAnswer('Por favor, escribe el *número* de la hora que deseas seleccionar:',
        { capture: true },
        async (ctx, { state, flowDynamic, gotoFlow }) => {
            try {
                const { citasFechaSeleccionada, pasoSeleccionHora } = state.getMyState();
                const seleccionHoraAgendar = ctx.body ? parseInt(ctx.body, 10) : 0;
                if (isNaN(seleccionHoraAgendar)) {
                    await flowDynamic('Por favor, ingresa un número válido.');
                    return gotoFlow(stepHoraSeleccionada);
                }
                const mostrarHoras = citasFechaSeleccionada.slice(pasoSeleccionHora.inicio, pasoSeleccionHora.fin);
                if (seleccionHoraAgendar < 1 || seleccionHoraAgendar > mostrarHoras.length + 1) {
                    await flowDynamic('Opción inválida. Por favor, selecciona una opción válida.');
                    return gotoFlow(stepHoraSeleccionada);
                }
                if (seleccionHoraAgendar === mostrarHoras.length + 1 && citasFechaSeleccionada.length > pasoSeleccionHora.fin) {
                    const nuevoInicio = pasoSeleccionHora.fin;
                    const nuevoFin = Math.min(citasFechaSeleccionada.length, pasoSeleccionHora.fin + 5);
                    const nuevasHoras = citasFechaSeleccionada.slice(nuevoInicio, nuevoFin);
                    const mensaje = construirMensajeHorasDisponibles(nuevasHoras, citasFechaSeleccionada.length, nuevoFin, '*Más citas disponibles*:');
                    await flowDynamic(mensaje);
                    await state.update({ pasoSeleccionHora: { inicio: nuevoInicio, fin: nuevoFin } });
                    return gotoFlow(stepHoraSeleccionada);
                }
                const citaSeleccionadaHora = mostrarHoras[seleccionHoraAgendar - 1];
                await state.update({ citaSeleccionadaHora });
                await flowDynamic(`Has seleccionado la siguiente cita:\n*Fecha*: ${citaSeleccionadaHora.fechacita} \n*Hora*: ${citaSeleccionadaHora.horacita} \n*Profesional*: ${citaSeleccionadaHora.profesional} \n*Especialidad*: ${citaSeleccionadaHora.especialidad} \n*Lugar*: ${citaSeleccionadaHora.lugar}.`);
                return gotoFlow(preguntarConfirmarBotones);

            } catch (error) {
                console.error('Error en stepHoraSeleccionada:', error);
                await flowDynamic('Ocurrió un error inesperado. Por favor, intenta nuevamente.');
                return gotoFlow(stepHoraSeleccionada);
            }
        }
    );

export { stepHoraSeleccionada };
