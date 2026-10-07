import { addKeyword, EVENTS } from '@builderbot/bot';
import { preguntarConfirmarBotones } from './seleccionaCitaReprogramar';
import { construirMensajeHorasDisponibles } from '../../../utils/construirMensajeSalida';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { trackNoEntendido, trackPaso } from '../../../utils/trazabilidad';
import { aplicarFiltroCaptura } from '../filtroCaptura';
import { leerNumeroOpcion, mensajeRangoValido, pareceHora, indiceHoraEscrita } from '../../../utils/seleccionNumerica';
import { derivarAAsesorSinOpciones } from '../../../utils/derivarAsesor';

const stepHoraSeleccionada = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'reprogramar.selecciona_hora' });
        if (!sessionValid) return endFlow();
    })
    .addAnswer(
        'Por favor, escribe el *número* de la hora que deseas seleccionar:',
        { capture: true },
        async (ctx, { state, flowDynamic, gotoFlow, endFlow }) => {
            const filtro = await aplicarFiltroCaptura(ctx, { flowDynamic, endFlow }, {
                paso: 'reprogramar.selecciona_hora', reintentar: () => gotoFlow(stepHoraSeleccionada),
            });
            if (filtro) return filtro.salida;

            try {
                const { citasFechaSeleccionada, pasoSeleccionHora } = state.getMyState();
                const fin = Math.min(citasFechaSeleccionada.length, pasoSeleccionHora.fin);
                const tieneMas = citasFechaSeleccionada.length > pasoSeleccionHora.fin;
                const maximo = fin + (tieneMas ? 1 : 0);
                const numero = leerNumeroOpcion(ctx.body);
                const indiceEscrito = numero === null && pareceHora(ctx.body) ? indiceHoraEscrita(ctx.body, citasFechaSeleccionada) : null;
                const seleccion = numero ?? (indiceEscrito === null ? null : indiceEscrito + 1);
                if (seleccion === null) {
                    trackNoEntendido(ctx.from, 'reprogramar.selecciona_hora');
                    const prefijo = pareceHora(ctx.body)
                        ? 'Para elegir, escribe el *número* que aparece antes de la hora (por ejemplo, *1*).'
                        : 'Por favor, escribe solo el número de la opción.';
                    await flowDynamic(`${prefijo} ${mensajeRangoValido(maximo)}`);
                    return gotoFlow(stepHoraSeleccionada);
                }
                if (seleccion < 1 || (indiceEscrito === null && seleccion > maximo)) {
                    trackNoEntendido(ctx.from, 'reprogramar.selecciona_hora');
                    await flowDynamic(`Opción inválida. ${mensajeRangoValido(maximo)}`);
                    return gotoFlow(stepHoraSeleccionada);
                }
                if (indiceEscrito === null && seleccion === fin + 1 && tieneMas) {
                    const nuevoInicio = pasoSeleccionHora.fin;
                    const nuevoFin = Math.min(citasFechaSeleccionada.length, pasoSeleccionHora.fin + 5);
                    const nuevasHoras = citasFechaSeleccionada.slice(nuevoInicio, nuevoFin);
                    await flowDynamic(construirMensajeHorasDisponibles(
                        nuevasHoras, citasFechaSeleccionada.length, nuevoFin, '*Más citas disponibles*:', nuevoInicio
                    ));
                    await state.update({ pasoSeleccionHora: { inicio: nuevoInicio, fin: nuevoFin } });
                    return gotoFlow(stepHoraSeleccionada);
                }

                const citaSeleccionadaHora = citasFechaSeleccionada[seleccion - 1];
                trackPaso(ctx.from, 'reprogramar.selecciona_hora', 'ok');
                await state.update({ citaSeleccionadaHora, reprogramarErroresSeguidos: 0 });
                await flowDynamic(
                    `Has seleccionado la siguiente cita:\n*Fecha*: ${citaSeleccionadaHora.fechacita} ` +
                    `\n*Hora*: ${citaSeleccionadaHora.horacita} \n*Profesional*: ${citaSeleccionadaHora.profesional} ` +
                    `\n*Especialidad*: ${citaSeleccionadaHora.especialidad} \n*Lugar*: ${citaSeleccionadaHora.lugar}.`
                );
                return gotoFlow(preguntarConfirmarBotones);
            } catch (error) {
                console.error('Error en stepHoraSeleccionada:', error);
                trackPaso(ctx.from, 'reprogramar.selecciona_hora', 'error');
                const errores = Number(state.getMyState()?.reprogramarErroresSeguidos ?? 0) + 1;
                await state.update({ reprogramarErroresSeguidos: errores });
                if (errores >= 2) {
                    await derivarAAsesorSinOpciones(ctx, flowDynamic, {
                        flujo: 'reprogramar', paso: 'reprogramar.selecciona_hora', motivo: 'error_repetido',
                    });
                    return endFlow();
                }
                await flowDynamic('Ocurrió un error inesperado. Por favor, intenta nuevamente.');
                return gotoFlow(stepHoraSeleccionada);
            }
        }
    );

export { stepHoraSeleccionada };
