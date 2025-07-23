import { addKeyword, EVENTS } from '@builderbot/bot';
import { resolve } from 'path';
import { volverMenuPrincipal } from '../common';

const tarifasStepConocer = addKeyword(['280525013', 'Tarifas', 'tarifas', 'TARIFAS'])
    .addAction(async (ctx, ctxFn) => {
        const pathLocal = resolve(__dirname, '../../../../assets/imgprueba.jpg');
        await ctxFn.flowDynamic([
            {
                body:'Aquí tienes información sobre nuestras tarifas',
                media: pathLocal
            },
        ]);
        return ctxFn.gotoFlow(volverMenuPrincipal);
    });

export { tarifasStepConocer };