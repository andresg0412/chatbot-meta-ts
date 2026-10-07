import { addKeyword, EVENTS } from '@builderbot/bot';
import { step11AgendarCita } from './step11AgendarCita';
import { construirMensajeHorasDisponibles } from '../../../utils/construirMensajeSalida';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { registrarActividadBot } from '../../../services/apiService';
import { trackNoEntendido, trackPaso } from '../../../utils/trazabilidad';
import { aplicarFiltroCaptura } from '../filtroCaptura';
import { leerNumeroOpcion, mensajeRangoValido, pareceHora, indiceHoraEscrita } from '../../../utils/seleccionNumerica';
import { derivarAAsesorSinOpciones } from '../../../utils/derivarAsesor';

const step10AgendarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'agendar.s10_selecciona_hora' });
        if (!sessionValid) return endFlow();
        await registrarActividadBot('chat_flujo_agendar', ctx.from, { step: 'consulta_horas_disponibles' });
    })
    .addAnswer(
        'Por favor, escribe el *número* de la hora que deseas seleccionar:',
        { capture: true },
        async (ctx, { state, flowDynamic, gotoFlow, endFlow }) => {
            const filtro = await aplicarFiltroCaptura(ctx, { flowDynamic, endFlow }, {
                paso: 'agendar.s10_selecciona_hora', reintentar: () => gotoFlow(step10AgendarCita),
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
                    trackNoEntendido(ctx.from, 'agendar.s10_selecciona_hora');
                    const prefijo = pareceHora(ctx.body)
                        ? 'Para elegir, escribe el *número* que aparece antes de la hora (por ejemplo, *1*).'
                        : 'Por favor, escribe solo el número de la opción.';
                    await flowDynamic(`${prefijo} ${mensajeRangoValido(maximo)}`);
                    return gotoFlow(step10AgendarCita);
                }
                if (seleccion < 1 || (indiceEscrito === null && seleccion > maximo)) {
                    trackNoEntendido(ctx.from, 'agendar.s10_selecciona_hora');
                    await flowDynamic(`Opción inválida. ${mensajeRangoValido(maximo)}`);
                    return gotoFlow(step10AgendarCita);
                }
                if (indiceEscrito === null && seleccion === fin + 1 && tieneMas) {
                    const nuevoInicio = pasoSeleccionHora.fin;
                    const nuevoFin = Math.min(citasFechaSeleccionada.length, pasoSeleccionHora.fin + 5);
                    const nuevasHoras = citasFechaSeleccionada.slice(nuevoInicio, nuevoFin);
                    await flowDynamic(construirMensajeHorasDisponibles(
                        nuevasHoras, citasFechaSeleccionada.length, nuevoFin, '*Más citas disponibles*:', nuevoInicio
                    ));
                    await state.update({ pasoSeleccionHora: { inicio: nuevoInicio, fin: nuevoFin } });
                    return gotoFlow(step10AgendarCita);
                }

                const citaSeleccionadaHora = citasFechaSeleccionada[seleccion - 1];
                trackPaso(ctx.from, 'agendar.s10_selecciona_hora', 'ok');
                await state.update({ citaSeleccionadaHora, agendarErroresSeguidos: 0 });
                return gotoFlow(step11AgendarCita);
            } catch (error) {
                console.error('Error en step10AgendarCita:', error);
                trackPaso(ctx.from, 'agendar.s10_selecciona_hora', 'error');
                const errores = Number(state.getMyState()?.agendarErroresSeguidos ?? 0) + 1;
                await state.update({ agendarErroresSeguidos: errores });
                if (errores >= 2) {
                    await derivarAAsesorSinOpciones(ctx, flowDynamic, {
                        flujo: 'agendar', paso: 'agendar.s10_selecciona_hora', motivo: 'error_repetido',
                    });
                    return endFlow();
                }
                await flowDynamic('Ocurrió un error inesperado. Por favor, intenta nuevamente.');
                return gotoFlow(step10AgendarCita);
            }
        }
    );

export { step10AgendarCita };
