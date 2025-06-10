// Utilidades para sanitizar y validar entradas del usuario
// Puedes extender estas funciones según tus necesidades

export function sanitizeString(input: any, maxLength = 100): string {
  if (typeof input !== 'string') return '';
  // Elimina caracteres peligrosos y limita longitud
  let sanitized = input.replace(/[<>"'`\\]/g, '');
  sanitized = sanitized.trim().slice(0, maxLength);
  return sanitized;
}

export function isValidPhoneNumber(input: string): boolean {
  // Solo números, longitud típica de celular colombiano
  return /^\d{10,15}$/.test(input);
}

export function isValidDocumentNumber(input: string): boolean {
  // Solo números y letras, longitud razonable
  return /^[a-zA-Z0-9]{5,20}$/.test(input);
}

export function isValidName(input: string): boolean {
  // Solo letras, espacios y acentos
  return /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{2,50}$/.test(input);
}
