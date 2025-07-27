import { addKeyword, EVENTS } from '@builderbot/bot';
import { stepHoraSeleccionada } from './stepHoraSeleccionada';
import { consultarCitasFecha } from '../../../services/apiService';
import { construirMensajeFechasDisponibles, construirMensajeHorasDisponibles } from '../../../utils/construirMensajeSalida';

const stepSeleccionaFechaReprogramar = addKeyword(EVENTS.ACTION)
    .addAnswer('Por favor, escribe el *número* de la fecha que deseas ver las horas disponibles:',
        { capture: true },
        async (ctx, { state, flowDynamic, gotoFlow, endFlow }) => {
            try {
                const { fechasOrdenadas, pasoSeleccionFecha } = state.getMyState();
                const seleccion = ctx.body ? parseInt(ctx.body, 10) : 0;
                if (isNaN(seleccion)) {
                    await flowDynamic('Por favor, ingresa un número válido.');
                    return gotoFlow(stepSeleccionaFechaReprogramar);
                }
                const mostrarFechas = fechasOrdenadas.slice(pasoSeleccionFecha.inicio, pasoSeleccionFecha.fin);
                if (seleccion < 1 || seleccion > mostrarFechas.length + 1) {
                    await flowDynamic('Opción inválida. Por favor, selecciona una opción válida.');
                    return gotoFlow(stepSeleccionaFechaReprogramar);
                }
                if (seleccion === mostrarFechas.length + 1 && fechasOrdenadas.length > pasoSeleccionFecha.fin) {
                    const nuevoInicio = pasoSeleccionFecha.fin;
                    const nuevoFin = Math.min(fechasOrdenadas.length, pasoSeleccionFecha.fin + 3);
                    const nuevasFechas = fechasOrdenadas.slice(nuevoInicio, nuevoFin);
                    const mensaje = construirMensajeFechasDisponibles(nuevasFechas, fechasOrdenadas.length, nuevoFin, '*Más fechas con citas disponibles*:');
                    await flowDynamic(mensaje);
                    await state.update({ pasoSeleccionFecha: { inicio: nuevoInicio, fin: nuevoFin } });
                    return gotoFlow(stepSeleccionaFechaReprogramar);
                }

                const fechaSeleccionadaAgendar = mostrarFechas[seleccion - 1];
                const myState = await state.getMyState();
                const tipoConsulta = myState.tipoConsultaPaciente; // 'Primera vez' o 'Control'
                const especialidad = myState.especialidadAgendarCita;
                const ProfesionalID = myState.profesionalId; // ID del profesional si es 'Control'
                let citasFechaSeleccionada = []
                if (tipoConsulta === 'Control') {
                    if (!ProfesionalID) {
                        await flowDynamic('No se ha seleccionado un profesional. Por favor, vuelve a intentarlo.');
                        return endFlow();
                    }
                    citasFechaSeleccionada = await consultarCitasFecha(fechaSeleccionadaAgendar, tipoConsulta, especialidad, ProfesionalID);
                }
                else {
                    citasFechaSeleccionada = await consultarCitasFecha(fechaSeleccionadaAgendar, tipoConsulta, especialidad);
                }

                const mostrarHoras = citasFechaSeleccionada.slice(0, 5);
                const mensaje = construirMensajeHorasDisponibles(mostrarHoras, citasFechaSeleccionada.length, 5, `Horas disponibles para el *${fechaSeleccionadaAgendar}*:`);
                await flowDynamic(mensaje);
                await state.update({ fechaSeleccionadaAgendar, citasFechaSeleccionada, pasoSeleccionHora: { inicio: 0, fin: 5 } });
                return gotoFlow(stepHoraSeleccionada);
            } catch (error) {
                console.error('Error en stepSeleccionaFechaReprogramar:', error);
                await flowDynamic('Ocurrió un error inesperado. Por favor, intenta nuevamente más tarde.');
                return gotoFlow(stepSeleccionaFechaReprogramar);
            }
        }
    );

export { stepSeleccionaFechaReprogramar };
