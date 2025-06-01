import { addKeyword, EVENTS } from '@builderbot/bot';
import { isWorkingHours } from '../../../utils';
import { menuFlow } from '../../menuFlow';

const pasoAgenteFlow = addKeyword(['280525005', '5', 'chatear con agente'])
    .addAction(async (ctx, ctxFn) => {
        await ctxFn.state.update({ flujoSeleccionadoMenu: 'agente' });
        if (isWorkingHours()) {
            await ctxFn.flowDynamic('Estás dentro del horario laboral. Un agente te atenderá en breve.');
            // Aquí podrías continuar el flujo para pasar a un agente humano
        } else {
            await ctxFn.flowDynamic('Lo sentimos, no estás en horario laboral. Por favor, intenta contactarnos en nuestro horario de atención: Lunes a Viernes de 8:00 a 18:00.');
            return ctxFn.gotoFlow(menuFlow);
        }
    });

export { pasoAgenteFlow };