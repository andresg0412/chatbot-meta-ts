import { addKeyword } from '@builderbot/bot';
import { obtenerSesionTraza, trackNoEntendido } from '../../utils/trazabilidad';
import { KW_MULTIMEDIA, OPCIONES_REGEX } from './keywordsBotones';

const multimediaFlow = addKeyword(KW_MULTIMEDIA, OPCIONES_REGEX)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sesion = obtenerSesionTraza(ctx.from);
        trackNoEntendido(ctx.from, sesion?.ultimoPaso ?? null, 1, { contexto: 'multimedia' });
        await flowDynamic(
            'Por ahora no puedo escuchar audios ni ver imágenes o archivos. \ud83d\ude4f ' +
            'Por favor escríbeme tu mensaje, o escribe *hola* para ver el menú.'
        );
        return endFlow();
    });

export { multimediaFlow };
