import { addKeyword, EVENTS } from '@builderbot/bot';
import { join, resolve } from 'path';
import { volverMenuPrincipal } from '../common';

const serviciosStepConocer = addKeyword(['280525011', 'Servicios', 'servicios'])
    .addAction(async (ctx, ctxFn) => {
        const pathLocal = resolve(__dirname, '../../../../assets/pdfunoejemplo.pdf');
        await ctxFn.flowDynamic([
            {
                body:'Aquí tienes información sobre nuestros servicios',
                media: pathLocal
            },
        ]);
        return ctxFn.gotoFlow(volverMenuPrincipal);
    });

export { serviciosStepConocer };