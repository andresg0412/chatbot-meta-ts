// Formateo de fecha/hora para los mensajes nuevos de "lista de espera inteligente" (runbook B2/B9,
// proyecto-ips/docs/features/2026-09-26-lista-espera-runbook-produccion.md).
//
// Problema que evita (B2): `new Date('2026-10-05')` se interpreta como medianoche UTC; si luego se
// formatea en la zona local del proceso (America/Bogota, UTC-5) se muestra el día anterior. Aquí la
// fecha se toma siempre de sus componentes Y-M-D y se formatea con `timeZone: 'UTC'`, así el resultado
// no depende de la zona horaria del proceso.
//
// Para valores ISO con hora (p. ej. '2026-10-05T05:00:00.000Z', que es como el backend serializa una
// columna DATE), se usa la parte de fecha (primeros 10 caracteres): es correcta tanto si el backend
// corre en UTC como en America/Bogota (en ambos casos la medianoche local cae el mismo día en UTC).

const REGEX_FECHA_INICIO = /^(\d{4})-(\d{2})-(\d{2})/;
const REGEX_HORA_INICIO = /^(\d{1,2}):(\d{2})/;

/** Devuelve 'YYYY-MM-DD' si el valor empieza por una fecha válida, o null. */
export function extraerFechaISO(fecha: unknown): string | null {
    if (fecha === null || fecha === undefined) return null;
    const match = REGEX_FECHA_INICIO.exec(String(fecha).trim());
    if (!match) return null;
    const [, y, m, d] = match;
    const mes = Number(m);
    const dia = Number(d);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return `${y}-${m}-${d}`;
}

/**
 * '2026-10-05' (o '2026-10-05T05:00:00.000Z') → '5 de octubre de 2026', sin depender de la zona
 * horaria del proceso. Si el valor no tiene forma de fecha, se devuelve tal cual (o '' si viene vacío).
 */
export function formatearFechaLarga(fecha: unknown): string {
    if (fecha === null || fecha === undefined || fecha === '') return '';
    const iso = extraerFechaISO(fecha);
    if (!iso) return String(fecha);
    const [y, m, d] = iso.split('-').map(Number);
    const utc = new Date(Date.UTC(y, m - 1, d));
    if (isNaN(utc.getTime())) return String(fecha);
    return utc.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** '14:00:00' → '14:00'; '9:05' → '09:05'. Si no tiene forma de hora se devuelve tal cual. */
export function formatearHoraHHMM(hora: unknown): string {
    if (hora === null || hora === undefined) return '';
    const texto = String(hora).trim();
    const match = REGEX_HORA_INICIO.exec(texto);
    if (!match) return texto;
    const [, h, min] = match;
    return `${h.padStart(2, '0')}:${min}`;
}

/**
 * Instante (ms epoch) de una fecha 'YYYY-MM-DD' + hora 'HH:MM[:SS]' interpretada en hora de Colombia
 * (UTC-5 fijo, sin horario de verano), sin depender de la zona horaria del proceso. null si no se
 * puede interpretar.
 */
export function instanteBogota(fecha: unknown, hora: unknown): number | null {
    const iso = extraerFechaISO(fecha);
    const hhmm = formatearHoraHHMM(hora);
    if (!iso || !REGEX_HORA_INICIO.test(hhmm)) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const [h, min] = hhmm.split(':').map(Number);
    return Date.UTC(y, m - 1, d, h + 5, min);
}

/**
 * Fecha 'YYYY-MM-DD' de hoy en hora de Colombia (UTC-5 fijo, misma convención que `instanteBogota`),
 * sin depender de la zona horaria del proceso. Se usa en `metadata.date` de los eventos de
 * estadística (antes era la fecha UTC: un evento después de las 19:00 de Bogotá quedaba con el día
 * siguiente).
 */
export function fechaBogotaHoy(ahoraMs: number = Date.now()): string {
    return new Date(ahoraMs - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
