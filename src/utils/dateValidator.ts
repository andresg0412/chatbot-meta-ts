/**
 * Utilidades para validación y manejo de fechas
 */

/**
 * Valida y convierte una fecha al formato YYYY-MM-DD
 * @param fechaInput - Fecha en formato D/M/YYYY, DD/MM/YYYY, etc.
 * @returns Fecha en formato YYYY-MM-DD o null si es inválida
 */
export const validarYFormatearFecha = (fechaInput: string): string | null => {
  try {
    // Remover espacios y validar formato básico
    const fecha = fechaInput.trim();

    // Expresión regular para formatos: D/M/YYYY, DD/MM/YYYY
    const regexFecha = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    const match = fecha.match(regexFecha);

    if (!match) {
      return null;
    }

    const dia = parseInt(match[1], 10);
    const mes = parseInt(match[2], 10);
    const año = parseInt(match[3], 10);

    // Validar rangos básicos
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
      return null;
    }

    // Crear objeto Date para validación adicional
    const fechaObj = new Date(año, mes - 1, dia);

    // Verificar que la fecha sea válida (no como 31/02/2025)
    if (
      fechaObj.getFullYear() !== año ||
      fechaObj.getMonth() !== mes - 1 ||
      fechaObj.getDate() !== dia
    ) {
      return null;
    }

    // Formatear a YYYY-MM-DD
    const mesFormateado = mes.toString().padStart(2, '0');
    const diaFormateado = dia.toString().padStart(2, '0');

    return `${año}-${mesFormateado}-${diaFormateado}`;

  } catch (error) {
    console.error('Error validando fecha:', error);
    return null;
  }
};

/**
 * Extrae la fecha del comando "ejecutar FECHA"
 * @param mensaje - Mensaje completo del usuario
 * @returns Fecha formateada o null si no es válida
 */
export const extraerFechaDelComando = (mensaje: string, keyword: string = 'ejecutar'): string | null => {
  const partes = mensaje.trim().split(' ');

  if (partes.length !== 2 || partes[0].toLowerCase() !== keyword.toLowerCase()) {
    return null;
  }

  return validarYFormatearFecha(partes[1]);
};
