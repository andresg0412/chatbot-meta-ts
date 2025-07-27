import { addKeyword, EVENTS } from '@builderbot/bot';
//import { crearCita, actualizarEstadoCita } from '../../../services/apiService';
import { metricFlujoFinalizado, metricError } from '../../../utils/metrics';
import { step20AgendarCita } from './step20AgendarCita';
import { crearCita } from '../../../services/apiService';

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
            console.log('Datos de la nueva cita:', nuevaCita);
            const pacienteId = state.getMyState().pacienteId;
            console.log('ID del paciente:', pacienteId);
            const especialidadCita = state.getMyState().especialidadAgendarCita;
            console.log('Especialidad de la cita:', especialidadCita);
            const motivoConsulta = state.getMyState().tipoConsultaPaciente;
            console.log('Motivo de la consulta:', motivoConsulta);
            const tipoCitaAgendarCita = state.getMyState().tipoCitaAgendarCita;
            console.log('Tipo de cita:', tipoCitaAgendarCita);
            const atencionPsicologica = state.getMyState().atencionPsicologica;
            console.log('Atención psicológica:', atencionPsicologica);
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
            // CONSTRUIR DATA U OBJETO PARA ENVIAR PETICION DE CREAR CITA
            // BODY QUE RECIBE LA API
            /*{
                "especialidad": "Psicologia",
                "fecha_cita": "2025-10-10",
                "hora_cita": "09:00",
                "hora_final": "09:45",
                "profesional_id": "A4043CF7",
                "paciente_id": "2AE9E4C9",
                "tipo_usuario_atencion": "particular",
                "convenio_id": "1787",
                "convenio_nombre": "Particular",
                "tipo_consulta_paciente": "primera",
                "tipo_cita": "presencial",
                "tipo_usuario_paciente": "adulto"
            }*/
            const bodyNueva = {
                especialidad: especialidadCita,
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
                await flowDynamic('Error al agendar la cita. Por favor, intenta nuevamente.');
                return endFlow();
            }
            metricFlujoFinalizado('agendar');
            await flowDynamic('Tu cita se ha agendado con éxito. 📅👍');
            await state.update({ citaReprogramada: true });
            return gotoFlow(step20AgendarCita);
        } catch (e) {
            metricError(e, ctx.from);
            await flowDynamic('Ocurrió un error inesperado al reprogramar la cita.');
            return endFlow();
        }
    });


export { step19AgendarCita };