import { addKeyword, EVENTS } from '@builderbot/bot';
import { isWorkingHours } from '../../../utils';
import { menuFlow } from '../../menuFlow';

const NUMERO_ASESOR = '573001234567';

const pasoAgenteFlow = addKeyword(['280525005', '5', 'chatear con agente'])
    .addAction(async (ctx, ctxFn) => {
        await ctxFn.state.update({ flujoSeleccionadoMenu: 'agente' });
        if (isWorkingHours()) {
            await ctxFn.flowDynamic(`Perfecto, a continuación te asignaré un asesor. Haz clic en el siguiente enlace para continuar tu atención:\n👉 *Ir al chat con asesor*: https://wa.me/${NUMERO_ASESOR}`);
            return ctxFn.endFlow();
        } else {
            await ctxFn.flowDynamic('Lo sentimos, en estos momentos nuestros agentes no están disponibles. Nuestros horarios de atención son de lunes a viernes de 8 am a 5 pm y sábados de 8 am a 3 pm. 📅⏰');
            return ctxFn.gotoFlow(menuFlow);
        }
    });

export { pasoAgenteFlow };