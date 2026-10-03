import { addKeyword, EVENTS } from '@builderbot/bot';
import { abrirOSostenerSesion } from '../../../utils/proactiveSessionTimeout';
import { resolve } from 'path';
import { volverMenuPrincipal } from '../common';
import { trackPaso, trackFin } from '../../../utils/trazabilidad';

const formaspagoStepConocer = addKeyword(['280525014', 'Formas de pago', 'formaspago', 'FORMAS DE PAGO'])
    .addAction(async (ctx, ctxFn) => {
        // T-04: entrada por keyword sin welcomeFlow: abrir (o renovar) la sesión para que el
        // "¿Que deseas hacer?" del final (volverMenuPrincipal) no termine en silencio.
        abrirOSostenerSesion(ctx.from);
        trackPaso(ctx.from, 'conocer_ips.formas_pago');
        trackFin(ctx.from, 'conocer_ips', 'informativo', { paso: 'conocer_ips.formas_pago' });
        const pathLocal = resolve(__dirname, '../../../../assets/formas_pago.png');
        await ctxFn.flowDynamic([
            {
                body:'Aquí tienes información sobre nuestras formas de pago',
                media: pathLocal
            },
        ]);
        await new Promise(resolve => setTimeout(resolve, 4000));
        return ctxFn.gotoFlow(volverMenuPrincipal);
    });

export { formaspagoStepConocer };