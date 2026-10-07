import { addKeyword, EVENTS } from '@builderbot/bot';
import { stepHoraSeleccionada } from './stepHoraSeleccionada';
import { consultarCitasFecha, registrarActividadBot } from '../../../services/apiService';
import { construirMensajeFechasDisponibles, construirMensajeHorasDisponibles } from '../../../utils/construirMensajeSalida';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { trackErrorBackend, trackNoEntendido, trackPaso } from '../../../utils/trazabilidad';
import { aplicarFiltroCaptura } from '../filtroCaptura';
import { leerNumeroOpcion, mensajeRangoValido, pareceHora } from '../../../utils/seleccionNumerica';
import { derivarAAsesorSinOpciones } from '../../../utils/derivarAsesor';

const stepSeleccionaFechaReprogramar = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'reprogramar.selecciona_fecha' });
        if (!sessionValid) return endFlow();
        await registrarActividadBot('chat_flujo_reprogramar', ctx.from, { step: 'consulta_horas_disponibles' });
    })
    .addAnswer(
        'Por favor, escribe el *número* de la fecha que deseas ver las horas disponibles:',
        { capture: true },
        async (ctx, { state, flowDynamic, gotoFlow, endFlow }) => {
            const filtro = await aplicarFiltroCaptura(ctx, { flowDynamic, endFlow }, {
                paso: 'reprogramar.selecciona_fecha', reintentar: () => gotoFlow(stepSeleccionaFechaReprogramar),
            });
            if (filtro) return filtro.salida;

            try {
                const { fechasOrdenadas, pasoSeleccionFecha } = state.getMyState();
                const mostrarFechas = fechasOrdenadas.slice(pasoSeleccionFecha.inicio, pasoSeleccionFecha.fin);
                const tieneMas = fechasOrdenadas.length > pasoSeleccionFecha.fin;
                const maximo = mostrarFechas.length + (tieneMas ? 1 : 0);
                const seleccion = leerNumeroOpcion(ctx.body);
                if (seleccion === null) {
                    trackNoEntendido(ctx.from, 'reprogramar.selecciona_fecha');
                    const prefijo = pareceHora(ctx.body)
                        ? 'Para elegir, escribe el *número* que aparece antes de la hora (por ejemplo, *1*).'
                        : 'Por favor, escribe solo el número de la opción.';
                    await flowDynamic(`${prefijo} ${mensajeRangoValido(maximo)}`);
                    return gotoFlow(stepSeleccionaFechaReprogramar);
                }
                if (seleccion < 1 || seleccion > maximo) {
                    trackNoEntendido(ctx.from, 'reprogramar.selecciona_fecha');
                    await flowDynamic(`Opción inválida. ${mensajeRangoValido(maximo)}`);
                    return gotoFlow(stepSeleccionaFechaReprogramar);
                }
                if (seleccion === mostrarFechas.length + 1 && tieneMas) {
                    const nuevoInicio = pasoSeleccionFecha.fin;
                    const nuevoFin = Math.min(fechasOrdenadas.length, pasoSeleccionFecha.fin + 3);
                    const nuevasFechas = fechasOrdenadas.slice(nuevoInicio, nuevoFin);
                    await flowDynamic(construirMensajeFechasDisponibles(
                        nuevasFechas, fechasOrdenadas.length, nuevoFin, '*Más fechas con citas disponibles*:'
                    ));
                    await state.update({ pasoSeleccionFecha: { inicio: nuevoInicio, fin: nuevoFin } });
                    return gotoFlow(stepSeleccionaFechaReprogramar);
                }

                const fechaSeleccionadaAgendar = mostrarFechas[seleccion - 1];
                trackPaso(ctx.from, 'reprogramar.selecciona_fecha', 'ok');
                const myState = state.getMyState();
                const tipoConsulta = myState.tipoConsultaPaciente;
                const especialidad = myState.especialidadAgendarCita;
                const profesionalId = myState.profesionalId;
                if (tipoConsulta === 'Control' && !profesionalId) {
                    trackPaso(ctx.from, 'reprogramar.selecciona_fecha', 'error');
                    await derivarAAsesorSinOpciones(ctx, flowDynamic, {
                        flujo: 'reprogramar', paso: 'reprogramar.selecciona_fecha', motivo: 'sin_profesional',
                    });
                    return endFlow();
                }
                const citasFechaSeleccionada = tipoConsulta === 'Control'
                    ? await consultarCitasFecha(fechaSeleccionadaAgendar, tipoConsulta, especialidad, profesionalId)
                    : await consultarCitasFecha(fechaSeleccionadaAgendar, tipoConsulta, especialidad);

                if (!citasFechaSeleccionada || citasFechaSeleccionada.length === 0) {
                    trackErrorBackend(ctx.from, 'reprogramar.selecciona_fecha', '/chatbot/horas');
                    const diasSinHoras = Number(state.getMyState()?.reprogramarDiasSinHoras ?? 0) + 1;
                    await state.update({ reprogramarDiasSinHoras: diasSinHoras, reprogramarErroresSeguidos: 0 });
                    if (diasSinHoras >= 2) {
                        await derivarAAsesorSinOpciones(ctx, flowDynamic, {
                            flujo: 'reprogramar', paso: 'reprogramar.selecciona_fecha', motivo: 'sin_horas',
                        });
                        return endFlow();
                    }
                    await flowDynamic('Ese día ya no tiene horarios libres. Elige otra fecha:');
                    const paginaActual = fechasOrdenadas.slice(pasoSeleccionFecha.inicio, pasoSeleccionFecha.fin);
                    await flowDynamic(construirMensajeFechasDisponibles(
                        paginaActual, fechasOrdenadas.length, pasoSeleccionFecha.fin, '*Fechas con citas disponibles*:'
                    ));
                    return gotoFlow(stepSeleccionaFechaReprogramar);
                }

                const mostrarHoras = citasFechaSeleccionada.slice(0, 5);
                await flowDynamic(construirMensajeHorasDisponibles(
                    mostrarHoras, citasFechaSeleccionada.length, 5, `Horas disponibles para el *${fechaSeleccionadaAgendar}*:`
                ));
                await state.update({
                    fechaSeleccionadaAgendar, citasFechaSeleccionada, pasoSeleccionHora: { inicio: 0, fin: 5 },
                    reprogramarDiasSinHoras: 0, reprogramarErroresSeguidos: 0,
                });
                return gotoFlow(stepHoraSeleccionada);
            } catch (error) {
                console.error('Error en stepSeleccionaFechaReprogramar:', error);
                trackPaso(ctx.from, 'reprogramar.selecciona_fecha', 'error');
                const errores = Number(state.getMyState()?.reprogramarErroresSeguidos ?? 0) + 1;
                await state.update({ reprogramarErroresSeguidos: errores });
                if (errores >= 2) {
                    await derivarAAsesorSinOpciones(ctx, flowDynamic, {
                        flujo: 'reprogramar', paso: 'reprogramar.selecciona_fecha', motivo: 'error_repetido',
                    });
                    return endFlow();
                }
                await flowDynamic('Ocurrió un error inesperado. Por favor, intenta nuevamente más tarde.');
                return gotoFlow(stepSeleccionaFechaReprogramar);
            }
        }
    );

export { stepSeleccionaFechaReprogramar };
