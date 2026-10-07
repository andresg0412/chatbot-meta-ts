/** Catalogos que no deben buscar huecos automaticamente al reprogramar. Comparar sin tildes y en mayusculas. */
export const CATALOGOS_SOLO_ASESOR = [
    'INTERVENCION EN CRISIS',
    'ADMINISTRACION DE PRUEBA NEUROPSICOLOGICA',
    'APLICACION DE PRUEBA NEUROPSICOLOGICA',
    'PRUEBA COGNITIVA',
    'PAQUETE DE NEUROPSICOLOGIA',
    'ADMINISTRACION DE PRUEBA DE INTELIGENCIA',
    'APLICACION DE PRUEBA DE INTELIGENCIA',
    'TALLER DE ORIENTACION PSICOLOGICA EMPRESARIAL',
] as const;

export function quitarTildes(texto: unknown): string {
    return String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizarCatalogo(texto: unknown): string {
    return quitarTildes(texto)
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function esCatalogoSoloAsesor(catalogo: unknown): boolean {
    const normalizado = normalizarCatalogo(catalogo);
    return CATALOGOS_SOLO_ASESOR.some((texto) => normalizado.includes(normalizarCatalogo(texto)));
}
