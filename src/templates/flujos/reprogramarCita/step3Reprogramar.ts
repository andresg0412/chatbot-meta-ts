import { addKeyword, EVENTS } from '@builderbot/bot';
import { stepConfirmaReprogramar } from './stepConfirmaReprogramar';
import { noConfirmaReprogramar } from './noConfirmaReprogramar';

// Simulación de consulta a API externa para obtener citas agendadas
async function consultarCitasPorDocumento(tipoDoc: string, numeroDoc: string) {
    // Simulación de respuesta
    return [
        { id: '1', fecha: '2025-06-10', hora: '10:00 AM', lugar: 'Sede Norte' },
        { id: '2', fecha: '2025-06-15', hora: '2:00 PM', lugar: 'Sede Centro' },
    ];
}

const step7Reprogramar = addKeyword(EVENTS.ACTION)
    .addAnswer(
        '¿Estás seguto que deseas reprogramar tu cita?',
        {
            capture: true,
            buttons: [
                { body: 'Si' },
                { body: 'No' },
            ],
        },
        async (ctx, ctxFn) => {
            if (ctx.body === 'Si'){
                return ctxFn.gotoFlow(stepConfirmaReprogramar)
            }
            if (ctx.body === 'No'){
                return ctxFn.gotoFlow(noConfirmaReprogramar)
            }
        }

    );

const step6Reprogramar = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
            // Obtener el número de cita seleccionado por el usuario
            const numeroCita = ctx.body ? parseInt(ctx.body, 10) : 0;
            const { citas } = state.getMyState();
            if (!citas || !citas[numeroCita - 1]) {
                await flowDynamic('Número de cita inválido. Por favor, intenta nuevamente.');
                return;
            }
            const citaSeleccionada = citas[numeroCita - 1];
            await state.update({ citaSeleccionada });
            return gotoFlow(step7Reprogramar);
        });

const step5Reprogramar = addKeyword(EVENTS.ACTION)
    .addAnswer('Por favor, escribe el número de la cita que deseas reprogramar:',
        { capture: true },
        async (ctx, { state, flowDynamic, gotoFlow }) => {
            const esperaSeleccionCita = state.getMyState().esperaSeleccionCita;
            if (!esperaSeleccionCita) {
                await flowDynamic('No se está esperando una selección de cita. Por favor, intenta nuevamente.');
                return;
            }
            await state.update({ esperaSeleccionCita: false });
            return gotoFlow(step6Reprogramar);
        }
    )


// Este step captura el número de documento, lo guarda en el estado y pasa al siguiente paso (step3)
/*const step4Reprogramar = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        // Obtener tipo y número de documento del estado
        const { tipoDoc, numeroDoc } = state.getMyState();
        // Simular consulta a la API
        const citas = await consultarCitasPorDocumento(tipoDoc, numeroDoc);
        await state.update({ citas });
        if (!citas || citas.length === 0) {
            await flowDynamic('No se encontraron citas agendadas con ese documento.');
            return;
        }
        let mensaje = 'Estas son tus citas agendadas:\n';
        citas.forEach((cita, idx) => {
            mensaje += `${idx + 1}. Fecha: ${cita.fecha}, Hora: ${cita.hora}, Lugar: ${cita.lugar}\n`;
        });
        await flowDynamic(mensaje);
        await state.update({ esperaSeleccionCita: true });
        return gotoFlow(step5Reprogramar);
    });*/



// Este step captura el número de documento, lo guarda en el estado y pasa al siguiente paso (step3)
/*const step3Reprogramar = addKeyword(EVENTS.ACTION)
    .addAnswer('Ahora, por favor digita tu número de documento:',
        {capture: true },
        async (ctx, { state, gotoFlow }) => {
            const numeroDoc = ctx.body;
            console.log('Número de documento recibido:', numeroDoc);
            await state.update({ numeroDoc, esperaNumeroDoc: false });
            await state.update({ esperaSeleccionCita: true });
            return gotoFlow(step4Reprogramar);
        }
    )*/

export { step5Reprogramar, step6Reprogramar, step7Reprogramar };
