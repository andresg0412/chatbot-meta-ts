import { addKeyword, EVENTS } from '@builderbot/bot';
import { mesajeSalida } from '../common';
import { step23AgendarCitaExterior, step23AgendarCitaColombia } from './step23AgendarCita';

const step22AgendarCitaMedioVirtual = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'Selecciona tipo de medio virtual 💳:',
        {
            capture: true,
            buttons: [
                { body: 'Desde el exterior' },
                { body: 'Colombia' },
            ]
        },
        async (ctx, ctxFn) => {
            if (ctx.body === 'Desde el exterior') {
                return ctxFn.gotoFlow(step23AgendarCitaExterior);
            }
            if (ctx.body === 'Colombia') {
                return ctxFn.gotoFlow(step23AgendarCitaColombia);
            }
        }
    );

const step22AgendarCita = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'Tu pago podrá ser efectuado en nuestras instalaciones 24 horas antes de la consulta. ¡Estamos aquí para ayudarte!',
        { capture: false },
        async (ctx, ctxFn) => {
            return ctxFn.gotoFlow(mesajeSalida);
        }
    );

export {
    step22AgendarCita,
    step22AgendarCitaMedioVirtual,
};