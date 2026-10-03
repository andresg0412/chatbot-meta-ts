import { addKeyword, EVENTS } from '@builderbot/bot';
import { abrirOSostenerSesion } from '../../../utils/proactiveSessionTimeout';
import { join, resolve } from 'path';
import { volverMenuPrincipal } from '../common';
import { trackPaso, trackFin } from '../../../utils/trazabilidad';

const serviciosStepConocer = addKeyword(['280525011', 'Servicios', 'servicios'])
    .addAction(async (ctx, ctxFn) => {
        // T-04: entrada por keyword sin welcomeFlow: abrir (o renovar) la sesión para que el
        // "¿Que deseas hacer?" del final (volverMenuPrincipal) no termine en silencio.
        abrirOSostenerSesion(ctx.from);
        trackPaso(ctx.from, 'conocer_ips.servicios');
        trackFin(ctx.from, 'conocer_ips', 'informativo', { paso: 'conocer_ips.servicios' });
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