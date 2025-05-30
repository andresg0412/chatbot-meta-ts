import { addKeyword, EVENTS } from '@builderbot/bot';
import { menuFlow } from '../../menuFlow';

const salidaNoConfirmaReprogramar = addKeyword(EVENTS.ACTION)
    .addAnswer(
        '¿Que deseas hacer?',
        {
            capture: true,
            buttons: [
                { body: 'Volver al menú' },
                { body: 'Salir' },
            ],
        },
        async (ctx, ctxFn) => {
            if (ctx.body === 'Volver al menú'){
                return ctxFn.gotoFlow(menuFlow)
            }
            if (ctx.body === 'Salir'){
                await ctxFn.flowDynamic('Gracias por usar nuestro servicio. ¡Hasta luego!');
                return ctxFn.endFlow();
            }
        }
    );


const noConfirmaReprogramar = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        // Obtener tipo y número de documento del estado
        const { tipoDoc, numeroDoc } = state.getMyState();
        // Simular consulta a la API
        const { citas } = state.getMyState();
        await state.update({ citas });
        if (!citas || citas.length === 0) {
            await flowDynamic('No se encontraron citas agendadas con ese documento.');
            return;
        }
        let mensaje = 'Recuerda que tienes las siguientes citas agendadas:\n';
        citas.forEach((cita, idx) => {
            mensaje += `${idx + 1}. Fecha: ${cita.fecha}, Hora: ${cita.hora}, Lugar: ${cita.lugar}\n`;
        });
        await flowDynamic(mensaje);
        return gotoFlow(salidaNoConfirmaReprogramar);
    });

export { noConfirmaReprogramar, salidaNoConfirmaReprogramar };