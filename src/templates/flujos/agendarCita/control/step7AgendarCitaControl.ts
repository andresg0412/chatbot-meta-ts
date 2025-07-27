import { addKeyword, EVENTS } from '@builderbot/bot';
import { step6AgendarCitaControl } from './step6AgendarCitaControl';
import { step8AgendarCita } from '../step8AgendarCita';
import { consultarCitasPorPacEsp } from '../../../../utils/consultarCitasPorPacEsp';
import { step4AgendarCitaControl } from './step4AgendarCitaControl';
import { IPaciente } from '../../../../interfaces/IPacienteIn';

const step7AgendarCitaControl = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, gotoFlow, flowDynamic, endFlow }) => {
        try {
            const numeroDocumento = await state.getMyState().numeroDocumentoPaciente;
            const especialidad = await state.getMyState().especialidadAgendarCita;
            const consultaDatos: IPaciente[] = await consultarCitasPorPacEsp(numeroDocumento, especialidad);
            if (!consultaDatos || consultaDatos.length === 0) {
                await flowDynamic('No se encontraron citas anteriores relacionadas con el documento ingresado y la especialidad seleccionada. Por favor, verifica los datos e intenta nuevamente.');
                return gotoFlow(step6AgendarCitaControl);
            }
            if (Array.isArray(consultaDatos) && consultaDatos.length > 0) {
                await state.update({
                    pacienteId: consultaDatos[0].pacientes_id,
                    numeroContactoPaciente: consultaDatos[0].numero_contacto,
                    emailPaciente: consultaDatos[0].email,
                    fechaNacimientoPaciente: consultaDatos[0].fecha_nacimiento,
                    edadPaciente: consultaDatos[0].edad,
                    pacienteNombre: consultaDatos[0].nombre_paciente.trim(),
                    especialidad: consultaDatos[0].especialidad.trim(),
                    profesionalId: consultaDatos[0].profesional_id,
                    profesionalNombre: consultaDatos[0].nombre_profesional.trim(),
                });
                await flowDynamic(`*${consultaDatos[0].nombre_paciente}*, a continuación te proporcionaré las citas más cercanas con el profesional *${consultaDatos[0].nombre_profesional.trim()}* para la especialidad *${especialidad}*.`);
                return gotoFlow(step8AgendarCita);
            }
        } catch (error) {
            console.error('Error en step7AgendarCitaControl:', error);
            await flowDynamic('Ocurrió un error al procesar tu solicitud. Por favor, inténtalo de nuevo más tarde.');
            return endFlow();
        }
    });

export { step7AgendarCitaControl };