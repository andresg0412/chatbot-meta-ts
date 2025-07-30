import { addKeyword, EVENTS } from '@builderbot/bot';
//import { crearCita, actualizarEstadoCita } from '../../../services/apiService';
import { metricFlujoFinalizado, metricError } from '../../../utils/metrics';
import { step20AgendarCita } from './step20AgendarCita';
import { crearCita } from '../../../services/apiService';
import { closeUserSession } from '../../../utils/proactiveSessionManager';

function generarAgendaIdAleatorio() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 8; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

const step19AgendarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow, endFlow }) => {
        try {
            const nuevaCita = state.getMyState().citaSeleccionadaHora;
            const pacienteId = state.getMyState().pacienteId;
            const especialidadCita = state.getMyState().especialidadAgendarCita;
            const motivoConsulta = state.getMyState().tipoConsultaPaciente;
            const tipoCitaAgendarCita = state.getMyState().tipoCitaAgendarCita;
            const atencionPsicologica = state.getMyState().atencionPsicologica;
            const idConvenio = state.getMyState().idConvenio ?? '1787';
            const nombreServicioConvenio = state.getMyState().nombreServicioConvenio || 'PARTICULAR';
            console.log('ID del convenio:', idConvenio);
            console.log('Datos de la cita a agendar:', {
                nuevaCita,
                pacienteId,
                especialidadCita,
                motivoConsulta,
                tipoCitaAgendarCita,
                atencionPsicologica,
                idConvenio
            });
            let tipoAtencion = 'Individual';
            if (atencionPsicologica === 'psicologia_infantil' || atencionPsicologica === 'psicologia_adolescente' || atencionPsicologica === 'psicologia_adulto' || atencionPsicologica === 'psicologia_adulto_mayor') {
                tipoAtencion = 'Individual';
            } else if (atencionPsicologica === 'psicologia_pareja') {
                tipoAtencion = 'Pareja';
            } else if (atencionPsicologica === 'psicologia_familia') {
                tipoAtencion = 'Familia';
            }
            const especialidadConTilde = especialidadCita === 'Psicologia' ? 'Psicología' : especialidadCita === 'Psiquiatria' ? 'Psiquiatría' : especialidadCita === 'Neuropsicologia' ? 'Neuropsicología' : especialidadCita;
            const bodyNueva = {
                especialidad: especialidadConTilde,
                fecha_cita: nuevaCita.fechacita,
                hora_cita: nuevaCita.horacita,
                hora_final: nuevaCita.horafinal,
                profesional_id: nuevaCita.profesionalId,
                paciente_id: pacienteId,
                tipo_usuario_atencion: 'particular',
                convenio_id: idConvenio,
                convenio_nombre: nombreServicioConvenio,
                tipo_consulta_paciente: motivoConsulta === 'Primera vez' ? 'primera' : 'control',
                tipo_cita: tipoCitaAgendarCita === 'Presencial' ? 'presencial' : 'virtual',
                tipo_usuario_paciente: tipoAtencion
            };
            const response = await crearCita(bodyNueva);
            if (!response) {
                closeUserSession(ctx.from);
                await flowDynamic('Error al agendar la cita. Por favor, intenta nuevamente.');
                return endFlow();
            }
            metricFlujoFinalizado('agendar');
            await flowDynamic('Tu cita se ha agendado con éxito. 📅👍');
            await flowDynamic(`Detalles de la cita:\n\n*Especialidad:* ${especialidadConTilde}\n*Fecha:* ${nuevaCita.fechacita}\n*Hora:* ${nuevaCita.horacita} - ${nuevaCita.horafinal}\n*Profesional:* ${nuevaCita.profesionalNombre}\n*Tipo de cita:* ${tipoCitaAgendarCita}`);
            await flowDynamic('Te esperamos en nuestra IPS para brindarte la mejor atención.\n ¡Gracias por confiar en nosotros! 😊');
            await state.update({ citaReprogramada: true });
            //return gotoFlow(step20AgendarCita);
            closeUserSession(ctx.from);
            return endFlow();
        } catch (e) {
            metricError(e, ctx.from);
            closeUserSession(ctx.from);
            await flowDynamic('Ocurrió un error inesperado al reprogramar la cita.');
            return endFlow();
        }
    });


export { step19AgendarCita };