// Palabras globales durante una captura (TBOT-06, proyecto-ips/docs/features/2026-10-02-informe-qa-lista-espera.md).
//
// En @builderbot 1.2.2, cuando hay una captura pendiente y llega un texto que además coincide con la
// keyword de otro flujo, el motor ejecuta PRIMERO el callback de la captura con ese texto
// (CoreClass.handleMsg → sendFlow → cbEveryCtx(prevRef)) y solo después los mensajes del otro flujo, y
// solo si el callback no llamó `gotoFlow`/`endFlow`. Por eso:
//   - "Salir" (que además tiene forma de documento válido: 5 letras) se mandaba al backend como
//     documento, o se contestaba "opción no válida";
//   - el botón de otra plantilla ("Sí, lo tomo", "No puedo", "Confirmo asistencia"…) se perdía.
//
// Uso en un callback de captura:
//   - `esPalabraSalir(texto)` → cerrar como exitFlow (welcomeFlow.ts) y `endFlow`;
//   - `esBotonDeOtraPlantilla(texto)` → limpiar lo propio y RETORNAR sin llamar gotoFlow/endFlow/
//     flowDynamic: así el motor sigue con el flujo de ese botón. Solo es seguro si la captura es el
//     último paso de su flujo (si no, `continueFlow` avanzaría al paso siguiente).
//
// Reusa las mismas keywords ancladas de keywordsBotones.ts (runbook B1), así que lo que aquí se
// reconoce es exactamente lo que el motor enruta a esos flujos.

import {
    KW_CONFIRMO_ASISTENCIA,
    KW_NECESITO_CANCELAR,
    KW_NO_PODRE_ASISTIR,
    KW_SI_LO_TOMO,
    KW_NO_PUEDO,
    KW_RETIRAR_LISTA_ESPERA,
} from './keywordsBotones';

/** Mismas palabras que exitFlow (welcomeFlow.ts), como texto completo. */
const REGEX_SALIR = /^\s*(salir|exit)\s*[.!]*\s*$/i;

/** '/^…$/flags' (formato de las keywords con `{ regex: true }`) → RegExp. */
function regexDesdeLiteral(literal: string): RegExp {
    const match = /^\/([\s\S]*)\/([a-z]*)$/.exec(literal);
    if (!match) throw new Error(`Keyword regex mal formada: ${literal}`);
    return new RegExp(match[1], match[2]);
}

/** Botones de plantilla con keyword anclada (lista de espera y recordatorios). */
const BOTONES_ANCLADOS: RegExp[] = [
    KW_CONFIRMO_ASISTENCIA,
    KW_NECESITO_CANCELAR,
    KW_NO_PODRE_ASISTIR,
    KW_SI_LO_TOMO,
    KW_NO_PUEDO,
    KW_RETIRAR_LISTA_ESPERA,
].map(regexDesdeLiteral);

/**
 * Botones de las plantillas de campaña de siempre (ejecutarCampahna.ts, campahnaRecuperacion.ts,
 * campahnaUsuariosConAsistencia.ts), comparados como texto completo sin distinguir mayúsculas.
 */
const BOTONES_CAMPANA = ['confirmar', 'confirmar cita', 'confirmo', 'en otro momento', 'ya finalicé mi proceso'];

export function esPalabraSalir(texto: unknown): boolean {
    return typeof texto === 'string' && REGEX_SALIR.test(texto);
}

export function esBotonDeOtraPlantilla(texto: unknown): boolean {
    if (typeof texto !== 'string') return false;
    if (BOTONES_ANCLADOS.some((regex) => regex.test(texto))) return true;
    return BOTONES_CAMPANA.includes(texto.trim().toLowerCase());
}

/** Mensaje de despedida de "Salir" (el mismo de exitFlow). */
export const MENSAJE_SALIR = 'Gracias por usar nuestro servicio. ¡Hasta luego! 👋';
