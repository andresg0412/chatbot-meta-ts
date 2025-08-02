/**
 * Configuración de números autorizados para ejecutar campañas
 */
export const NUMEROS_AUTORIZADOS = [
  '573185215524', // Número autorizado 1
  '3001234567'    // Número autorizado 2 (ejemplo)
];

/**
 * Verifica si un número está autorizado para ejecutar campañas
 * @param numero - Número de teléfono a verificar
 * @returns true si está autorizado, false en caso contrario
 */
export const esNumeroAutorizado = (numero: string): boolean => {
  return NUMEROS_AUTORIZADOS.includes(numero);
};
