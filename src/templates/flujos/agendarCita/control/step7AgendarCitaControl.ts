import { addKeyword, EVENTS } from '@builderbot/bot';
import { step6AgendarCitaControl } from './step6AgendarCitaControl';
import { step8AgendarCita } from '../step8AgendarCita';
import { consultarCitasPorPacEsp } from '../../../../utils/consultarCitasPorPacEsp';
import { step4AgendarCitaControl } from './step4AgendarCitaControl';
// Aquí deberías importar los servicios reales de consulta de paciente y citas

const step7AgendarCitaControl = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, gotoFlow, flowDynamic, endFlow }) => {
        try {
            const numeroDocumento = await state.getMyState().numeroDocumentoPaciente;
            const especialidad = await state.getMyState().especialidadAgendarCita;
            //const { pacienteId, pacienteNombre, profesionalId, profesionalNombre } = await consultarCitasPorPacEsp(numeroDocumento, especialidad);
            const consultaDatos = await consultarCitasPorPacEsp(numeroDocumento, especialidad);
            if (consultaDatos === 'no paciente') {
                await flowDynamic('No se encontró un paciente con el número de documento proporcionado. Por favor, verifica el número e intenta nuevamente.');
                return gotoFlow(step6AgendarCitaControl);
            }
            if (consultaDatos === 'no citas') {
                await flowDynamic('No se encontraron citas anteriores para el paciente en la especialidad seleccionada. Por favor, verifica los datos e intenta nuevamente.');
                return gotoFlow(step4AgendarCitaControl);
            }
            if (typeof consultaDatos === 'object' && consultaDatos !== null) {
                await state.update({
                    pacienteId: consultaDatos.pacienteId,
                    pacienteNombre: consultaDatos.pacienteNombre,
                    profesionalId: consultaDatos.profesionalId,
                    profesionalNombre: consultaDatos.profesionalNombre,
                });
                await flowDynamic(`*${consultaDatos.pacienteNombre}*, a continuación te proporcionaré las citas más cercanas con el profesional *${consultaDatos.profesionalNombre}* para la especialidad *${especialidad}*.`);
                return gotoFlow(step8AgendarCita);
            }
        } catch (error) {
            console.error('Error en step7AgendarCitaControl:', error);
            await flowDynamic('Ocurrió un error al procesar tu solicitud. Por favor, inténtalo de nuevo más tarde.');
            return endFlow();
        }
    });

export { step7AgendarCitaControl };