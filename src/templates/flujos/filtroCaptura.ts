import type { PasoId } from '../../constants/pasosTrazabilidad';
import { closeUserSession } from '../../utils/proactiveSessionManager';
import { trackNoEntendido, trackPaso } from '../../utils/trazabilidad';
import { esBotonDeOtraPlantilla, esPalabraSalir, MENSAJE_SALIR } from './palabrasGlobales';

export type ResultadoFiltroCaptura =
    | { tipo: 'seguir' }
    | { tipo: 'salir' }
    | { tipo: 'dejar_pasar' }
    | { tipo: 'multimedia' };

/** Ids de las opciones del menu principal y de "Conocer la IPS". */
export const REGEX_ID_MENU = /^\s*2805250(0[1-6]|1[1-7])\s*$/;

/** Cuerpos sinteticos que provider-meta 1.2.2 genera para mensajes que no son texto. */
export const REGEX_MULTIMEDIA = /^_event_(media|document|location|voice_note|contacts|order)_/;

export function clasificarEntradaCaptura(texto: unknown): ResultadoFiltroCaptura {
    if (esPalabraSalir(texto)) return { tipo: 'salir' };
    if (typeof texto === 'string' && REGEX_MULTIMEDIA.test(texto)) return { tipo: 'multimedia' };
    if (esBotonDeOtraPlantilla(texto) || (typeof texto === 'string' && REGEX_ID_MENU.test(texto))) {
        return { tipo: 'dejar_pasar' };
    }
    return { tipo: 'seguir' };
}

interface FuncionesCaptura {
    endFlow: (mensaje?: string) => any;
    flowDynamic: (mensaje: string) => Promise<any>;
}

export async function aplicarFiltroCaptura(
    ctx: { from: string; body?: unknown },
    fns: FuncionesCaptura,
    opciones: { paso: PasoId; reintentar: () => Promise<any> | any; permitirSalir?: boolean; permitirDejarPasar?: boolean }
): Promise<{ salida: any } | undefined> {
    const resultado = clasificarEntradaCaptura(ctx.body);
    if (resultado.tipo === 'salir' && opciones.permitirSalir === false) return undefined;
    if (resultado.tipo === 'dejar_pasar' && opciones.permitirDejarPasar === false) return undefined;
    if (resultado.tipo === 'seguir') return undefined;

    if (resultado.tipo === 'salir') {
        trackPaso(ctx.from, 'comun.salida');
        closeUserSession(ctx.from, 'salir');
        return { salida: fns.endFlow(MENSAJE_SALIR) };
    }
    if (resultado.tipo === 'dejar_pasar') {
        // No responder ni navegar: @builderbot debe continuar buscando la keyword global.
        return { salida: undefined };
    }

    trackNoEntendido(ctx.from, opciones.paso, 1, { contexto: 'multimedia' });
    await fns.flowDynamic('Por ahora no puedo escuchar audios ni ver archivos. Por favor responde escribiendo.');
    return { salida: await opciones.reintentar() };
}
