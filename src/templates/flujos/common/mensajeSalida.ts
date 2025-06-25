import { addKeyword, EVENTS } from '@builderbot/bot';

const mesajeSalida = addKeyword([EVENTS.ACTION, 'salir', 'Salir'])
    .addAnswer(
        '🌟 Agradecemos tu preferencia. Nuestra misión es orientarte en cada momento de tu vida. \nRecuerda que cuando lo desees puedes escribir *"hola"* para conversar nuevamente.',
        {
            capture: false,
        },
        async (ctx, { endFlow }) => {
            return endFlow();
        }
    );

export { mesajeSalida };