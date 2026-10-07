import { addKeyword, EVENTS } from '@builderbot/bot';
import { step10AgendarCita } from './step10AgendarCita';
import { consultarCitasFecha } from '../../../services/apiService';
import { construirMensajeFechasDisponibles, construirMensajeHorasDisponibles } from '../../../utils/construirMensajeSalida';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { trackErrorBackend, trackNoEntendido, trackPaso } from '../../../utils/trazabilidad';
import { aplicarFiltroCaptura } from '../filtroCaptura';
import { leerNumeroOpcion, mensajeRangoValido, pareceHora } from '../../../utils/seleccionNumerica';
import { derivarAAsesorSinOpciones } from '../../../utils/derivarAsesor';

const step9AgendarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'agendar.s09_selecciona_fecha' });
        if (!sessionValid) return endFlow();
    })
    .addAnswer(
        'Por favor, escribe el *número* de la fecha que deseas ver las horas disponibles:',
        { capture: true },
        async (ctx, { state, flowDynamic, gotoFlow, endFlow }) => {
            const filtro = await aplicarFiltroCaptura(ctx, { flowDynamic, endFlow }, {
                paso: 'agendar.s09_selecciona_fecha', reintentar: () => gotoFlow(step9AgendarCita),
            });
            if (filtro) return filtro.salida;

            try {
                const { fechasOrdenadas, pasoSeleccionFecha } = state.getMyState();
                const fin = Math.min(fechasOrdenadas.length, pasoSeleccionFecha.fin);
                const tieneMas = fechasOrdenadas.length > pasoSeleccionFecha.fin;
                const maximo = fin + (tieneMas ? 1 : 0);
                const seleccion = leerNumeroOpcion(ctx.body);
                if (seleccion === null) {
                    trackNoEntendido(ctx.from, 'agendar.s09_selecciona_fecha');
                    const prefijo = pareceHora(ctx.body)
                        ? 'Para elegir, escribe el *número* que aparece antes de la hora (por ejemplo, *1*).'
                        : 'Por favor, escribe solo el número de la opción.';
                    await flowDynamic(`${prefijo} ${mensajeRangoValido(maximo)}`);
                    return gotoFlow(step9AgendarCita);
                }
                if (seleccion < 1 || seleccion > maximo) {
                    trackNoEntendido(ctx.from, 'agendar.s09_selecciona_fecha');
                    await flowDynamic(`Opción inválida. ${mensajeRangoValido(maximo)}`);
                    return gotoFlow(step9AgendarCita);
                }
                if (seleccion === fin + 1 && tieneMas) {
                    const nuevoInicio = pasoSeleccionFecha.fin;
                    const nuevoFin = Math.min(fechasOrdenadas.length, pasoSeleccionFecha.fin + 3);
                    const nuevasFechas = fechasOrdenadas.slice(nuevoInicio, nuevoFin);
                    await flowDynamic(construirMensajeFechasDisponibles(
                        nuevasFechas, fechasOrdenadas.length, nuevoFin, '*Más fechas con citas disponibles*:', nuevoInicio
                    ));
                    await state.update({ pasoSeleccionFecha: { inicio: nuevoInicio, fin: nuevoFin } });
                    return gotoFlow(step9AgendarCita);
                }

                const fechaSeleccionadaAgendar = fechasOrdenadas[seleccion - 1];
                trackPaso(ctx.from, 'agendar.s09_selecciona_fecha', 'ok');
                const myState = state.getMyState();
                const tipoConsulta = myState.tipoConsultaPaciente;
                const especialidad = myState.especialidadAgendarCita;
                const profesionalId = myState.profesionalId;
                if (tipoConsulta === 'Control' && !profesionalId) {
                    await derivarAAsesorSinOpciones(ctx, flowDynamic, {
                        flujo: 'agendar', paso: 'agendar.s09_selecciona_fecha', motivo: 'sin_profesional',
                    });
                    return endFlow();
                }
                const citasFechaSeleccionada = tipoConsulta === 'Control'
                    ? await consultarCitasFecha(fechaSeleccionadaAgendar, tipoConsulta, especialidad, profesionalId)
                    : await consultarCitasFecha(fechaSeleccionadaAgendar, tipoConsulta, especialidad);

                if (!citasFechaSeleccionada || citasFechaSeleccionada.length === 0) {
                    trackErrorBackend(ctx.from, 'agendar.s09_selecciona_fecha', '/chatbot/horas');
                    const diasSinHoras = Number(state.getMyState()?.agendarDiasSinHoras ?? 0) + 1;
                    await state.update({ agendarDiasSinHoras: diasSinHoras, agendarErroresSeguidos: 0 });
                    if (diasSinHoras >= 2) {
                        await derivarAAsesorSinOpciones(ctx, flowDynamic, {
                            flujo: 'agendar', paso: 'agendar.s09_selecciona_fecha', motivo: 'sin_horas',
                        });
                        return endFlow();
                    }
                    await flowDynamic('Ese día ya no tiene horarios libres. Elige otra fecha:');
                    const paginaActual = fechasOrdenadas.slice(pasoSeleccionFecha.inicio, pasoSeleccionFecha.fin);
                    await flowDynamic(construirMensajeFechasDisponibles(
                        paginaActual, fechasOrdenadas.length, pasoSeleccionFecha.fin, '*Fechas con citas disponibles*:', pasoSeleccionFecha.inicio
                    ));
                    return gotoFlow(step9AgendarCita);
                }

                const mostrarHoras = citasFechaSeleccionada.slice(0, 5);
                await flowDynamic(construirMensajeHorasDisponibles(
                    mostrarHoras, citasFechaSeleccionada.length, 5, `Horas disponibles para el *${fechaSeleccionadaAgendar}*:`
                ));
                await state.update({
                    fechaSeleccionadaAgendar, citasFechaSeleccionada, pasoSeleccionHora: { inicio: 0, fin: 5 },
                    agendarDiasSinHoras: 0, agendarErroresSeguidos: 0,
                });
                return gotoFlow(step10AgendarCita);
            } catch (error) {
                console.error('Error en step9AgendarCita:', error);
                trackPaso(ctx.from, 'agendar.s09_selecciona_fecha', 'error');
                const errores = Number(state.getMyState()?.agendarErroresSeguidos ?? 0) + 1;
                await state.update({ agendarErroresSeguidos: errores });
                if (errores >= 2) {
                    await derivarAAsesorSinOpciones(ctx, flowDynamic, {
                        flujo: 'agendar', paso: 'agendar.s09_selecciona_fecha', motivo: 'error_repetido',
                    });
                    return endFlow();
                }
                await flowDynamic('Ocurrió un error al procesar tu solicitud. Por favor, inténtalo de nuevo más tarde.');
                return gotoFlow(step9AgendarCita);
            }
        }
    );

export { step9AgendarCita };
