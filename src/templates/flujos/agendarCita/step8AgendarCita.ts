import { addKeyword, EVENTS } from '@builderbot/bot';
import { step9AgendarCita } from './step9AgendarCita';
import { metricError } from '../../../utils/metrics';
import { consultarFechasCitasDisponibles } from '../../../services/apiService';
import { construirMensajeFechasDisponibles } from '../../../utils/construirMensajeSalida';

const step8AgendarCita = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'A continuación te mostraré las fechas disponibles para agendar tu cita:',
        {
            capture: false,
        },
        async (ctx, { state, gotoFlow, flowDynamic, endFlow }) => {
            try {
                const myState = await state.getMyState();
                const tipoConsulta = myState.tipoConsultaPaciente; // 'Primera vez' o 'Control'
                const especialidad = myState.especialidadAgendarCita;
                const ProfesionalID = myState.profesionalId; // ID del profesional si es 'Control'
                const fechasOrdenadas = await consultarFechasCitasDisponibles(tipoConsulta, especialidad, ProfesionalID);
                await state.update({ fechasOrdenadas });
                const mostrarFechas = await fechasOrdenadas.slice(0, 3);
                const mensaje = construirMensajeFechasDisponibles(mostrarFechas, fechasOrdenadas.length, 3, '*Fechas con citas disponibles*:');
                await flowDynamic(mensaje);
                await state.update({ pasoSeleccionFecha: { inicio: 0, fin: 3 } });
                return gotoFlow(step9AgendarCita);
            } catch (error) {
                metricError(error, ctx.from);
                await flowDynamic('Ocurrió un error inesperado. Por favor, intenta más tarde.');
                return endFlow();
            }
        }
    );

export { step8AgendarCita };