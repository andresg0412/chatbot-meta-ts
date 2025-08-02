import { addKeyword, EVENTS } from '@builderbot/bot';
import { resolve } from 'path';
import { volverMenuPrincipal } from '../common';

const ubicacionStepConocer = addKeyword(['280525015', 'Ubicación', 'ubicacion', 'UBICACIÓN'])
    .addAction(async (ctx, ctxFn) => {
        const pathLocal = resolve(__dirname, '../../../../assets/ubicacion.png');
        await ctxFn.flowDynamic([
            {
                body:'Av. Gonzalez Valencia # 54 - 46',
                media: pathLocal
            },
        ]);
        await new Promise(resolve => setTimeout(resolve, 4000));
        return ctxFn.gotoFlow(volverMenuPrincipal);
    });

export { ubicacionStepConocer };