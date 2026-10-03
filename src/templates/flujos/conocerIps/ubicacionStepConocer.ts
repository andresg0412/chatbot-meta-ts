import { addKeyword, EVENTS } from '@builderbot/bot';
import { resolve } from 'path';
import { volverMenuPrincipal } from '../common';
import { trackPaso, trackFin } from '../../../utils/trazabilidad';

const ubicacionStepConocer = addKeyword(['280525015', 'Ubicación', 'ubicacion', 'UBICACIÓN'])
    .addAction(async (ctx, ctxFn) => {
        trackPaso(ctx.from, 'conocer_ips.ubicacion');
        trackFin(ctx.from, 'conocer_ips', 'informativo', { paso: 'conocer_ips.ubicacion' });
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