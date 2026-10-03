import { addKeyword, EVENTS } from '@builderbot/bot';
import { abrirOSostenerSesion } from '../../../utils/proactiveSessionTimeout';
import { volverMenuPrincipal } from '../common';
import { trackPaso, trackFin } from '../../../utils/trazabilidad';

const horariosStepConocer = addKeyword(['280525016', 'Horarios', 'horarios', 'HORARIOS'])
    .addAction(async (ctx, ctxFn) => {
        // T-04: entrada por keyword sin welcomeFlow: abrir (o renovar) la sesión para que el
        // "¿Que deseas hacer?" del final (volverMenuPrincipal) no termine en silencio.
        abrirOSostenerSesion(ctx.from);
        trackPaso(ctx.from, 'conocer_ips.horarios');
        trackFin(ctx.from, 'conocer_ips', 'informativo', { paso: 'conocer_ips.horarios' });
        await ctxFn.flowDynamic('⏱️ Nuestro horario de atención es el siguiente:\n\nLunes a Viernes: 7:00 a.m - 7:00 p.m ⏰\nSábados: 7:00 a.m - 1:00 p.m 🌟');
        return ctxFn.gotoFlow(volverMenuPrincipal);
    });

export { horariosStepConocer };