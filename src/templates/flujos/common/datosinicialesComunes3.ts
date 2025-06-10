import { addKeyword, EVENTS } from '@builderbot/bot';
import { datosinicialesComunes4 } from './datosinicialesComunes4';

const datosinicialesComunes3 = addKeyword(EVENTS.ACTION)
    .addAnswer('Ahora, por favor digita tu número de documento 🔢:',
        {capture: true },
        async (ctx, { state, gotoFlow }) => {
            const numeroDoc = ctx.body;
            await state.update({ numeroDoc, esperaNumeroDoc: false, esperaSeleccionCita: true });
            return gotoFlow(datosinicialesComunes4);
        }
    );

export { datosinicialesComunes3 };
