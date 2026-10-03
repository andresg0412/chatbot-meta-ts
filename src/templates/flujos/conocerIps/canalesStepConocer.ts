import { addKeyword, EVENTS } from '@builderbot/bot';
import { resolve } from 'path';
import { volverMenuPrincipal } from '../common';
import { trackPaso, trackFin } from '../../../utils/trazabilidad';

const canalesStepConocer = addKeyword(['280525017', 'Canales de atención', 'canales', 'CANALES'])
    .addAction(async (ctx, ctxFn) => {
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