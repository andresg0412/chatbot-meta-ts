import { addKeyword, EVENTS } from '@builderbot/bot';
import { closeUserSession } from '../../../utils/proactiveSessionManager';

const mesajeSalida = addKeyword([EVENTS.ACTION, 'salir', 'Salir'])
    .addAnswer(
        '🌟 Agradecemos tu preferencia. Nuestra misión es orientarte en cada momento de tu vida. \nRecuerda que cuando lo desees puedes escribir *"hola"* para conversar nuevamente.',
        {
            capture: false,
        },
        async (ctx, { endFlow }) => {
            closeUserSession(ctx.from);
            return endFlow();
        }
    );

export { mesajeSalida };