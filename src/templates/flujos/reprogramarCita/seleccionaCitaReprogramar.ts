import axios from 'axios';
import { addKeyword, EVENTS } from '@builderbot/bot';
import { volverMenuPrincipal } from '../common/volverMenuPrincipal';
//import { API_KEY_SHEETBEST, URL_SHEETBEST } from '../../../services/apiService';
import { reagendarCita } from '../../../services/apiService';
import { stepConfirmaReprogramar } from './stepConfirmaReprogramar';
import { metricFlujoFinalizado, metricCita, metricError } from '../../../utils/metrics';
import { CONVENIOS_SERVICIOS, ID_CONVENIOS_SERVICIOS } from '../../../constants/conveniosConstants';

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
            console.log('citaAnterior:', citaAnterior);
            console.log('nuevaCita:', nuevaCita);
            const nombreConvenio = CONVENIOS_SERVICIOS[citaAnterior.convenio] ?? 'particular';
            const idConvenio = ID_CONVENIOS_SERVICIOS[citaAnterior.convenio] ?? '1787';
            const tipoConsulta = citaAnterior.catalogo ? (citaAnterior.catalogo.toUpperCase().includes('PRIMERA VEZ') ? 'primera' : 'control') : '';
            const bodyReagendar = {
                cita_anterior: { cita_id: citaAnterior.agenda_id_externa },
                nueva_cita: {
                    especialidad: nuevaCita.especialidad,
                    fecha_cita: nuevaCita.fechacita,
                    hora_cita: nuevaCita.horacita,
                    hora_final: nuevaCita.horafinal,
                    profesional_id: nuevaCita.profesionalId,
                    paciente_id: citaAnterior.pacientes_id,
                    tipo_usuario_atencion: 'particular',
                    convenio_id: idConvenio,
                    convenio_nombre: nombreConvenio,
                    tipo_consulta_paciente: tipoConsulta,
                    tipo_cita: citaAnterior.tipo_cita === '1' ? 'presencial' : 'virtual'
                }
            }
            const response = await reagendarCita(bodyReagendar);
            if (!response) {
                await flowDynamic('Error al reagendar la cita. Por favor, intenta nuevamente.');
                return endFlow();
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



/*const seleccionaCitaReprogramar = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        try {
            // obtener las citas que se enviaron en el paso anterior
            const citas = state.getMyState().citas;
            // obtener la respuesta del usuario
            const numeroCita = ctx.body ? parseInt(ctx.body, 10) : 0;
            if (isNaN(numeroCita)) {
                await flowDynamic('Por favor, ingresa un número válido.');
                return gotoFlow(step9AgendarCita);
            }
            if (!citas || !citas[numeroCita - 1]) {
                await flowDynamic('Número de cita inválido. Por favor, intenta nuevamente.');
                return;
            }
            const citaSeleccionada = citas[numeroCita - 1];
            await state.update({ citaSeleccionada });
            await flowDynamic(`Has seleccionado la cita del ${citaSeleccionada.fecha} a las ${citaSeleccionada.hora} en ${citaSeleccionada.lugar}.`);
            return gotoFlow(preguntarConfirmarBotones);
        } catch (error) {
            console.error('Error en seleccionaCitaReprogramar:', error);
            await flowDynamic('Ocurrió un error inesperado. Por favor, intenta nuevamente más tarde.');
            return gotoFlow(volverMenuPrincipal);
        }
    });*/


export {
    //seleccionaCitaReprogramar,
    confirmarReprogramarCita,
    revisarPagoConsulta,
    noConfirmaReprogramarCita,
    preguntarConfirmarBotones
};