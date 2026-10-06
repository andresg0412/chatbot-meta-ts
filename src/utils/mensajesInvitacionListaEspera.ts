// Textos de la invitación a la lista de espera: plantilla (consentimiento), respuesta del paciente y
// errores. proyecto-ips/docs/features/2026-10-04-campanas-invitacion-lista-espera-implementacion.md
// (6.6, 6.9) y mensajes 7.2-7.4 de docs/features/2026-10-03-plan-campanas-invitacion-lista-espera.md.
// Funciones puras: no envían nada ni tocan el state.
//
// Privacidad (regla transversal): ningún texto menciona la especialidad ni el tipo de servicio. De la cita
// solo se muestran fecha, hora y nombre del profesional.

import type { InvitacionPorDocumento } from '../services/apiService';
import { formatearFechaLarga, formatearHoraHHMM } from './fechaHora';
import {
    ID_FILA_NINGUNA,
    MAX_CITAS_EN_LISTA,
    descripcionFilaCita,
    idFilaCita,
    limpiarProfesional,
    tituloFilaCita,
} from './mensajesRecordatorio';
import { TEXTO_BOTON_SI_DESEO_INGRESAR, TEXTO_COMANDO_RETIRO_LISTA_ESPERA } from '../templates/flujos/keywordsBotones';

// ---------------------------------------------------------------------------
// Plantilla y consentimiento
// ---------------------------------------------------------------------------

/**
 * Cuerpo de la plantilla `NOMBRE_PLANTILLA_LE_INVITACION` tal como se aprueba en Meta (sección 6.9), con
 * los marcadores {{n}} SIN reemplazar. Se guarda como consentimiento en `lista_espera.consentimiento_texto`.
 * RIESGO R7: si German cambia el texto aprobado en Meta (incluidos saltos de línea o emojis), hay que
 * cambiar esta constante en el mismo despliegue; si no, el consentimiento guardado no coincidiría con lo
 * que vio el paciente.
 */
export const TEXTO_PLANTILLA_INVITACION_LE =
    'Hola, {{1}} 😊 Tienes una cita agendada con {{2}} el {{3}} a las {{4}}. ' +
    'Queremos ofrecerte un servicio opcional: si se libera un cupo antes con el mismo profesional, ' +
    'podemos avisarte por este medio para que decidas si deseas adelantar tu cita. ' +
    'Tu cita actual se mantiene exactamente igual. Aceptar esta invitación no la cancela ni la modifica.';

/**
 * `consentimiento_texto` de `responder` con 'acepta' (6.6). `textoBoton` = texto exacto del botón que tocó
 * el paciente (con o sin tilde, tal como lo envió Meta); sin él, el texto del botón aprobado. Lee el nombre
 * de la plantilla en cada llamada.
 */
export function construirConsentimientoInvitacion(textoBoton?: string): string {
    const plantilla = (process.env.NOMBRE_PLANTILLA_LE_INVITACION ?? '').trim();
    const boton = (textoBoton ?? '').trim() || TEXTO_BOTON_SI_DESEO_INGRESAR;
    return `${TEXTO_PLANTILLA_INVITACION_LE} | Botón: ${boton} | Plantilla: ${plantilla}`;
}

/** Botón "Hablar con agente" dentro del horario de atención: enlace al asesor. */
export function mensajeInvitacionAgente(numeroAsesor: string): string {
    return (
        'Con gusto. Haz clic en el siguiente enlace para hablar con un asesor:\n' +
        `👉 *Ir al chat con asesor*: https://wa.me/${numeroAsesor}?text=Hola,%20deseo%20hablar%20con%20una%20asistente.\n\n` +
        'Tu cita sigue igual. Si después decides entrar a la lista de espera, puedes tocar *Si, deseo ingresar* en el mensaje de invitación.'
    );
}

/**
 * Botón "Hablar con agente" fuera del horario de atención. El horario es el que aplica `isWorkingHours()`
 * (lunes a viernes, 7 am a 7 pm); el mensaje del menú (pasoAgente) también menciona los sábados, pero el
 * código no los atiende.
 */
export const MENSAJE_INVITACION_AGENTE_FUERA_HORARIO =
    'En estos momentos nuestros asesores no están disponibles. Nuestro horario de atención es de lunes a viernes ' +
    'de 7 am a 7 pm. 📅⏰\n\n' +
    'Tu cita sigue igual. Si deseas entrar a la lista de espera, puedes tocar *Si, deseo ingresar* en el mensaje de invitación.';

// ---------------------------------------------------------------------------
// Mensajes al paciente
// ---------------------------------------------------------------------------

/** 7.2: solicitud del documento (aceptar con payload, o cualquiera de los dos botones sin payload). */
export const MENSAJE_PEDIR_DOCUMENTO_INVITACION =
    'Para registrar tu decisión, por favor escríbenos tu número de documento, sin puntos ni espacios.';

/** 7.2: varias invitaciones vigentes con el mismo documento y celular (fallback sin payload). */
export const TEXTO_LISTA_INVITACIONES =
    'Encontramos más de una cita. Selecciona la cita a la que deseas asociar esta autorización:';

export const MENSAJE_DOCUMENTO_NO_VALIDO_INVITACION =
    'El número de documento ingresado no es válido. Escríbelo nuevamente, sin puntos ni espacios.';

/** 403 DOCUMENTO_NO_COINCIDE, primer intento (un solo reintento, `MAX_REINTENTOS_DOCUMENTO`). */
export const MENSAJE_DOCUMENTO_NO_COINCIDE_REINTENTO =
    'El documento no coincide con el de la cita de esta invitación. Por favor verifícalo y escríbelo nuevamente.';

/** Fallback sin payload: ninguna invitación vigente con ese documento y este celular (incluye 404). */
export const MENSAJE_SIN_INVITACION_PENDIENTE =
    'No encontramos una invitación pendiente con ese documento para este número de WhatsApp. Tu cita sigue igual. ' +
    'Si necesitas ayuda, escribe *hola*.';

/** 409 CITA_NO_VALIDA / INVITACION_NO_VIGENTE, y 404 INVITACION_NOT_FOUND. */
export const MENSAJE_INVITACION_NO_VIGENTE =
    'Esta invitación ya no está vigente porque tu cita cambió. Si quieres, escribe *hola* para revisar tus opciones. 😊';

/** 403 INVITACION_NO_PERTENECE. */
export const MENSAJE_INVITACION_NO_PERTENECE =
    'No pudimos validar esta invitación desde este número de WhatsApp. Tu cita sigue igual. ' +
    'Si necesitas ayuda, escribe *hola* y elige *Chatear con agente*.';

/** 5xx, timeout o red en `responder` / `por-documento`. */
export const MENSAJE_ERROR_RESPUESTA_INVITACION =
    '❌ No pudimos registrar tu respuesta en este momento, pero tu cita sigue igual. Por favor intenta nuevamente más tarde.';

/** Fila "Ninguna de estas" en la lista del fallback. */
export const MENSAJE_NINGUNA_INVITACION =
    'Entendido, no registramos ninguna respuesta y tus citas siguen igual. Si necesitas ayuda, escribe *hola*. 😊';

export const MENSAJE_SELECCION_REINTENTO_INVITACION = 'Por favor selecciona una de las citas de la lista.';
export const MENSAJE_SELECCION_FINAL_INVITACION =
    'No recibimos una selección válida, así que no registramos ninguna respuesta. Tus citas siguen igual. ' +
    'Si necesitas ayuda, escribe *hola*.';

type DatosCitaInvitacion = { fecha_cita?: string | null; hora_cita?: string | null; profesional?: string | null };

function fechaHora(cita: DatosCitaInvitacion | null | undefined): { fecha: string; hora: string } {
    return {
        fecha: formatearFechaLarga(cita?.fecha_cita ?? ''),
        hora: formatearHoraHHMM(cita?.hora_cita ?? ''),
    };
}

/** ' del 20 de octubre de 2026 a las 09:00' (omite lo que falte). */
function fraseFechaHora(cita: DatosCitaInvitacion | null | undefined): string {
    const { fecha, hora } = fechaHora(cita);
    return `${fecha ? ` del ${fecha}` : ''}${hora ? ` a las ${hora}` : ''}`;
}

/** Primer nombre limpio para el saludo ('' si no hay). */
function nombreSaludo(nombre: unknown): string {
    return limpiarProfesional(nombre).split(' ')[0] ?? '';
}

/** 7.3: aceptación registrada. */
export function mensajeInvitacionAceptada(nombre: unknown, cita: DatosCitaInvitacion | null | undefined): string {
    const saludo = nombreSaludo(nombre);
    const profesional = limpiarProfesional(cita?.profesional);
    return (
        `¡Listo${saludo ? `, ${saludo}` : ''}! Quedaste inscrito en la lista de espera para recibir avisos si se libera ` +
        `un cupo antes con ${profesional || 'el profesional que te atiende'}.\n\n` +
        `Tu cita${fraseFechaHora(cita)} sigue vigente y no ha sido modificada. Si más adelante deseas dejar de recibir ` +
        `estos avisos, puedes escribir: *${TEXTO_COMANDO_RETIRO_LISTA_ESPERA}*.`
    );
}

/** `ya_aceptada`: ya estaba inscrito. */
export function mensajeInvitacionYaAceptada(cita: DatosCitaInvitacion | null | undefined): string {
    return (
        `Ya estabas inscrito en la lista de espera. Tu cita${fraseFechaHora(cita)} sigue vigente y no ha sido modificada. ` +
        `Si deseas salir de la lista de espera, escribe *${TEXTO_COMANDO_RETIRO_LISTA_ESPERA}*.`
    );
}

/** 7.4: rechazo registrado (también `ya_rechazada`). */
export function mensajeInvitacionRechazada(cita: DatosCitaInvitacion | null | undefined): string {
    return `Entendido, no te inscribiremos en la lista de espera. Tu cita${fraseFechaHora(cita)} continúa vigente. 😊`;
}

/** Invitación de la lista elegida (fallback) como datos de cita para los mensajes. */
export function citaDeInvitacion(inv: InvitacionPorDocumento | null | undefined): DatosCitaInvitacion {
    return { fecha_cita: inv?.fecha_cita ?? '', hora_cita: inv?.hora_cita ?? '', profesional: inv?.profesional ?? '' };
}

/** Los datos que devuelve `responder` tienen prioridad; si faltan, los de la invitación elegida. */
export function citaParaMensajeInvitacion(
    respuesta: DatosCitaInvitacion | null | undefined,
    elegida: DatosCitaInvitacion | null | undefined
): DatosCitaInvitacion {
    return {
        fecha_cita: respuesta?.fecha_cita || elegida?.fecha_cita || '',
        hora_cita: respuesta?.hora_cita || elegida?.hora_cita || '',
        profesional: respuesta?.profesional || elegida?.profesional || '',
    };
}

// ---------------------------------------------------------------------------
// Lista de Meta (fallback sin payload, 2 o más invitaciones vigentes)
// ---------------------------------------------------------------------------

/** Lista de Meta (`provider.sendList`) con hasta 9 invitaciones más "Ninguna de estas". */
export function construirListaInvitaciones(invitaciones: InvitacionPorDocumento[]) {
    const visibles = invitaciones.slice(0, MAX_CITAS_EN_LISTA);
    return {
        header: { type: 'text', text: 'Tus citas' },
        body: { text: TEXTO_LISTA_INVITACIONES },
        footer: { text: '' },
        action: {
            button: 'Ver citas',
            sections: [
                {
                    title: 'Citas',
                    rows: [
                        ...visibles.map((inv, indice) => ({
                            id: idFilaCita(indice),
                            title: tituloFilaCita(inv),
                            description: descripcionFilaCita(inv),
                        })),
                        { id: ID_FILA_NINGUNA, title: 'Ninguna de estas', description: 'No registrar ninguna respuesta' },
                    ],
                },
            ],
        },
    };
}
