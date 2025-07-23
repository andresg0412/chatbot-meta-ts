import { addKeyword, EVENTS } from '@builderbot/bot';
import { volverMenuPrincipal } from '../common';

const horariosStepConocer = addKeyword(['280525016', 'Horarios', 'horarios', 'HORARIOS'])
    .addAction(async (ctx, ctxFn) => {
        await ctxFn.flowDynamic('⏱️ Nuestro horario de atención es el siguiente:\n\nLunes a Viernes: 7:00 a.m - 7:00 p.m ⏰\nSábados: 7:00 a.m - 12:00 p.m 🌟');
        return ctxFn.gotoFlow(volverMenuPrincipal);
    });

export { horariosStepConocer };