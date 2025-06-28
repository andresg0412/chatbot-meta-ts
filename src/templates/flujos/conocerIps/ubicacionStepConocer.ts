import { addKeyword, EVENTS } from '@builderbot/bot';
import { volverMenuPrincipal } from '../common';

const ubicacionStepConocer = addKeyword(['280525015', 'Ubicación', 'ubicacion', 'UBICACIÓN'])
    .addAction(async (ctx, ctxFn) => {
        await ctxFn.flowDynamic('Avenida Gonzales Valencia - 54, Bucaramanga');
        return ctxFn.gotoFlow(volverMenuPrincipal);
    });

export { ubicacionStepConocer };