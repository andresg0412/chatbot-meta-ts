import { addKeyword, EVENTS } from '@builderbot/bot';
import { crearCita, actualizarEstadoCita } from '../../../services/apiService';
import { metricFlujoFinalizado, metricError } from '../../../utils/metrics';
import { step20AgendarCita } from './step20AgendarCita';

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
            const horaCitaBot = new Date().toString();
            const atencionPsicologica = state.getMyState().atencionPsicologica;
            let citaExistente = false;
            let agendaIdNueva = nuevaCita.AgendaId;
            let profesionalID = nuevaCita.profesionalID || nuevaCita.ProfesionalID || nuevaCita.ProfesionalId;
            if (!profesionalID && nuevaCita.id) {
                const partes = nuevaCita.id.split('-');
                if (partes.length > 0) profesionalID = partes[0];
            }
            if (nuevaCita.EstadoAgenda && ['Cancelo', 'Reprogramo', 'ErrorHumano', 'Rechazada', 'Incompleto'].includes(nuevaCita.EstadoAgenda)) {
                citaExistente = true;
            }
            if (citaExistente) {
                const actualizarCita = await actualizarEstadoCita(nuevaCita, 'Programada', pacienteId, motivoConsulta);
                if (!actualizarCita) {
                    await flowDynamic('Error al actualizar la cita existente. Por favor, intenta nuevamente.');
                    return;
                }
            } else {
                agendaIdNueva = generarAgendaIdAleatorio();
                const bodyNueva = {
                    ...nuevaCita,
                    AgendaId: agendaIdNueva,
                    MotivoConsulta: motivoConsulta,
                    EstadoAgenda: 'Programada',
                    FechaCita: nuevaCita.FechaCita,
                    HoraCita: nuevaCita.HoraCita,
                    HoraFinal: nuevaCita.HoraFinal,
                    ProfesionalID: profesionalID,
                    Especialidad: especialidadCita,
                    PacienteID: pacienteId,
                    TipoConsulta: tipoCitaAgendarCita,
                    HoraCitaBot: horaCitaBot,
                    TipoAtención: atencionPsicologica,
                };
                const crearCitaProgramada = crearCita(bodyNueva);
                if (!crearCitaProgramada) {
                    await flowDynamic('Error al crear la nueva cita. Por favor, intenta nuevamente.');
                    return;
                }
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