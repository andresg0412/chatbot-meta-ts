/**
 * Limpia el texto de un parámetro de plantilla de Meta.
 *
 * Meta rechaza toda la plantilla (error 132018, HTTP 400) si un parámetro trae saltos de línea,
 * tabuladores o más de 4 espacios seguidos. Pasó el 2026-10-01: un profesional con un tabulador al
 * final de `equipo.nombre_completo` bloqueó la oferta de cupo (ver
 * proyecto-ips/docs/features/2026-10-01-revision-pruebas-reales.md).
 *
 * Colapsa cualquier secuencia de espacios en blanco a un solo espacio y recorta los extremos. Un
 * valor vacío o nulo se envía como '-', porque Meta también rechaza parámetros vacíos.
 */
export function limpiarParametroPlantilla(valor: unknown): string {
    const texto = String(valor ?? '').replace(/\s+/g, ' ').trim();
    return texto.length > 0 ? texto : '-';
}
