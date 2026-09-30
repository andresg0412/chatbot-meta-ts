import { addKeyword, EVENTS } from '@builderbot/bot';
//import { crearCita, actualizarEstadoCita } from '../../../services/apiService';
import { metricFlujoFinalizado, metricError } from '../../../utils/metrics';
import { step20AgendarCita } from './step20AgendarCita';
import { crearCita } from '../../../services/apiService';
import { closeUserSession } from '../../../utils/proactiveSessionManager';
import { registrarActividadBot } from '../../../services/apiService';
import { stepListaEsperaOptIn } from './listaEspera/stepListaEsperaOptIn';
import { isListaEsperaOptinEnabled, esTelefonoPiloto } from '../../../utils/listaEsperaFlags';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion } from '../../../utils/trazabilidad';


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
            trackPaso(ctx.from, 'agendar.s19_crear_cita');
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
                trackErrorBackend(ctx.from, 'agendar.s19_crear_cita', '/chatbot/agendar', { siempre: true });
                trackFin(ctx.from, 'agendar', 'error_backend', { paso: 'agendar.s19_crear_cita' });
                closeUserSession(ctx.from);
                await flowDynamic('Error al agendar la cita. Por favor, intenta nuevamente.');
                return endFlow();
            }
            metricFlujoFinalizado('agendar');
            // El `agenda_id`/id de Globho de la cita nueva no llega en la respuesta (bug de
            // mapRowToAgendaResponse, MEMORY.md sección 11): el flujo_fin va sin cita_id_externa.
            trackFin(ctx.from, 'agendar', 'cita_creada', { paso: 'agendar.s19_crear_cita' });
            await registrarActividadBot('chat_flujo_agendar', ctx.from, {
                step: 'confirmar_cita',
                cita: 'creada_globho'
            });
            await flowDynamic('Tu cita se ha agendado con éxito. 📅👍');
            //await flowDynamic(`Detalles de la cita:\n\n*Especialidad:* ${especialidadConTilde}\n*Fecha:* ${nuevaCita.fechacita}\n*Hora:* ${nuevaCita.horacita} - ${nuevaCita.horafinal}\n*Profesional:* ${nuevaCita.profesionalNombre}\n*Tipo de cita:* ${tipoCitaAgendarCita}`);
            await flowDynamic('Te esperamos en nuestra IPS para brindarte la mejor atención.\n ¡Gracias por confiar en nosotros! 😊');
            await state.update({ citaReprogramada: true });
            //return gotoFlow(step20AgendarCita);
            // Fase 1 de "lista de espera inteligente": tras confirmar la cita, se ofrece (opcional)
            // inscribirse para ser avisado si se libera un cupo antes. La cita ya quedó firme arriba;
            // esto no bloquea ni condiciona lo anterior.
            // Runbook B4/B7: solo si LISTA_ESPERA_OPTIN_ENABLED === 'true' y el número está en
            // LISTA_ESPERA_TELEFONOS_PILOTO (o esa lista está vacía). Si no, el flujo termina igual que
            // antes de la Fase 1 (cerrar sesión + endFlow, sin más mensajes).
            if (isListaEsperaOptinEnabled() && esTelefonoPiloto(ctx.from)) {
                trackPaso(ctx.from, 'agendar.lista_espera_optin');
                return gotoFlow(stepListaEsperaOptIn);
            }
            closeUserSession(ctx.from);
            return endFlow();
        } catch (e) {
            metricError(e, ctx.from);
            trackPaso(ctx.from, 'agendar.s19_crear_cita', 'error');
            trackFin(ctx.from, 'agendar', 'error_backend', { paso: 'agendar.s19_crear_cita' });
            closeUserSession(ctx.from);
            await flowDynamic('Ocurrió un error inesperado al reprogramar la cita.');
            return endFlow();
        }
    });


export { step19AgendarCita };