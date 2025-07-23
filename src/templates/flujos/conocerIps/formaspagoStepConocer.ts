import { addKeyword, EVENTS } from '@builderbot/bot';
import { resolve } from 'path';
import { volverMenuPrincipal } from '../common';

const formaspagoStepConocer = addKeyword(['280525014', 'Formas de pago', 'formaspago', 'FORMAS DE PAGO'])
    .addAction(async (ctx, ctxFn) => {
        const pathLocal = resolve(__dirname, '../../../../assets/imgprueba.jpg');
        await ctxFn.flowDynamic([
            {
                body:'This is a video',
                media: pathLocal
            },
        ]);
        return ctxFn.gotoFlow(volverMenuPrincipal);
    });

export { formaspagoStepConocer };