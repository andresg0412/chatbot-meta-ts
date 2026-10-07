/** Numero de opcion: solo digitos, con punto o parentesis final opcional. */
export function leerNumeroOpcion(texto: unknown): number | null {
    const match = /^\s*(\d{1,2})\s*[.)]?\s*$/.exec(String(texto ?? ''));
    return match ? Number(match[1]) : null;
}

/** Detecta texto que parece una hora, para explicar que debe elegirse por numero de opcion. */
export function pareceHora(texto: unknown): boolean {
    return /\b\d{1,2}\s*([:.]\s*\d{2}|\s*(am|pm|a\.\s*m\.|p\.\s*m\.))/i.test(String(texto ?? ''));
}

export function mensajeRangoValido(maximo: number): string {
    return maximo <= 1
        ? 'Escribe *1* para elegir la opción.'
        : `Escribe solo el número de la opción, del *1* al *${maximo}*.`;
}
