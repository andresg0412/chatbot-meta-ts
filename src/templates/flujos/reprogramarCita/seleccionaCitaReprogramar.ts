import { addKeyword, EVENTS } from '@builderbot/bot';
import { volverMenuPrincipal } from '../common/volverMenuPrincipal';


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
    .addAction(async (ctx, { state, flowDynamic }) => {
        await flowDynamic('A continuación, te muestro nuevamente las fechas disponibles para que reagendes.');
        
    });

const confirmarReprogramarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        // Ejecutar API para cambiar de estado la cita anterior
        // ejecutar API para agendar la nueva cita
        // Si todo sale bien cambiar state y enviar mensaje de confirmación
        await flowDynamic('Tu cita ha sido reprogramada exitosamente.');
        await state.update({ citaReprogramada: true });
        return gotoFlow(revisarPagoConsulta)
    });


const preguntarConfirmarBotones = addKeyword(EVENTS.ACTION)
    .addAnswer(
        '¿Confirmas la cita?',
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
        const numeroCita = ctx.body ? parseInt(ctx.body, 10) : null;
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