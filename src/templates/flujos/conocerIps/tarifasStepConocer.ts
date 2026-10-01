import { addKeyword, EVENTS } from '@builderbot/bot';
import { resolve } from 'path';
import { volverMenuPrincipal } from '../common';
import { trackPaso, trackFin } from '../../../utils/trazabilidad';

const tarifasStepConocer = addKeyword(['280525013', 'Tarifas', 'tarifas', 'TARIFAS'])
    .addAction(async (ctx, ctxFn) => {
        trackPaso(ctx.from, 'conocer_ips.tarifas');
        trackFin(ctx.from, 'conocer_ips', 'informativo', { paso: 'conocer_ips.tarifas' });
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