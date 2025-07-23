import { addKeyword, EVENTS } from '@builderbot/bot';
import { resolve } from 'path';
import { volverMenuPrincipal } from '../common';

const canalesStepConocer = addKeyword(['280525017', 'Canales de atención', 'canales', 'CANALES'])
    .addAction(async (ctx, ctxFn) => {
        const pathLocal = resolve(__dirname, '../../../../assets/medios.png');
        await ctxFn.flowDynamic([
            {
                body:'',
                media: pathLocal
            },
        ]);
        return ctxFn.gotoFlow(volverMenuPrincipal);
    });

export { canalesStepConocer };