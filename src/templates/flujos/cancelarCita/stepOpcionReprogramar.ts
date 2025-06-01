import { addKeyword, EVENTS } from '@builderbot/bot';
import { menuFlow } from '../../menuFlow';
import { datosinicialesComunes4 } from '../common/datosInicialesComunes';

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
        async (ctx, ctxFn) => {
            if (ctx.body === 'Reprogramar cita'){
                return ctxFn.gotoFlow(datosinicialesComunes4);
            }
            if (ctx.body === 'Volver al menú'){
                return ctxFn.gotoFlow(menuFlow)
            }
            if (ctx.body === 'Salir'){
                await ctxFn.flowDynamic('Agradecemos tu preferencia. Nuestra misión es orientarte en cada momento de tu vida. \n Recuerda que cuando lo desees puedes escribir *"hola"* para conversar nuevamente.');
                return ctxFn.endFlow();
            }
        }
    );

export { stepOpcionReprogramar };