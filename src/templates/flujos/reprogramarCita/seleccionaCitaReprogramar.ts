import axios from 'axios';
import { addKeyword, EVENTS } from '@builderbot/bot';
import { volverMenuPrincipal } from '../common/volverMenuPrincipal';
//import { API_KEY_SHEETBEST, URL_SHEETBEST } from '../../../services/apiService';
import { actualizarEstadoCita, crearCita } from '../../../services/apiService';
import { stepConfirmaReprogramar } from './stepConfirmaReprogramar';
import { metricFlujoFinalizado, metricCita, metricError } from '../../../utils/metrics';

function generarAgendaIdAleatorio() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 8; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

const revisarPagoConsulta = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        // LA API debe devolver si la cita ya esta pagada o no
        // condicional para verificar si la cita está pagada
        // si si esta pagada, enviar mensaje final
        // si no esta pagada, enviar mensaje de pago pendiente
        const citaReprogramada = state.getMyState().citaReprogramada;
        if (citaReprogramada) {
            return gotoFlow(volverMenuPrincipal);
        } else {
            await flowDynamic('Aún no has reprogramado tu cita. Por favor, intenta nuevamente.');
        }
    });


const noConfirmaReprogramarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        await flowDynamic('Entiendo, veamos nuevamente las fechas para que reagendes.');
        return gotoFlow(stepConfirmaReprogramar);
    });

const confirmarReprogramarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow, endFlow }) => {
        try {
            const citaAnterior = state.getMyState().citaSeleccionadaProgramada;
            const nuevaCita = state.getMyState().citaSeleccionadaHora;
            if (!citaAnterior || !nuevaCita) {
                await flowDynamic('No se encontró la información necesaria para reprogramar la cita.');
                return;
            }
            const actualizarCita = await actualizarEstadoCita(citaAnterior, 'Reprogramo', citaAnterior.PacienteID, citaAnterior.MotivoConsulta);
            if (!actualizarCita) {
                await flowDynamic('Error al actualizar la cita anterior. Por favor, intenta nuevamente.');
                return;
            }
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
                const actualizarCita = await actualizarEstadoCita(nuevaCita, 'Programada', citaAnterior.PacienteID, citaAnterior.MotivoConsulta);
                if (!actualizarCita) {
                    await flowDynamic('Error al actualizar la cita existente. Por favor, intenta nuevamente.');
                    return;
                }
            } else {
                agendaIdNueva = generarAgendaIdAleatorio();
                const bodyNueva = {
                    ...citaAnterior,
                    ...nuevaCita,
                    AgendaId: agendaIdNueva,
                    EstadoAgenda: 'Programada',
                    FechaCita: nuevaCita.FechaCita,
                    HoraCita: nuevaCita.HoraCita,
                    HoraFinal: nuevaCita.HoraFinal,
                    ProfesionalID: profesionalID,
                    Especialidad: nuevaCita.especialidad || citaAnterior.Especialidad,
                    PacienteID: citaAnterior.PacienteID,
                };
                const crearCitaProgramada = crearCita(bodyNueva);
                if (!crearCitaProgramada) {
                    await flowDynamic('Error al crear la nueva cita. Por favor, intenta nuevamente.');
                    return;
                }
            }
            metricFlujoFinalizado('reagendar');
            await flowDynamic('Tu cita se ha agendado con éxito. 📅👍');
            await state.update({ citaReprogramada: true });
            return gotoFlow(revisarPagoConsulta);
        } catch (e) {
            metricError(e, ctx.from);
            await flowDynamic('Ocurrió un error inesperado al reprogramar la cita.');
            return endFlow();
        }
    });


const preguntarConfirmarBotones = addKeyword(EVENTS.ACTION)
    .addAnswer(
        '¿Confirmas la cita? ✅',
        {
            capture: true,
            buttons: [
                { body: 'Si' },
                { body: 'No' },
            ],
        },
        async (ctx, ctxFn) => {
            if (ctx.body === 'Si') {
                return ctxFn.gotoFlow(confirmarReprogramarCita);
            }
            if (ctx.body === 'No') {
                return ctxFn.gotoFlow(noConfirmaReprogramarCita);
            }
        }
    );



const seleccionaCitaReprogramar = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        // obtener las citas que se enviaron en el paso anterior
        const citas = state.getMyState().citas;
        // obtener la respuesta del usuario
        const numeroCita = ctx.body ? parseInt(ctx.body, 10) : 0;
        if (!citas || !citas[numeroCita - 1]) {
            await flowDynamic('Número de cita inválido. Por favor, intenta nuevamente.');
            return;
        }
        const citaSeleccionada = citas[numeroCita - 1];
        await state.update({ citaSeleccionada });
        await flowDynamic(`Has seleccionado la cita del ${citaSeleccionada.fecha} a las ${citaSeleccionada.hora} en ${citaSeleccionada.lugar}.`);
        return gotoFlow(preguntarConfirmarBotones);
    });


export {
    seleccionaCitaReprogramar,
    confirmarReprogramarCita,
    revisarPagoConsulta,
    noConfirmaReprogramarCita,
    preguntarConfirmarBotones
};