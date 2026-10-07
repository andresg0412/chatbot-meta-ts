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
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { closeUserSession } from '../../../utils/proactiveSessionManager';
import { registrarActividadBot } from '../../../services/apiService';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin } from '../../../utils/trazabilidad';
import { tipoConsultaParaReprogramar } from './tipoConsultaReprogramar';
import { esCatalogoSoloAsesor } from '../../../constants/catalogosSoloAsesor';
import { derivarAAsesorSinOpciones } from '../../../utils/derivarAsesor';


const stepConfirmaReprogramar = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'reprogramar.fechas' });
        if (!sessionValid) {
            return endFlow();
        }
    })
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
                if (esCatalogoSoloAsesor(catalogo)) {
                    trackPaso(ctx.from, 'reprogramar.fechas', 'ok', { metadata: { motivo: 'catalogo_solo_asesor' } });
                    await derivarAAsesorSinOpciones(ctx, flowDynamic, {
                        flujo: 'reprogramar',
                        paso: 'reprogramar.fechas',
                        motivo: 'catalogo_solo_asesor',
                    });
                    return endFlow();
                }
                const tipoConsulta = tipoConsultaParaReprogramar(catalogo, profesional_id);
                if (!tipoConsulta) {
                    await derivarAAsesorSinOpciones(ctx, flowDynamic, {
                        flujo: 'reprogramar',
                        paso: 'reprogramar.fechas',
                        motivo: 'sin_profesional',
                    });
                    return endFlow();
                }
                await registrarActividadBot('chat_flujo_reprogramar', ctx.from, {
                    step: 'consulta_fechas_disponibles',
                    especialidad: especialidad,
                    profesional_id: profesional_id,
                    nombre_profesional: nombre_profesional,
                    tipo_consulta: tipoConsulta
                });
                const fechasOrdenadas = await consultarFechasCitasDisponibles(tipoConsulta, especialidad, profesional_id);
                if (!fechasOrdenadas || fechasOrdenadas.length === 0) {
                    trackErrorBackend(ctx.from, 'reprogramar.fechas', '/chatbot/fechas');
                    await derivarAAsesorSinOpciones(ctx, flowDynamic, {
                        flujo: 'reprogramar', paso: 'reprogramar.fechas', motivo: 'sin_fechas',
                    });
                    return endFlow();
                }
                await state.update({ fechasOrdenadas, tipoConsultaPaciente: tipoConsulta, especialidadAgendarCita: especialidad, profesionalId: profesional_id });
                const mostrarFechas = await fechasOrdenadas.slice(0, 3);
                const mensaje = construirMensajeFechasDisponibles(mostrarFechas, fechasOrdenadas.length, 3, '*Fechas con citas disponibles*:');
                await flowDynamic(mensaje);
                await state.update({ pasoSeleccionFecha: { inicio: 0, fin: 3 } });
                return gotoFlow(stepSeleccionaFechaReprogramar);
            } catch (error) {
                metricError(error, ctx.from);
                trackPaso(ctx.from, 'reprogramar.fechas', 'error');
                trackFin(ctx.from, 'reprogramar', 'error_backend', { paso: 'reprogramar.fechas' });
                await flowDynamic('Ocurrió un error inesperado. Por favor, intenta más tarde.');
                closeUserSession(ctx.from);
                return endFlow();
            }
        }
    );

export { stepConfirmaReprogramar };
