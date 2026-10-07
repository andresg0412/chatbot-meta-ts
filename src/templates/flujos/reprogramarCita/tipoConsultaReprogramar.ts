/**
 * Tipo usado para buscar disponibilidad al reprogramar. Las citas que no son de primera vez conservan
 * el profesional siempre que el backend haya entregado su id.
 */
export function tipoConsultaParaReprogramar(
    catalogo: unknown,
    profesionalId: unknown
): 'Primera vez' | 'Control' | null {
    const tieneProfesional = typeof profesionalId === 'string' && profesionalId.trim() !== '';
    const esPrimeraVez = String(catalogo ?? '').toUpperCase().includes('PRIMERA VEZ');
    if (esPrimeraVez) return 'Primera vez';
    if (tieneProfesional) return 'Control';
    return null;
}
