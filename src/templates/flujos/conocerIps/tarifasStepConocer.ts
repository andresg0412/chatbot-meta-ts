import { addKeyword, EVENTS } from '@builderbot/bot';
import { resolve } from 'path';
import { volverMenuPrincipal } from '../common';

const tarifasStepConocer = addKeyword(['280525013', 'Tarifas', 'tarifas', 'TARIFAS'])
    .addAction(async (ctx, ctxFn) => {
        const pathLocal = resolve(__dirname, '../../../../assets/precios.png');
        await ctxFn.flowDynamic([
            {
                body:'*Nuestras Tarifas*',
                media: pathLocal
            },
        ]);
        await new Promise(resolve => setTimeout(resolve, 4000));
        return ctxFn.gotoFlow(volverMenuPrincipal);
    });

export { tarifasStepConocer };