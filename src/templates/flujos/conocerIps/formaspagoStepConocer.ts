import { addKeyword, EVENTS } from '@builderbot/bot';
import { resolve } from 'path';
import { volverMenuPrincipal } from '../common';

const formaspagoStepConocer = addKeyword(['280525014', 'Formas de pago', 'formaspago', 'FORMAS DE PAGO'])
    .addAction(async (ctx, ctxFn) => {
        const pathLocal = resolve(__dirname, '../../../../assets/formas_pago.png');
        await ctxFn.flowDynamic([
            {
                body:'Aquí tienes información sobre nuestras formas de pago',
                media: pathLocal
            },
        ]);
        return ctxFn.gotoFlow(volverMenuPrincipal);
    });

export { formaspagoStepConocer };