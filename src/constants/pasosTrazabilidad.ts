// Catálogo de pasos de la trazabilidad de usuarios ("migas de pan").
//
// FUENTE DE VERDAD COMPARTIDA: proyecto-ips/docs/features/2026-09-29-trazabilidad-usuarios.md, sección
// 11.3. El backend siembra la tabla `catalogo_pasos` (migración 029) con EXACTAMENTE esta misma lista
// (mismo id, mismo flujo, mismo orden, mismo es_final). Cualquier diferencia rompe los embudos de
// `bi.v_embudo_flujo`: si hay que agregar o renombrar un paso, se cambia primero el documento y la
// semilla del backend, y después este archivo.
//
// En los eventos el bot manda en `flujo` el flujo EN CURSO. Para los pasos `comun.*` ese valor es
// 'cancelar' o 'reprogramar' según la sesión (ver `flujoDeEvento` en src/utils/trazabilidad.ts).

export interface PasoTrazabilidad {
    paso: string;
    flujo: string;
    orden: number;
    es_final: boolean;
}

export const CATALOGO_PASOS = [
    { paso: 'inicio.bienvenida', flujo: 'inicio', orden: 1, es_final: false },
    { paso: 'politicas.pregunta', flujo: 'politicas', orden: 1, es_final: false },
    { paso: 'politicas.no_acepta', flujo: 'politicas', orden: 2, es_final: true },
    { paso: 'menu.principal', flujo: 'menu', orden: 1, es_final: false },
    { paso: 'agendar.s01_tipo_cita', flujo: 'agendar', orden: 1, es_final: false },
    { paso: 'agendar.s02_tipo_consulta', flujo: 'agendar', orden: 2, es_final: false },
    { paso: 'agendar.pv04_especialidad_menu', flujo: 'agendar', orden: 3, es_final: false },
    { paso: 'agendar.pv05_especialidad', flujo: 'agendar', orden: 4, es_final: false },
    { paso: 'agendar.pv06_tipo_atencion', flujo: 'agendar', orden: 5, es_final: false },
    { paso: 'agendar.ct04_especialidad', flujo: 'agendar', orden: 3, es_final: false },
    { paso: 'agendar.ct05_tipo_documento', flujo: 'agendar', orden: 4, es_final: false },
    { paso: 'agendar.ct06_documento', flujo: 'agendar', orden: 5, es_final: false },
    { paso: 'agendar.ct07_citas_previas', flujo: 'agendar', orden: 6, es_final: false },
    { paso: 'agendar.s08_fechas', flujo: 'agendar', orden: 8, es_final: false },
    { paso: 'agendar.s09_selecciona_fecha', flujo: 'agendar', orden: 9, es_final: false },
    { paso: 'agendar.s10_selecciona_hora', flujo: 'agendar', orden: 10, es_final: false },
    { paso: 'agendar.s11_datos_intro', flujo: 'agendar', orden: 11, es_final: false },
    { paso: 'agendar.s12_particular_convenio', flujo: 'agendar', orden: 12, es_final: false },
    { paso: 'agendar.s13_convenio', flujo: 'agendar', orden: 13, es_final: false },
    { paso: 'agendar.s14_tipo_documento', flujo: 'agendar', orden: 14, es_final: false },
    { paso: 'agendar.s15_documento', flujo: 'agendar', orden: 15, es_final: false },
    { paso: 'agendar.s16_consulta_paciente', flujo: 'agendar', orden: 16, es_final: false },
    { paso: 'agendar.s17_formulario_paciente', flujo: 'agendar', orden: 17, es_final: false },
    { paso: 'agendar.s18_confirmacion', flujo: 'agendar', orden: 18, es_final: false },
    { paso: 'agendar.s19_crear_cita', flujo: 'agendar', orden: 19, es_final: true },
    { paso: 'agendar.lista_espera_optin', flujo: 'agendar', orden: 20, es_final: true },
    { paso: 'cancelar.s01_inicio', flujo: 'cancelar', orden: 1, es_final: false },
    { paso: 'reprogramar.s01_inicio', flujo: 'reprogramar', orden: 1, es_final: false },
    { paso: 'comun.c01_tipo_documento', flujo: 'comun', orden: 2, es_final: false },
    { paso: 'comun.c02_tipo_documento_sel', flujo: 'comun', orden: 3, es_final: false },
    { paso: 'comun.c03_documento', flujo: 'comun', orden: 4, es_final: false },
    { paso: 'comun.c04_consulta_citas', flujo: 'comun', orden: 5, es_final: false },
    { paso: 'comun.c05_seleccion', flujo: 'comun', orden: 6, es_final: false },
    { paso: 'cancelar.s05_lista_citas', flujo: 'cancelar', orden: 10, es_final: false },
    { paso: 'cancelar.s06_selecciona_cita', flujo: 'cancelar', orden: 11, es_final: false },
    { paso: 'cancelar.s07_confirmacion', flujo: 'cancelar', orden: 12, es_final: false },
    { paso: 'cancelar.confirma_cancelar', flujo: 'cancelar', orden: 13, es_final: true },
    { paso: 'cancelar.opcion_reprogramar', flujo: 'cancelar', orden: 14, es_final: false },
    { paso: 'reprogramar.s05_lista_citas', flujo: 'reprogramar', orden: 10, es_final: false },
    { paso: 'reprogramar.s06_selecciona_cita', flujo: 'reprogramar', orden: 11, es_final: false },
    { paso: 'reprogramar.s07_confirmacion', flujo: 'reprogramar', orden: 12, es_final: false },
    { paso: 'reprogramar.fechas', flujo: 'reprogramar', orden: 13, es_final: false },
    { paso: 'reprogramar.selecciona_fecha', flujo: 'reprogramar', orden: 14, es_final: false },
    { paso: 'reprogramar.selecciona_hora', flujo: 'reprogramar', orden: 15, es_final: false },
    { paso: 'reprogramar.confirma_reprogramar', flujo: 'reprogramar', orden: 16, es_final: true },
    { paso: 'reprogramar.no_confirma', flujo: 'reprogramar', orden: 17, es_final: true },
    { paso: 'conocer_ips.menu', flujo: 'conocer_ips', orden: 1, es_final: false },
    { paso: 'conocer_ips.servicios', flujo: 'conocer_ips', orden: 2, es_final: true },
    { paso: 'conocer_ips.convenios', flujo: 'conocer_ips', orden: 2, es_final: true },
    { paso: 'conocer_ips.tarifas', flujo: 'conocer_ips', orden: 2, es_final: true },
    { paso: 'conocer_ips.formas_pago', flujo: 'conocer_ips', orden: 2, es_final: true },
    { paso: 'conocer_ips.ubicacion', flujo: 'conocer_ips', orden: 2, es_final: true },
    { paso: 'conocer_ips.horarios', flujo: 'conocer_ips', orden: 2, es_final: true },
    { paso: 'conocer_ips.canales', flujo: 'conocer_ips', orden: 2, es_final: true },
    { paso: 'agente.envio', flujo: 'agente', orden: 1, es_final: true },
    { paso: 'pqrs.envio', flujo: 'pqrs', orden: 1, es_final: true },
    { paso: 'comun.volver_menu', flujo: 'comun', orden: 90, es_final: false },
    { paso: 'comun.salida', flujo: 'comun', orden: 99, es_final: true },
    { paso: 'campana.confirmar_documento', flujo: 'campana_respuesta', orden: 1, es_final: false },
    { paso: 'campana.recuperacion_respuesta', flujo: 'campana_respuesta', orden: 1, es_final: true },
    { paso: 'campana.conasistencia_respuesta', flujo: 'campana_respuesta', orden: 1, es_final: true },
    { paso: 'recordatorio.confirmo', flujo: 'recordatorio', orden: 1, es_final: true },
    { paso: 'recordatorio.necesito_cancelar', flujo: 'recordatorio', orden: 1, es_final: true },
    { paso: 'recordatorio.no_podre_asistir', flujo: 'recordatorio', orden: 1, es_final: true },
    // TB-05 / TBOT-03 (2026-10-03): elegir la cita y confirmar la cancelación. PENDIENTE en el backend:
    // agregar estas 2 filas a `catalogo_pasos` (semilla de la migración 029) y a la tabla 11.3.
    { paso: 'recordatorio.selecciona_cita', flujo: 'recordatorio', orden: 2, es_final: false },
    { paso: 'recordatorio.confirma_cancelar', flujo: 'recordatorio', orden: 3, es_final: false },
    { paso: 'lista_espera.oferta_respuesta', flujo: 'lista_espera', orden: 1, es_final: true },
    { paso: 'lista_espera.retiro', flujo: 'lista_espera', orden: 1, es_final: true },
    { paso: 'legado.entrada', flujo: 'legado', orden: 0, es_final: false },
] as const satisfies ReadonlyArray<PasoTrazabilidad>;

/** Id de paso válido del catálogo (unión literal de los ids de CATALOGO_PASOS). */
export type PasoId = (typeof CATALOGO_PASOS)[number]['paso'];

const PASOS_POR_ID: ReadonlyMap<string, PasoTrazabilidad> = new Map(
    CATALOGO_PASOS.map((p) => [p.paso, p as PasoTrazabilidad])
);

/** Entrada del catálogo para un id, o undefined si el id no existe. */
export function obtenerPaso(paso: string): PasoTrazabilidad | undefined {
    return PASOS_POR_ID.get(paso);
}

/** true si el id existe en el catálogo. */
export function esPasoValido(paso: string): paso is PasoId {
    return PASOS_POR_ID.has(paso);
}
