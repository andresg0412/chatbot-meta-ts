import { addKeyword, EVENTS } from '@builderbot/bot';
import { seleccionaCitaReprogramar } from './seleccionaCitaReprogramar';
import {
    obtenerDuracionCitaEspecialidad,
    obtenerCitasDisponiblesPorProfesional,
    obtenerCitasDisponiblesPrimeraVez,
    obtenerCitasDisponiblesControl,
    agruparCitasPorFecha,
    getNextDateForDay,
    formatDate
} from './utilsReprogramarCita';
import { stepSeleccionaFechaReprogramar } from './stepSeleccionaFechaReprogramar';
import { consultarProfesionalesPorId } from '../../../services/profesionalesService';

const stepConfirmaReprogramar = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'A continuación te mostraré las fechas disponibles:',
        {
            capture: false,
        },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const citaSeleccionadaProgramada = state.getMyState().citaSeleccionadaProgramada;
            if (!citaSeleccionadaProgramada) {
                await flowDynamic('No se encontró la cita seleccionada.');
                return;
            }
            const { Especialidad, MotivoConsulta, ProfesionalID, profesional } = citaSeleccionadaProgramada;
            let citasDisponiblesReprogramar = [];
            if (MotivoConsulta === 'Primera Vez') {
                citasDisponiblesReprogramar = await obtenerCitasDisponiblesPrimeraVez(Especialidad);
            } else if (MotivoConsulta === 'Control') {
                let profesionalPrevio = ProfesionalID;
                if (!profesionalPrevio || typeof profesionalPrevio !== 'object') {
                    const profesional = await consultarProfesionalesPorId(ProfesionalID);
                    profesionalPrevio = profesional && profesional.length > 0 ? profesional[0] : null;
                }
                if (!profesionalPrevio) {
                    await flowDynamic('No se encontró el profesional de la cita anterior.');
                    return;
                }
                citasDisponiblesReprogramar = await obtenerCitasDisponiblesControl(profesionalPrevio);
            }
            if (!citasDisponiblesReprogramar.length) {
                await flowDynamic('No hay citas disponibles para reprogramar en este momento. Por favor, inténtalo más tarde.');
                return gotoFlow(seleccionaCitaReprogramar);
            }
            const { citasPorFecha, fechasOrdenadas } = agruparCitasPorFecha(citasDisponiblesReprogramar);
            await state.update({ citasPorFecha, fechasOrdenadas, citasDisponiblesReprogramar });
            const mostrarFechas = fechasOrdenadas.slice(0, 3);
            let mensaje = '*Fechas con citas disponibles*:\n';
            mostrarFechas.forEach((fecha, idx) => {
                mensaje += `*${idx + 1}*. ${fecha}\n`;
            });
            if (fechasOrdenadas.length > 3) {
                mensaje += `*${mostrarFechas.length + 1}*. Ver más\n`;
            }
            await flowDynamic(mensaje);
            await state.update({ pasoSeleccionFecha: { inicio: 0, fin: 3 } });
            return gotoFlow(stepSeleccionaFechaReprogramar);
        }
    );

export { stepConfirmaReprogramar };