import { addKeyword, EVENTS } from '@builderbot/bot';
import { resolve } from 'path';
import { volverMenuPrincipal } from '../common';
import { trackPaso, trackFin } from '../../../utils/trazabilidad';

const conveniosStepConocer = addKeyword(['280525012', 'Convenios', 'convenios', 'CONVENIOS'])
    .addAction(async (ctx, ctxFn) => {
        trackPaso(ctx.from, 'conocer_ips.convenios');
        trackFin(ctx.from, 'conocer_ips', 'informativo', { paso: 'conocer_ips.convenios' });
        // Usar resolve para obtener una ruta absoluta a la imagen en la carpeta assets
        const pathLocal = resolve(__dirname, '../../../../assets/convenios.png');
        await ctxFn.flowDynamic([
            {
                body:'Aquí tienes información sobre nuestros convenios',
                media: pathLocal
            },
        ]);
        await new Promise(resolve => setTimeout(resolve, 4000));
        return ctxFn.gotoFlow(volverMenuPrincipal);
    });

export { conveniosStepConocer };