import { addKeyword, EVENTS } from '@builderbot/bot';
import { abrirOSostenerSesion } from '../../../utils/proactiveSessionTimeout';
import { resolve } from 'path';
import { volverMenuPrincipal } from '../common';
import { trackPaso, trackFin } from '../../../utils/trazabilidad';

const canalesStepConocer = addKeyword(['280525017', 'Canales de atención', 'canales', 'CANALES'])
    .addAction(async (ctx, ctxFn) => {
        // T-04: entrada por keyword sin welcomeFlow: abrir (o renovar) la sesión para que el
        // "¿Que deseas hacer?" del final (volverMenuPrincipal) no termine en silencio.
        abrirOSostenerSesion(ctx.from);
        trackPaso(ctx.from, 'conocer_ips.canales');
        trackFin(ctx.from, 'conocer_ips', 'informativo', { paso: 'conocer_ips.canales' });
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