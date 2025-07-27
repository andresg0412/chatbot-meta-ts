/**
 * Diccionario que mapea los IDs de convenios con sus nombres de servicio
 */
export const CONVENIOS_SERVICIOS = {
  'conv_poliza_sura': 'SURA TH',
  'conv_poliza_allianz': 'ALLIANZ',
  'conv_poliza_axa_colpatria': 'AXA COLPATRIA SEGUROS DE VIDA',
  'conv_poliza_seguros_bolivar': 'BOLIVAR',
  'conv_coomeva_mp': 'COOP. COOMEVA',
  'conv_axa_colpatria_mp': 'AXA COLPATRIA_MP',
  'conv_medplus_mp': 'MEDPLUS',
  'conv_colmedica_mp': 'COLMEDICA'
};

export const ID_CONVENIOS_SERVICIOS = {
  'conv_poliza_sura': '014',
  'conv_poliza_allianz': '010',
  'conv_poliza_axa_colpatria': '012',
  'conv_poliza_seguros_bolivar': '017',
  'conv_coomeva_mp': '025',
  'conv_axa_colpatria_mp': '011',
  'conv_medplus_mp': '015',
  'conv_colmedica_mp': '020'
};

/**
 * Función para obtener el nombre del servicio a partir del ID del convenio
 * @param convenioId ID del convenio seleccionado
 * @returns Nombre del servicio correspondiente o el ID original si no se encuentra
 */
export const obtenerServicioConvenio = (convenioId: string): string => {
  return CONVENIOS_SERVICIOS[convenioId] || convenioId;
};
