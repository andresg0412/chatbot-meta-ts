// Utilidades de teléfono para los envíos nuevos de "lista de espera inteligente" (runbook B4/B7/B9,
// proyecto-ips/docs/features/2026-09-26-lista-espera-runbook-produccion.md).
//
// El backend puede devolver el teléfono del paciente en varios formatos (10 dígitos sin indicativo,
// "57XXXXXXXXXX", "+57 300 123 4567", vacío o null). WhatsApp Cloud API necesita el número con
// indicativo de país; un "3001234567" sin 57 se interpretaría como un número de otro país.

/** Solo dígitos del valor recibido (vacío si no hay nada utilizable). */
export function soloDigitos(raw: unknown): string {
    if (raw === null || raw === undefined) return '';
    return String(raw).replace(/\D/g, '');
}

/**
 * Normaliza a formato de envío de WhatsApp para Colombia (`57XXXXXXXXXX`).
 * - 10 dígitos (celular colombiano sin indicativo) → se antepone `57`.
 * - 12 dígitos que empiezan por `57` → se deja igual.
 * - Cualquier otro valor con 11+ dígitos se asume que ya trae indicativo de país y se deja igual.
 * - Vacío, null o menos de 10 dígitos → `null` (no contactable: el llamador NO debe enviar nada).
 */
export function normalizarTelefonoWhatsApp(raw: unknown): string | null {
    const digitos = soloDigitos(raw);
    if (digitos.length < 10) return null;
    if (digitos.length === 10) return `57${digitos}`;
    return digitos;
}

/**
 * Clave de comparación entre formatos (10 dígitos vs `57...`): los últimos 10 dígitos.
 * `null` si no hay al menos 10 dígitos.
 */
export function claveComparacionTelefono(raw: unknown): string | null {
    const digitos = soloDigitos(raw);
    if (digitos.length < 10) return null;
    return digitos.slice(-10);
}

/** Enmascara un teléfono para logs/estadísticas: solo deja visibles los últimos 4 dígitos. */
export function enmascararTelefono(raw: unknown): string {
    const digitos = soloDigitos(raw);
    if (!digitos) return '(sin teléfono)';
    if (digitos.length <= 4) return '****';
    return `${'*'.repeat(digitos.length - 4)}${digitos.slice(-4)}`;
}
