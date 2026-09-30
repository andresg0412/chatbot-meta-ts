import { addKeyword, EVENTS } from '@builderbot/bot';
import { closeUserSession } from '../../../utils/proactiveSessionManager';
import { registrarActividadBot } from '../../../services/apiService';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion, flujoDesdeSeleccionMenu } from '../../../utils/trazabilidad';

const mesajeSalida = addKeyword([EVENTS.ACTION, 'salir', 'Salir'])
    .addAnswer(
        '🌟 Agradecemos tu preferencia. Nuestra misión es orientarte en cada momento de tu vida. \nRecuerda que cuando lo desees puedes escribir *"hola"* para conversar nuevamente.',
        {
            capture: false,
        },
        async (ctx, { endFlow }) => {
            trackPaso(ctx.from, 'comun.salida');
            await registrarActividadBot('chat_finalizado_salir', ctx.from);
            closeUserSession(ctx.from, 'salir');
            return endFlow();
        }
    );

export { mesajeSalida };