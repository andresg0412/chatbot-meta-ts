import { addKeyword, EVENTS } from '@builderbot/bot';
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
import { metricError } from '../../../utils/metrics';
import { consultarFechasCitasDisponibles } from '~/services/apiService';
import { construirMensajeFechasDisponibles } from '../../../utils/construirMensajeSalida';

const stepConfirmaReprogramar = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'A continuación te mostraré las fechas disponibles:',
        {
            capture: false,
        },
        async (ctx, { state, gotoFlow, flowDynamic, endFlow }) => {
            try {
                const citaSeleccionadaProgramada = state.getMyState().citaSeleccionadaProgramada;
                if (!citaSeleccionadaProgramada) {
                    await flowDynamic('No se encontró la cita seleccionada.');
                    return;
                }
                const { especialidad, catalogo, profesional_id, nombre_profesional } = citaSeleccionadaProgramada;
                const catalogoUpper = catalogo ? catalogo.toUpperCase() : '';
                const esPrimeraVez = catalogoUpper.includes('PRIMERA VEZ');
                const esControl = catalogoUpper.includes('CONTROL');
                const tipoConsulta = esPrimeraVez ? 'Primera vez' : esControl ? 'Control' : '';
                const fechasOrdenadas = await consultarFechasCitasDisponibles(tipoConsulta, especialidad, profesional_id);
                await state.update({ fechasOrdenadas, tipoConsultaPaciente: tipoConsulta, especialidadAgendarCita: especialidad, profesionalId: profesional_id });
                const mostrarFechas = await fechasOrdenadas.slice(0, 3);
                const mensaje = construirMensajeFechasDisponibles(mostrarFechas, fechasOrdenadas.length, 3, '*Fechas con citas disponibles*:');
                await flowDynamic(mensaje);
                await state.update({ pasoSeleccionFecha: { inicio: 0, fin: 3 } });
                return gotoFlow(stepSeleccionaFechaReprogramar);
            } catch (error) {
                metricError(error, ctx.from);
                await flowDynamic('Ocurrió un error inesperado. Por favor, intenta más tarde.');
                return endFlow();
            }
        }
    );

export { stepConfirmaReprogramar };