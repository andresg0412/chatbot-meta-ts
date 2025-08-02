import { addKeyword, EVENTS } from '@builderbot/bot';
import { join, resolve } from 'path';
import { volverMenuPrincipal } from '../common';

const serviciosStepConocer = addKeyword(['280525011', 'Servicios', 'servicios'])
    .addAction(async (ctx, ctxFn) => {
        const pathLocal = resolve(__dirname, '../../../../assets/nuestros_servicios_ips.pdf');
        await ctxFn.flowDynamic([
            {
                body:'Nuestros servicios',
                media: pathLocal
            },
        ]);
        
        // Delay para asegurar que la imagen se envíe antes del menú principal
        await new Promise(resolve => setTimeout(resolve, 4000));
        
        return ctxFn.gotoFlow(volverMenuPrincipal);
    });

export { serviciosStepConocer };