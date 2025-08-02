import { addKeyword, EVENTS } from '@builderbot/bot';
import { resolve } from 'path';
import { volverMenuPrincipal } from '../common';

const canalesStepConocer = addKeyword(['280525017', 'Canales de atención', 'canales', 'CANALES'])
    .addAction(async (ctx, ctxFn) => {
        const pathLocal = resolve(__dirname, '../../../../assets/medios.png');
        await ctxFn.flowDynamic([
            {
                body:'Nuestros canales de atención',
                media: pathLocal
            },
        ]);
        await new Promise(resolve => setTimeout(resolve, 4000));
        return ctxFn.gotoFlow(volverMenuPrincipal);
    });

export { canalesStepConocer };