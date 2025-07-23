import { addKeyword, EVENTS } from '@builderbot/bot';
import { resolve } from 'path';
import { volverMenuPrincipal } from '../common';

const conveniosStepConocer = addKeyword(['280525012', 'Convenios', 'convenios', 'CONVENIOS'])
    .addAction(async (ctx, ctxFn) => {
        // Usar resolve para obtener una ruta absoluta a la imagen en la carpeta assets
        const pathLocal = resolve(__dirname, '../../../../assets/convenios.png');
        await ctxFn.flowDynamic([
            {
                body:'Aquí tienes información sobre nuestros convenios',
                media: pathLocal
            },
        ]);
        return ctxFn.gotoFlow(volverMenuPrincipal);
    });

export { conveniosStepConocer };