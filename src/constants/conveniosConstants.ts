/**
 * Diccionario que mapea los IDs de convenios con sus nombres de servicio
 */
export const CONVENIOS_SERVICIOS = {
  'conv_poliza_sura': 'SURA',
  'conv_poliza_allianz': 'ALLIANZ',
  'conv_poliza_axa_colpatria': 'AXA SEGUROS',
  'conv_poliza_seguros_bolivar': 'BOLIVAR',
  'conv_coomeva_mp': 'COOMEVA MP',
  'conv_axa_colpatria_mp': 'AXA MP',
  'conv_medplus_mp': 'MEDPLUS MP',
  'conv_colmedica_mp': 'COLMEDICA MP'
};

/**
 * Función para obtener el nombre del servicio a partir del ID del convenio
 * @param convenioId ID del convenio seleccionado
 * @returns Nombre del servicio correspondiente o el ID original si no se encuentra
 */
export const obtenerServicioConvenio = (convenioId: string): string => {
  return CONVENIOS_SERVICIOS[convenioId] || convenioId;
};
