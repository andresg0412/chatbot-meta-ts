/** Numero de opcion: solo digitos, con punto o parentesis final opcional. */
export function leerNumeroOpcion(texto: unknown): number | null {
    const match = /^\s*(\d{1,6})\s*[.)]?\s*$/.exec(String(texto ?? ''));
    return match ? Number(match[1]) : null;
}

/** Detecta texto que parece una hora, para explicar que debe elegirse por numero de opcion. */
export function pareceHora(texto: unknown): boolean {
    return /\b\d{1,2}\s*([:.]\s*\d{2}|\s*(am|pm|a\.\s*m\.|p\.\s*m\.))/i.test(String(texto ?? ''));
}

/** Solo elige una hora escrita si identifica una única cita disponible en todas las páginas. */
export function indiceHoraEscrita(texto: unknown, citas: { horacita: string }[]): number | null {
    const match = /^\s*(\d{1,2})(?:\s*[:.]\s*(\d{2}))?\s*([ap])?\s*\.?\s*(m)?\s*\.?\s*$/i.exec(String(texto ?? ''));
    if (!match || (!match[2] && !(match[3] && match[4])) || (!!match[3] !== !!match[4])) return null;
    const hora = Number(match[1]);
    const minuto = Number(match[2] ?? 0);
    if (minuto > 59 || hora > 23 || (match[3] && (hora < 1 || hora > 12))) return null;
    const horas = match[3]
        ? [hora % 12 + (match[3].toLowerCase() === 'p' ? 12 : 0)]
        : hora >= 1 && hora <= 12 ? [hora % 12, hora % 12 + 12] : [hora];
    const candidatos = new Set(horas.map(h => `${String(h).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`));
    const coincidencias = citas.map((cita, i) => candidatos.has(cita.horacita.slice(0, 5)) ? i : -1).filter(i => i >= 0);
    return coincidencias.length === 1 ? coincidencias[0] : null;
}

export function mensajeRangoValido(maximo: number): string {
    return maximo <= 1
        ? 'Escribe *1* para elegir la opción.'
        : `Escribe solo el número de la opción, del *1* al *${maximo}*.`;
}
