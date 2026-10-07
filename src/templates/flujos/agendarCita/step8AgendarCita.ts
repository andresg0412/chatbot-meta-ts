import { addKeyword, EVENTS } from '@builderbot/bot';
import { step9AgendarCita } from './step9AgendarCita';
import { metricError } from '../../../utils/metrics';
import { consultarFechasCitasDisponibles } from '../../../services/apiService';
import { construirMensajeFechasDisponibles } from '../../../utils/construirMensajeSalida';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { closeUserSession } from '../../../utils/proactiveSessionManager';
import { registrarActividadBot } from '../../../services/apiService';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion } from '../../../utils/trazabilidad';
import { derivarAAsesorSinOpciones } from '../../../utils/derivarAsesor';


const step8AgendarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'agendar.s08_fechas' });
        if (!sessionValid) {
            return endFlow();
        }
        await registrarActividadBot('chat_flujo_agendar', ctx.from, {
            step: 'consulta_fechas_disponibles'
        });
    })
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
                if (!fechasOrdenadas || fechasOrdenadas.length === 0) {
                    trackErrorBackend(ctx.from, 'agendar.s08_fechas', '/chatbot/fechas');
                    await derivarAAsesorSinOpciones(ctx, flowDynamic, {
                        flujo: 'agendar', paso: 'agendar.s08_fechas', motivo: 'sin_fechas',
                    });
                    return endFlow();
                }
                await state.update({ fechasOrdenadas });
                const mostrarFechas = await fechasOrdenadas.slice(0, 3);
                const mensaje = construirMensajeFechasDisponibles(mostrarFechas, fechasOrdenadas.length, 3, '*Fechas con citas disponibles*:');
                await flowDynamic(mensaje);
                await state.update({ pasoSeleccionFecha: { inicio: 0, fin: 3 } });
                return gotoFlow(step9AgendarCita);
            } catch (error) {
                metricError(error, ctx.from);
                trackPaso(ctx.from, 'agendar.s08_fechas', 'error');
                trackFin(ctx.from, 'agendar', 'error_backend', { paso: 'agendar.s08_fechas' });
                closeUserSession(ctx.from);
                await flowDynamic('Ocurrió un error inesperado. Por favor, intenta más tarde.');
                return endFlow();
            }
        }
    );

export { step8AgendarCita };
