import { addKeyword, EVENTS } from '@builderbot/bot';
import { volverMenuPrincipal } from '../common';

const canalesStepConocer = addKeyword(['280525017', 'Canales de atención', 'canales', 'CANALES'])
    .addAction(async (ctx, ctxFn) => {
        await ctxFn.flowDynamic('Para obtener más infromación, visita nuestra página web: ....');
        return ctxFn.gotoFlow(volverMenuPrincipal);
    });

export { canalesStepConocer };