import { addKeyword, EVENTS } from '@builderbot/bot';
import { menuFlow } from '../../menuFlow';
import { datosinicialesComunes4 } from '../common';

const stepOpcionReprogramar = addKeyword(EVENTS.ACTION)
    .addAnswer(
        '¿Que deseas hacer?',
        {
            capture: true,
            buttons: [
                { body: 'Reprogramar cita' },
                { body: 'Volver al menú' },
                { body: 'Salir' },
            ],
        },
        async (ctx, { provider, state, gotoFlow, flowDynamic, endFlow }) => {
            if (ctx.body === 'Reprogramar cita'){
                await state.update({ flujoSeleccionadoMenu: 'reprogramarCita' });
                return gotoFlow(datosinicialesComunes4);
            }
            if (ctx.body === 'Volver al menú'){
                return gotoFlow(menuFlow)
            }
            if (ctx.body === 'Salir'){
                await flowDynamic('Agradecemos tu preferencia. Nuestra misión es orientarte en cada momento de tu vida. \n Recuerda que cuando lo desees puedes escribir *"hola"* para conversar nuevamente.');
                return endFlow();
            }
        }
    );

export { stepOpcionReprogramar };