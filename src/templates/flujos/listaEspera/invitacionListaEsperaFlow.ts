// Respuesta a la plantilla de invitación a la lista de espera ("Sí, quiero recibir avisos" / "No,
// gracias"): proyecto-ips/docs/features/2026-10-04-campanas-invitacion-lista-espera-implementacion.md,
// secciones 4.1 y 6.6.
//
// Recorrido:
//   1. Entrada por el botón (keyword anclada). Se parsea `ctx.payload` ('LEINV:<invitacion_id>:A|R',
//      utils/invitacionPayload.ts). Si la acción del payload no coincide con el botón, manda el texto del
//      botón (lo que el paciente vio y tocó).
//   2. Cualquiera de los dos botones → documento (captura) → `responder` con
//      `consentimiento_texto`. 403 DOCUMENTO_NO_COINCIDE → un solo reintento del documento.
//   3. Sin payload (fallback, cualquiera de los dos botones) → documento → `por-documento`: 0 → "no
//      encontramos"; 1 → responder sobre esa; 2 o más → lista de Meta (hasta 9 + "Ninguna de estas").
//   La cita NUNCA se toca: `responder` solo crea/re-apunta la inscripción en lista de espera.
//
// Robustez (mismo armazón que ../recordatorios/respuestaRecordatorioComun.ts):
//   - Turno (`invitacionOcupado`) tomado de forma síncrona antes de llamar al backend y soltado al volver
//     a esperar al paciente; un doble toque mientras está tomado termina en silencio. Caduca a los 2 min.
//   - "Salir" cierra como exitFlow; el botón de otra plantilla se deja pasar a su flujo (las capturas son
//     siempre el ÚLTIMO paso de su flujo, ver ../palabrasGlobales.ts).
//   - Captura abandonada > 30 min + texto no reconocido → conversación nueva (welcomeFlow).
//   - `renovarActividadSesion` al entrar y en cada captura, antes de leer o guardar claves.
//   - Claves `invitacion*` (CLAVES_INVITACION) borradas en todo final; todo final cierra la sesión con
//     `closeUserSession`.
//
// Privacidad: de la cita solo se muestran fecha, hora y profesional. Logs sin teléfono ni documento.

import { addKeyword, EVENTS } from '@builderbot/bot';
import {
    consultarInvitacionesPorDocumento,
    responderInvitacion,
    registrarActividadBot,
} from '../../../services/apiService';
import type { InvitacionPorDocumento, ResponderInvitacionRequest } from '../../../services/apiService';
import { sanitizeString, isValidDocumentNumber } from '../../../utils/sanitize';
import { closeUserSession, renovarActividadSesion } from '../../../utils/proactiveSessionManager';
import { MENSAJE_CONVERSACION_TERMINADA } from '../../../utils/estadoConversacion';
import { MAX_REINTENTOS_DOCUMENTO, MENSAJE_DOCUMENTO_FINAL } from '../../../utils/mensajesConfirmacion';
import { esFilaNinguna, indiceDesdeIdFila, MAX_CITAS_EN_LISTA } from '../../../utils/mensajesRecordatorio';
import * as M from '../../../utils/mensajesInvitacionListaEspera';
import { parsearPayloadInvitacion, campanaDeInvitacion } from '../../../utils/invitacionPayload';
import type { AccionInvitacion } from '../../../utils/invitacionPayload';
import { esBotonDeOtraPlantilla, esPalabraSalir, MENSAJE_SALIR } from '../palabrasGlobales';
import { KW_SI_QUIERO_AVISOS, KW_NO_GRACIAS_INVITACION, OPCIONES_REGEX } from '../keywordsBotones';
import {
    trackRespuestaCampana,
    trackPaso,
    trackNoEntendido,
    trackIdentificacion,
    trackErrorBackend,
} from '../../../utils/trazabilidad';
import type { PasoId } from '../../../constants/pasosTrazabilidad';
import { welcomeFlow } from '../../welcomeFlow';

const PASO_DOCUMENTO: PasoId = 'lista_espera.invitacion_documento';
const PASO_SELECCION: PasoId = 'lista_espera.invitacion_selecciona';
const PASO_RESPUESTA: PasoId = 'lista_espera.invitacion_respuesta';

/** Reintentos ante una selección no reconocida en la lista. */
export const MAX_REINTENTOS_SELECCION_INVITACION = 1;
/** Antigüedad a partir de la cual una captura abandonada se descarta ante un texto no reconocido. */
export const VENTANA_CAPTURA_INVITACION_MS = 30 * 60 * 1000;
/** Caducidad del turno por si un callback muriera sin soltarlo. */
const CADUCIDAD_TURNO_MS = 2 * 60 * 1000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Claves propias de estos flujos. Se borran en todo final. */
export const CLAVES_INVITACION: readonly string[] = [
    'invitacionId',
    'invitacionAccion',
    'invitacionVia',
    'invitacionDocumento',
    'invitacionIntentosDoc',
    'invitacionLista',
    'invitacionElegida',
    'invitacionIntentosSeleccion',
    'invitacionOcupado',
    'invitacionCapturaDesde',
];

type Fns = any;

function estado(state: any): Record<string, any> {
    return state?.getMyState?.() ?? {};
}

async function limpiarClavesInvitacion(state: any, opciones?: { conservarTurno?: boolean }): Promise<void> {
    const vacias: Record<string, undefined> = {};
    for (const clave of CLAVES_INVITACION) {
        if (opciones?.conservarTurno && clave === 'invitacionOcupado') continue;
        vacias[clave] = undefined;
    }
    await state.update(vacias);
}

/** Final: claves propias fuera y sesión cerrada (closeUserSession borra el state; ya se leyó lo necesario). */
async function terminar(ctx: any, state: any): Promise<void> {
    await limpiarClavesInvitacion(state);
    closeUserSession(ctx.from, 'completado');
}

function turnoTomado(state: any): boolean {
    const desde = Number(estado(state).invitacionOcupado) || 0;
    return desde > 0 && Date.now() - desde < CADUCIDAD_TURNO_MS;
}

/** Toma el turno de forma SÍNCRONA (el Map del state se escribe dentro del ejecutor de la promesa). */
function tomarTurno(state: any): void {
    void state.update({ invitacionOcupado: Date.now() });
}

/** Suelta el turno y marca el inicio de la siguiente espera de respuesta. */
async function esperarRespuesta(state: any, extra: Record<string, any> = {}): Promise<void> {
    await state.update({ ...extra, invitacionOcupado: undefined, invitacionCapturaDesde: Date.now() });
}

function capturaVencida(state: any): boolean {
    const desde = Number(estado(state).invitacionCapturaDesde) || 0;
    return desde > 0 && Date.now() - desde > VENTANA_CAPTURA_INVITACION_MS;
}

async function registrarActividad(ctx: any, extra: Record<string, unknown>): Promise<void> {
    await registrarActividadBot('chat_flujo_lista_espera', ctx.from, { step: 'invitacion_respuesta', ...extra });
}

/**
 * Palabras globales y turno al inicio de cada captura. Devuelve `undefined` si el callback debe seguir (y
 * en ese caso ya tomó el turno); si no, lo que el callback debe retornar.
 */
async function filtrarEntrada(ctx: any, fns: Fns): Promise<{ salida: any } | undefined> {
    const { state, endFlow } = fns;
    if (esPalabraSalir(ctx.body)) {
        trackPaso(ctx.from, 'comun.salida');
        if (!turnoTomado(state)) await limpiarClavesInvitacion(state);
        closeUserSession(ctx.from, 'salir');
        return { salida: endFlow(MENSAJE_SALIR) };
    }
    if (esBotonDeOtraPlantilla(ctx.body)) {
        // Sin gotoFlow/endFlow/flowDynamic: @builderbot sigue con el flujo de ese botón.
        if (!turnoTomado(state)) {
            await limpiarClavesInvitacion(state);
            closeUserSession(ctx.from, 'completado');
        }
        return { salida: undefined };
    }
    renovarActividadSesion(ctx.from, 'respuesta_plantilla');
    if (turnoTomado(state)) return { salida: endFlow() };
    tomarTurno(state);
    return undefined;
}

async function descartarCapturaVencida(ctx: any, fns: Fns): Promise<any> {
    await terminar(ctx, fns.state);
    return fns.gotoFlow(welcomeFlow);
}

async function errorInesperado(ctx: any, fns: Fns, error: unknown): Promise<any> {
    console.error('[invitaciones] Error en el flujo de respuesta a la invitación:', (error as any)?.message ?? error);
    await terminar(ctx, fns.state);
    try {
        await fns.flowDynamic(M.MENSAJE_ERROR_RESPUESTA_INVITACION);
    } catch {
        // nada más que hacer
    }
    return fns.endFlow();
}

// ---------------------------------------------------------------------------
// Pasos
// ---------------------------------------------------------------------------

/** Pide el documento (captura del flujo `invitacionDocumentoFlow`). Suelta el turno. */
async function pedirDocumento(ctx: any, fns: Fns, extra: Record<string, any> = {}): Promise<any> {
    await esperarRespuesta(fns.state, extra);
    trackPaso(ctx.from, PASO_DOCUMENTO, 'mostrado');
    return fns.gotoFlow(invitacionDocumentoFlow);
}

/** `responder` (turno tomado). Único punto que registra la decisión del paciente. */
async function ejecutarRespuesta(ctx: any, fns: Fns): Promise<any> {
    const { state, flowDynamic, endFlow } = fns;
    const st = estado(state);
    const invitacionId: string | undefined = st.invitacionId;
    const accion: AccionInvitacion | undefined = st.invitacionAccion;
    const documento: string | undefined = st.invitacionDocumento;
    const via: 'payload' | 'documento' = st.invitacionVia === 'payload' ? 'payload' : 'documento';
    const elegida: InvitacionPorDocumento | undefined = st.invitacionElegida;

    if (!invitacionId || !accion || (accion === 'A' && !documento)) {
        await terminar(ctx, state);
        return endFlow(MENSAJE_CONVERSACION_TERMINADA);
    }

    const body: ResponderInvitacionRequest = {
        invitacion_id: invitacionId,
        celular: ctx.from,
        respuesta: accion === 'A' ? 'acepta' : 'rechaza',
        via,
        ...(documento ? { documento } : {}),
        ...(accion === 'A' ? { consentimiento_texto: M.construirConsentimientoInvitacion() } : {}),
    };

    try {
        const resultado = await responderInvitacion(body);

        if (resultado.ok === true) {
            const data = resultado.data;
            const estadoResultado = data?.estado_resultado;
            const cita = M.citaParaMensajeInvitacion(data?.cita, elegida ? M.citaDeInvitacion(elegida) : null);
            if (documento) trackIdentificacion(ctx.from, documento, 'encontrado', PASO_DOCUMENTO);
            trackPaso(ctx.from, PASO_RESPUESTA, 'ok', { metadata: { estado_resultado: estadoResultado ?? null, via } });
            await registrarActividad(ctx, { resultado: estadoResultado ?? 'desconocido', via });
            let mensaje: string;
            if (estadoResultado === 'aceptada') mensaje = M.mensajeInvitacionAceptada(data?.nombre, cita);
            else if (estadoResultado === 'ya_aceptada') mensaje = M.mensajeInvitacionYaAceptada(cita);
            else mensaje = M.mensajeInvitacionRechazada(cita); // 'rechazada' | 'ya_rechazada'
            await terminar(ctx, state);
            await flowDynamic(mensaje);
            return endFlow();
        }

        const { code, cause } = resultado;

        if (code === 403 && cause === 'DOCUMENTO_NO_COINCIDE') {
            trackIdentificacion(ctx.from, documento, 'no_encontrado', PASO_DOCUMENTO);
            const intentos = Number(st.invitacionIntentosDoc) || 0;
            await registrarActividad(ctx, { resultado: 'documento_no_coincide', via });
            if (intentos < MAX_REINTENTOS_DOCUMENTO) {
                await flowDynamic(M.MENSAJE_DOCUMENTO_NO_COINCIDE_REINTENTO);
                // En el fallback, el documento nuevo vuelve a buscar las invitaciones (no la elegida antes).
                return pedirDocumento(ctx, fns, {
                    invitacionIntentosDoc: intentos + 1,
                    invitacionDocumento: undefined,
                    ...(via === 'documento' ? { invitacionId: undefined, invitacionElegida: undefined } : {}),
                });
            }
            await terminar(ctx, state);
            await flowDynamic(MENSAJE_DOCUMENTO_FINAL);
            return endFlow();
        }

        let mensaje: string;
        if (code === 403 && cause === 'INVITACION_NO_PERTENECE') {
            mensaje = M.MENSAJE_INVITACION_NO_PERTENECE;
        } else if (
            (code === 409 && (cause === 'CITA_NO_VALIDA' || cause === 'INVITACION_NO_VIGENTE')) ||
            (code === 404 && cause === 'INVITACION_NOT_FOUND')
        ) {
            mensaje = M.MENSAJE_INVITACION_NO_VIGENTE;
        } else {
            // 5xx, timeout, red, o un 4xx no previsto (400 de validación): no se registró nada.
            trackErrorBackend(ctx.from, PASO_RESPUESTA, '/chatbot/listaespera/invitaciones/responder', {
                siempre: true,
                cause,
                httpStatus: code,
            });
            mensaje = M.MENSAJE_ERROR_RESPUESTA_INVITACION;
        }
        trackPaso(ctx.from, PASO_RESPUESTA, 'error', { metadata: { cause, via } });
        await registrarActividad(ctx, { resultado: cause.toLowerCase(), via });
        await terminar(ctx, state);
        await flowDynamic(mensaje);
        return endFlow();
    } catch (error) {
        return errorInesperado(ctx, fns, error);
    }
}

/** Fallback sin payload (turno tomado): invitaciones vigentes del documento + celular. */
async function buscarPorDocumento(ctx: any, fns: Fns): Promise<any> {
    const { state, flowDynamic, endFlow, provider, gotoFlow } = fns;
    const documento: string = estado(state).invitacionDocumento;
    const consulta = await consultarInvitacionesPorDocumento(documento, ctx.from);

    if (consulta.ok === false && !(consulta.code === 404 && consulta.cause === 'PACIENTE_NOT_FOUND')) {
        trackErrorBackend(ctx.from, PASO_DOCUMENTO, '/chatbot/listaespera/invitaciones/por-documento', {
            siempre: true,
            cause: consulta.cause,
            httpStatus: consulta.code,
        });
        await registrarActividad(ctx, { resultado: 'error_por_documento', via: 'documento' });
        await terminar(ctx, state);
        await flowDynamic(M.MENSAJE_ERROR_RESPUESTA_INVITACION);
        return endFlow();
    }

    const invitaciones: InvitacionPorDocumento[] = consulta.ok === true && Array.isArray(consulta.data?.invitaciones)
        ? consulta.data.invitaciones.filter((inv) => inv && typeof inv.invitacion_id === 'string' && inv.invitacion_id !== '')
        : [];
    trackIdentificacion(ctx.from, documento, invitaciones.length > 0 ? 'encontrado' : 'no_encontrado', PASO_DOCUMENTO);

    if (invitaciones.length === 0) {
        await registrarActividad(ctx, { resultado: 'sin_invitacion', via: 'documento' });
        await terminar(ctx, state);
        await flowDynamic(M.MENSAJE_SIN_INVITACION_PENDIENTE);
        return endFlow();
    }
    if (invitaciones.length === 1) {
        await state.update({ invitacionId: invitaciones[0].invitacion_id, invitacionElegida: invitaciones[0] });
        return ejecutarRespuesta(ctx, fns);
    }
    const visibles = invitaciones.slice(0, MAX_CITAS_EN_LISTA);
    await esperarRespuesta(state, { invitacionLista: visibles, invitacionIntentosSeleccion: 0 });
    trackPaso(ctx.from, PASO_SELECCION, 'mostrado', { metadata: { invitaciones: visibles.length } });
    await provider.sendList(ctx.from, M.construirListaInvitaciones(visibles));
    return gotoFlow(invitacionSeleccionFlow);
}

/** Entrada por cualquiera de los dos botones. */
async function entrada(ctx: any, fns: Fns, accionBoton: AccionInvitacion): Promise<any> {
    const { state } = fns;
    try {
        // Abrir o renovar la sesión ANTES de guardar las claves del flujo (T-02).
        renovarActividadSesion(ctx.from, 'respuesta_plantilla');
        // Doble toque mientras otra respuesta está en curso: termina en silencio. NO se usa endFlow aquí:
        // en @builderbot, endFlow vacía la cola del número (queuePrincipal.clearQueue) y se perdería el
        // mensaje final de la respuesta en curso.
        if (turnoTomado(state)) return;
        // El turno se toma YA, de forma síncrona (sin ningún await entre la lectura y la escritura): un
        // segundo toque que llegue mientras esta entrada espera no debe pasar la comprobación anterior.
        // Lo suelta `pedirDocumento` (al esperar el documento) o `terminar` (en todo final).
        tomarTurno(state);
        await limpiarClavesInvitacion(state, { conservarTurno: true });

        const payload = parsearPayloadInvitacion(ctx?.payload);
        if (payload && payload.accion !== accionBoton) {
            console.warn('[invitaciones] La acción del payload no coincide con el botón; manda el texto del botón.');
        }
        const invitacionId = payload?.invitacionId;
        // Trazabilidad: respuesta esperada a la campaña, una sola vez por toque.
        trackRespuestaCampana(
            ctx.from,
            campanaDeInvitacion(invitacionId),
            accionBoton === 'A' ? 'acepta_invitacion' : 'rechaza_invitacion',
            PASO_RESPUESTA
        );
        await state.update({
            invitacionAccion: accionBoton,
            invitacionId,
            invitacionVia: invitacionId ? 'payload' : 'documento',
            invitacionIntentosDoc: 0,
        });

        return pedirDocumento(ctx, fns);
    } catch (error) {
        return errorInesperado(ctx, fns, error);
    }
}

// ---------------------------------------------------------------------------
// Flujos
// ---------------------------------------------------------------------------

/** Captura del documento. Captura sola: último paso de su flujo. */
const invitacionDocumentoFlow = addKeyword(EVENTS.ACTION).addAnswer(
    M.MENSAJE_PEDIR_DOCUMENTO_INVITACION,
    { capture: true },
    async (ctx, fns) => {
        const filtro = await filtrarEntrada(ctx, fns);
        if (filtro) return filtro.salida;
        const { state, flowDynamic, endFlow } = fns;
        try {
            if (!estado(state).invitacionAccion) {
                await terminar(ctx, state);
                return endFlow(MENSAJE_CONVERSACION_TERMINADA);
            }
            const documento = sanitizeString(ctx.body, 20);
            if (!isValidDocumentNumber(documento)) {
                if (capturaVencida(state)) return descartarCapturaVencida(ctx, fns);
                trackNoEntendido(ctx.from, PASO_DOCUMENTO);
                await flowDynamic(M.MENSAJE_DOCUMENTO_NO_VALIDO_INVITACION);
                return pedirDocumento(ctx, fns);
            }
            trackPaso(ctx.from, PASO_DOCUMENTO, 'ok');
            await state.update({ invitacionDocumento: documento });
            if (estado(state).invitacionId) return ejecutarRespuesta(ctx, fns);
            return buscarPorDocumento(ctx, fns);
        } catch (error) {
            return errorInesperado(ctx, fns, error);
        }
    }
);

/** Elegir la invitación de la lista (fallback, 2 o más). Captura sola: último paso de su flujo. */
const invitacionSeleccionFlow = addKeyword(EVENTS.ACTION).addAction({ capture: true }, async (ctx, fns) => {
    const filtro = await filtrarEntrada(ctx, fns);
    if (filtro) return filtro.salida;
    const { state, flowDynamic, endFlow, gotoFlow, provider } = fns;
    try {
        const lista: InvitacionPorDocumento[] = estado(state).invitacionLista;
        if (!estado(state).invitacionAccion || !Array.isArray(lista) || lista.length === 0) {
            await terminar(ctx, state);
            return endFlow(MENSAJE_CONVERSACION_TERMINADA);
        }
        if (esFilaNinguna(ctx.body)) {
            trackPaso(ctx.from, PASO_SELECCION, 'ok', { metadata: { opcion: 'ninguna' } });
            await registrarActividad(ctx, { resultado: 'ninguna_cita', via: 'documento' });
            await terminar(ctx, state);
            await flowDynamic(M.MENSAJE_NINGUNA_INVITACION);
            return endFlow();
        }
        const indice = indiceDesdeIdFila(ctx.body);
        const elegida = indice !== null && indice < MAX_CITAS_EN_LISTA ? lista[indice] : undefined;
        if (!elegida) {
            if (capturaVencida(state)) return descartarCapturaVencida(ctx, fns);
            trackNoEntendido(ctx.from, PASO_SELECCION);
            const intentos = Number(estado(state).invitacionIntentosSeleccion) || 0;
            if (intentos < MAX_REINTENTOS_SELECCION_INVITACION) {
                await esperarRespuesta(state, { invitacionIntentosSeleccion: intentos + 1 });
                await flowDynamic(M.MENSAJE_SELECCION_REINTENTO_INVITACION);
                await provider.sendList(ctx.from, M.construirListaInvitaciones(lista));
                return gotoFlow(invitacionSeleccionFlow);
            }
            await registrarActividad(ctx, { resultado: 'seleccion_invalida', via: 'documento' });
            await terminar(ctx, state);
            await flowDynamic(M.MENSAJE_SELECCION_FINAL_INVITACION);
            return endFlow();
        }
        trackPaso(ctx.from, PASO_SELECCION, 'ok');
        await state.update({ invitacionId: elegida.invitacion_id, invitacionElegida: elegida });
        return ejecutarRespuesta(ctx, fns);
    } catch (error) {
        return errorInesperado(ctx, fns, error);
    }
});

/** Compatibilidad de exportación histórica; las respuestas siempre pasan por la captura del documento. */
const invitacionRechazoPayloadFlow = addKeyword(EVENTS.ACTION).addAction(async (ctx, fns) => {
    try {
        return await ejecutarRespuesta(ctx, fns);
    } catch (error) {
        return errorInesperado(ctx, fns, error);
    }
});

// Coincidencia exacta anclada (keywordsBotones.ts); se registran al inicio de createFlow (templates/index.ts).
const invitacionAceptaFlow = addKeyword(KW_SI_QUIERO_AVISOS, OPCIONES_REGEX).addAction(
    async (ctx, fns) => entrada(ctx, fns, 'A')
);

const invitacionRechazaFlow = addKeyword(KW_NO_GRACIAS_INVITACION, OPCIONES_REGEX).addAction(
    async (ctx, fns) => entrada(ctx, fns, 'R')
);

export { invitacionAceptaFlow, invitacionRechazaFlow, invitacionDocumentoFlow, invitacionSeleccionFlow, invitacionRechazoPayloadFlow };
