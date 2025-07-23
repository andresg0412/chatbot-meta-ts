import { addKeyword, EVENTS } from '@builderbot/bot';
import { step9AgendarCita } from './step9AgendarCita';
import {
    obtenerCitasDisponiblesPrimeraVez,
    obtenerCitasDisponiblesControl,
    agruparCitasPorFecha
} from '../reprogramarCita/utilsReprogramarCita';
import { consultarProfesionalesPorId } from '../../../services/profesionalesService';
import { metricError } from '../../../utils/metrics';
import { consultarFechasCitasDisponibles } from '../../../services/apiService';

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
                const fechasOrdenadas = await consultarFechasCitasDisponibles(tipoConsulta, especialidad, ProfesionalID);
                await state.update({ fechasOrdenadas });
                const mostrarFechas = fechasOrdenadas.slice(0, 3);
                let mensaje = '*Fechas con citas disponibles*:\n';
                mostrarFechas.forEach((fecha, idx) => {
                    mensaje += `*${idx + 1}*. ${fecha}\n`;
                });
                if (await fechasOrdenadas.length > 3) {
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