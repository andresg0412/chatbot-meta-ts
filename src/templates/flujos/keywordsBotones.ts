// Keywords de coincidencia EXACTA para los botones de los flujos nuevos de "lista de espera
// inteligente" — runbook B1, proyecto-ips/docs/features/2026-09-26-lista-espera-runbook-produccion.md.
//
// Cómo decide @builderbot 1.2.2 a qué flujo va un mensaje (node_modules/@builderbot/bot/dist/index.cjs,
// FlowClass.find): recorre TODOS los flujos en el orden de `createFlow([...])` y se queda con el
// PRIMERO cuya keyword "matchee" el texto:
//   - keyword string/array sin opciones → `new RegExp(keywords.join('|'), 'i').test(body)`:
//     búsqueda de SUBCADENA sin distinguir mayúsculas ("Confirmo asistencia" contiene "Confirmo",
//     "Necesito cancelar" contiene "cancelar", "hoy no puedo ir" contiene "no puedo").
//   - con `{ regex: true }` → la keyword debe ser un string con un literal de regex
//     ('/^...$/flags'), que se evalúa con `new Function('return ' + keyword)()` y se usa tal cual.
//
// Solución aplicada: los flujos de botón nuevos usan regex ANCLADAS (^...$) y se registran al inicio
// de `createFlow` (templates/index.ts), antes de los flujos viejos. Las keywords viejas NO se tocan,
// así que todo texto que no sea exactamente uno de estos botones sigue yendo al mismo flujo de antes.
//
// Los botones de plantilla/respuesta rápida llegan como texto exacto del botón, así que la coincidencia
// es sensible a mayúsculas y tildes (idénticas al texto aprobado en Meta), tolerando solo espacios al
// inicio/fin. Si un paciente ESCRIBE a mano "confirmo asistencia" en minúsculas, cae en el flujo viejo
// ('Confirmo'), igual que antes de este cambio.
//
// La única excepción es el retiro de lista de espera (B5): es un comando que el paciente escribe, así
// que acepta mayúsculas/minúsculas y variantes razonables.

/** Botón "Confirmo asistencia" (recordatorios con botones, Fase 3). */
export const KW_CONFIRMO_ASISTENCIA = '/^\\s*Confirmo asistencia\\s*$/';

/** Botón "Necesito cancelar" (recordatorios 48h/24h con botones, Fase 3). */
export const KW_NECESITO_CANCELAR = '/^\\s*Necesito cancelar\\s*$/';

/** Botón "No podré asistir" (recordatorio 2h con botones, Fase 3). */
export const KW_NO_PODRE_ASISTIR = '/^\\s*No podré asistir\\s*$/';

/** Texto de los botones con los que el paciente confirma o descarta la cancelación (TBOT-03). ≤ 20 caracteres. */
export const TEXTO_BOTON_SI_CANCELAR = 'Sí, cancelar';
export const TEXTO_BOTON_NO_MANTENER = 'No, mantener';
export const TEXTO_BOTON_REPROGRAMAR = 'Reprogramar';
export const KW_REPROGRAMAR_RECORDATORIO = '/^\\s*Reprogramar\\s*$/';

/**
 * Botones "Sí, cancelar" / "No, mantener" fuera de la captura que los espera (doble toque, botón de una
 * conversación ya cerrada). Sin esta keyword, "Sí, cancelar" caería por subcadena en el flujo guiado de
 * cancelar ('cancelar'). Ver templates/flujos/recordatorios/respuestaRecordatorioComun.ts.
 */
export const KW_BOTONES_CONFIRMAR_CANCELACION = '/^\\s*(Sí, cancelar|No, mantener|Reprogramar)\\s*$/';

/** Botón "Sí, lo tomo" (oferta de cupo, Fase 2). */
export const KW_SI_LO_TOMO = '/^\\s*Sí, lo tomo\\s*$/';

/** Botón "No puedo" (oferta de cupo, Fase 2). */
export const KW_NO_PUEDO = '/^\\s*No puedo\\s*$/';

/**
 * Comando de retiro de la lista de espera (B5). Texto que se indica al paciente:
 * "Retirar lista de espera". Acepta, sin distinguir mayúsculas y con o sin tildes/puntuación final:
 * "retirar lista de espera", "retirarme de la lista de espera", "salir de la lista de espera",
 * "salir lista de espera". "Salir" a secas NO entra aquí (sigue cerrando la conversación).
 */
export const KW_RETIRAR_LISTA_ESPERA =
    '/^\\s*(retirar(me)?|salir)\\s+(de\\s+)?(la\\s+)?lista\\s+de\\s+espera\\s*[.!]*\\s*$/i';

/** Texto que se le indica al paciente para retirarse (consentimiento y mensaje de inscripción). */
export const TEXTO_COMANDO_RETIRO_LISTA_ESPERA = 'Retirar lista de espera';

// Invitación a la lista de espera (campañas de regularización y continua):
// proyecto-ips/docs/features/2026-10-04-campanas-invitacion-lista-espera-implementacion.md, 6.6/6.9.
// Botones de respuesta rápida de la plantilla `NOMBRE_PLANTILLA_LE_INVITACION` (aprobada en Meta como
// `invitacion_lista_espera`, 2026-10-05): "Si, deseo ingresar" (index 0), "No, gracias" (index 1) y
// "Hablar con agente" (index 2). La keyword de aceptar admite "Si" y "Sí" porque el botón llega con el
// texto exacto aprobado en Meta. "No, gracias" coincide con el botón de la captura del opt-in de agendar
// (stepListaEsperaOptIn.ts): dentro de esa captura gana la captura (su callback termina con endFlow),
// decisión C11/D18 del documento.

/** Texto del botón de aceptar de la plantilla de invitación (el aprobado en Meta). */
export const TEXTO_BOTON_SI_DESEO_INGRESAR = 'Si, deseo ingresar';

/** Texto del botón de rechazar de la plantilla de invitación (debe ser idéntico al aprobado en Meta). */
export const TEXTO_BOTON_NO_GRACIAS_INVITACION = 'No, gracias';

/** Texto del botón de pedir un asesor de la plantilla de invitación (debe ser idéntico al aprobado en Meta). */
export const TEXTO_BOTON_HABLAR_CON_AGENTE = 'Hablar con agente';

/** Botón "Si, deseo ingresar" (invitación a la lista de espera), con o sin tilde en la "i". */
export const KW_SI_DESEO_INGRESAR = '/^\\s*S[ií], deseo ingresar\\s*$/';

/** Botón "No, gracias" (invitación a la lista de espera). */
export const KW_NO_GRACIAS_INVITACION = '/^\\s*No, gracias\\s*$/';

/** Botón "Hablar con agente" (invitación a la lista de espera). */
export const KW_HABLAR_CON_AGENTE_INVITACION = '/^\\s*Hablar con agente\\s*$/';

/** Mensajes multimedia sintetizados por provider-meta. Debe registrarse antes de cualquier keyword numerica. */
export const KW_MULTIMEDIA = '/^_event_(media|document|location|voice_note|contacts|order)_/';

/** Opción de addKeyword para las keywords de este archivo. */
export const OPCIONES_REGEX = { regex: true } as const;
