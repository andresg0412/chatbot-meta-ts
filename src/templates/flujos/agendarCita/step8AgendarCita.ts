import { addKeyword, EVENTS } from '@builderbot/bot';
import { step9AgendarCita } from './step9AgendarCita';
import {
    obtenerCitasDisponiblesPrimeraVez,
    obtenerCitasDisponiblesControl,
    agruparCitasPorFecha
} from '../reprogramarCita/utilsReprogramarCita';
import { consultarProfesionalesPorId } from '../../../services/profesionalesService';
import { metricError } from '../../../utils/metrics';

const step8AgendarCita = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'A continuación te mostraré las fechas disponibles para agendar tu cita:',
        {
            capture: false,
        },
        async (ctx, { state, gotoFlow, flowDynamic, endFlow }) => {
            try {
                // Obtener datos del state
                const myState = await state.getMyState();
                const tipoConsulta = myState.tipoConsultaPaciente; // 'Primera vez' o 'Control'
                const especialidad = myState.especialidadAgendarCita;
                const ProfesionalID = myState.profesionalId; // ID del profesional si es 'Control'
                let citasDisponibles = [];

                if (tipoConsulta === 'Primera vez') {
                    citasDisponibles = await obtenerCitasDisponiblesPrimeraVez(especialidad);
                } else if (tipoConsulta === 'Control') {
                    let profesionalPrevio = ProfesionalID;
                    if (!profesionalPrevio || typeof profesionalPrevio !== 'object') {
                        const profesional = await consultarProfesionalesPorId(ProfesionalID);
                        profesionalPrevio = profesional && profesional.length > 0 ? profesional[0] : null;
                    }
                    if (!profesionalPrevio) {
                        await flowDynamic('No se encontró el profesional de la cita anterior.');
                        return;
                    }
                    citasDisponibles = await obtenerCitasDisponiblesControl(profesionalPrevio);
                }

                if (!citasDisponibles.length) {
                    await flowDynamic('No hay citas disponibles para agendar en este momento. Por favor, inténtalo más tarde.');
                    return;
                }

                const { citasPorFecha, fechasOrdenadas } = agruparCitasPorFecha(citasDisponibles);
                await state.update({ citasPorFecha, fechasOrdenadas, citasDisponibles });
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
                // Aquí puedes continuar con el flujo, por ejemplo:
                return gotoFlow(step9AgendarCita);
            } catch (error) {
                metricError(error, ctx.from);
                await flowDynamic('Ocurrió un error inesperado. Por favor, intenta más tarde.');
                return endFlow();
            }
        }
    );

export { step8AgendarCita };