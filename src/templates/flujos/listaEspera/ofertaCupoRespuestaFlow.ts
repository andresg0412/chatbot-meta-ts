// Respuesta a la plantilla de oferta de cupo liberado (Fase 2 de "lista de espera inteligente").
// Ver proyecto-ips/docs/features/2026-09-07-lista-espera-inteligente.md, secciones 13.4-c y 13.7, y
// proyecto-ips/docs/features/2026-10-07-lista-espera-aceptacion-y-escalamientos.md (D1, D1-bis, D10).
//
// La plantilla `cita_disponible_lista_espera` tiene botones de respuesta rápida de plantilla ("Sí, lo
// tomo" / "No puedo" / "Hablar con un agente"). Un botón de plantilla, al tocarse, regresa como texto plano igual
// al título del botón (comportamiento nativo de WhatsApp Cloud API para quick-reply de plantilla) — por eso estos
// `addKeyword` capturan la respuesta directamente, igual que ya hace `confirmarCitaDocumentoCampahna48Flow` en
// templates/flujos/campahna/ejecutarCampahna.ts.
//
// Dos caminos, y el segundo es SIEMPRE el respaldo del primero:
//
//   1. Un toque (D1, con LISTA_ESPERA_OFERTA_PAYLOAD_ENABLED): el botón trae `ctx.payload` = 'LEOFE:<oferta_id>:A|R|G'
//      (utils/ofertaPayload.ts). "Sí, lo tomo" NO acepta de inmediato: el backend registra la intención (prórroga) y
//      el bot muestra los datos del cupo con dos botones de sesión ("Sí, adelantar" / "No, dejar así"). Solo al
//      confirmar se mueve la cita. Esa confirmación es SIN ESTADO (keyword anclada): el backend resuelve la oferta
//      por el id guardado en el state o, si el bot se reinició, por el celular que ya tocó "Sí, lo tomo".
//      "No puedo" rechaza directo. Tras rechazar, con LISTA_ESPERA_PREGUNTA_POST_RECHAZO, se pregunta si sigue en la lista.
//   2. Con documento (el de siempre): se pide de nuevo el número de documento para correlacionar la respuesta
//      (descartado `context.id`, que @builderbot/provider-meta no expone en mensajes `interactive`).
//
// Si algo falla con el id (sin payload, ilegible, oferta no encontrada, celular distinto, varias ofertas, error del
// backend, flag apagado), se pide el documento: el paciente nunca ve un error por eso. Cada caída al camino con
// documento deja su motivo en la trazabilidad (`fallback_documento`). Una oferta VENCIDA con id válido no cae al
// documento: se le informa que ya no está vigente.

import { addKeyword, EVENTS } from '@builderbot/bot';
import {
    responderOfertaCupo,
    responderOfertaCupoSinDocumento,
    registrarActividadBot,
    registrarIntencionOfertaCupo,
    registrarDecisionPostRechazoOfertaCupo,
} from '../../../services/apiService';
import { sanitizeString, isValidDocumentNumber } from '../../../utils/sanitize';
import {
    KW_SI_LO_TOMO,
    KW_NO_PUEDO,
    KW_CONFIRMAR_OFERTA,
    KW_NO_CONFIRMAR_OFERTA,
    TEXTO_BOTON_SEGUIR_LISTA,
    TEXTO_BOTON_SALIR_LISTA,
    OPCIONES_REGEX,
} from '../keywordsBotones';
import { formatearFechaLarga, formatearHoraHHMM } from '../../../utils/fechaHora';
import {
    CAUSE_GLOBHO_ERROR,
    CAUSE_POSTGRES_DESPUES_DE_GLOBHO,
    esErrorGlobhoMovimiento,
    esErrorPostgresTrasGlobho,
    mensajeErrorGlobhoMovimiento,
    mensajeCitaMovidaPendienteVerificacion,
} from '../../../utils/mensajesMovimientoCita';
import { closeUserSession, renovarActividadSesion } from '../../../utils/proactiveSessionManager';
import { trackRespuestaCampanaUnaVez, trackPaso, trackNoEntendido, trackIdentificacion, trackErrorBackend, trackFin, cerrarSesionTraza } from '../../../utils/trazabilidad';
import { isOfertaPayloadEnabled, isPreguntaPostRechazoEnabled } from '../../../utils/listaEsperaFlags';
import { parsearPayloadOferta } from '../../../utils/ofertaPayload';
import type { AccionPayloadOferta, MotivoFallbackOferta } from '../../../utils/ofertaPayload';
import * as M from '../../../utils/mensajesOfertaCupo';
import { aplicarFiltroCaptura, REGEX_ID_MENU } from '../filtroCaptura';
import { esBotonDeOtraPlantilla } from '../palabrasGlobales';
import { welcomeFlow } from '../../welcomeFlow';

// Runbook B2: antes `new Date('YYYY-MM-DD')` (medianoche UTC) formateado en la zona local del proceso
// mostraba el día anterior en America/Bogota. Ahora se formatea desde los componentes de la fecha.
function formatearFechaCorta(fecha?: string): string {
    return formatearFechaLarga(fecha);
}

const CLAVES_OFERTA = [
    'ofertaAccion', 'ofertaCapturaDesde', 'numeroDocOfertaCupo', 'respuestaOfertaCupo',
    'trazaReintentoOfertaAcepta', 'trazaReintentoOfertaRechaza', 'ofertaProrrogada',
    // D1/D10
    'ofertaConfirmarId', 'ofertaConfirmacionMostrada', 'ofertaPostRechazoLE', 'ofertaPostRechazoDesde',
];
export const VENTANA_CAPTURA_OFERTA_MS = 30 * 60 * 1000;
/** Un segundo toque de "Sí, lo tomo" sobre la misma oferta dentro de este plazo no repite el mensaje de confirmación. */
const VENTANA_DOBLE_TOQUE_CONFIRMACION_MS = 2 * 60 * 1000;

const PASO_RESPUESTA = 'lista_espera.oferta_respuesta' as const;
const PASO_CONFIRMACION = 'lista_espera.oferta_confirmacion' as const;
const PASO_POST_RECHAZO = 'lista_espera.post_rechazo' as const;
const ENDPOINT_RESPUESTA = '/chatbot/listaespera/cascada/respuesta';

async function limpiarClavesOferta(state: any): Promise<void> {
    const vacias: Record<string, undefined> = {};
    for (const clave of CLAVES_OFERTA) vacias[clave] = undefined;
    await state.update(vacias);
}

function mensajeOfertaVencida(estadoCupo?: string): string {
    if (estadoCupo === 'asignado') return 'Ese espacio ya fue tomado por otra persona. Sigues en la lista de espera y te avisaremos cuando se libere otro. 😊';
    if (estadoCupo === 'escalado') return 'El tiempo para tomar ese espacio ya terminó, pero le avisamos a nuestro equipo que te interesa. Si sigue libre, te contactarán. Sigues en la lista de espera.';
    return 'Esa oferta ya no está vigente. Sigues en la lista de espera y te avisaremos si se libera otro espacio.';
}

// ---------------------------------------------------------------------------
// Id de la oferta que trae el botón (D1)
// ---------------------------------------------------------------------------

interface IdDelBoton {
    ofertaId: string | null;
    /** Por qué no se usa el id (solo si `ofertaId` es null). */
    motivo: MotivoFallbackOferta | null;
    /** El payload dice otra acción que el texto del botón: gana el texto, el id sigue siendo el de la oferta. */
    accionDistinta: boolean;
}

function idDelBoton(ctx: any, accionBoton: AccionPayloadOferta): IdDelBoton {
    if (!isOfertaPayloadEnabled()) return { ofertaId: null, motivo: 'flag_apagado', accionDistinta: false };
    const crudo = ctx?.payload;
    if (crudo === undefined || crudo === null || crudo === '') return { ofertaId: null, motivo: 'sin_payload', accionDistinta: false };
    const payload = parsearPayloadOferta(crudo);
    if (!payload) return { ofertaId: null, motivo: 'payload_invalido', accionDistinta: false };
    const accionDistinta = payload.accion !== accionBoton;
    if (accionDistinta) {
        console.warn('[ofertaCupo] La acción del payload no coincide con el botón; manda el texto del botón.');
    }
    return { ofertaId: payload.ofertaId, motivo: null, accionDistinta };
}

/** Deja en la trazabilidad por qué se pidió el documento (no ensucia el log cuando el flag está apagado a propósito). */
async function registrarFallback(ctx: any, motivo: MotivoFallbackOferta | null, accion: 'acepta' | 'rechaza'): Promise<void> {
    if (!motivo || motivo === 'flag_apagado') return;
    try {
        await registrarActividadBot('chat_flujo_lista_espera', ctx.from, {
            step: 'respuesta_oferta',
            resultado: 'fallback_documento',
            motivo,
            accion,
        });
    } catch {
        /* la trazabilidad nunca bloquea la respuesta */
    }
}

// ---------------------------------------------------------------------------
// Resultado de responder a la oferta (compartido por documento y por confirmación sin estado)
// ---------------------------------------------------------------------------

/**
 * Cierra la respuesta con el rechazo ya registrado. Con LISTA_ESPERA_PREGUNTA_POST_RECHAZO y la inscripción
 * conocida (D10) pregunta si sigue en la lista y espera su botón; si no, el mensaje de siempre.
 */
async function finalizarRechazo(
    ctx: any,
    fns: any,
    listaEsperaId: string | undefined,
    via: 'documento' | 'celular' | 'payload',
    cerrarSesion: boolean
): Promise<any> {
    const { state, flowDynamic, endFlow, gotoFlow } = fns;
    // Igual que antes: el camino con documento no anota la vía.
    await registrarActividadBot('chat_flujo_lista_espera', ctx.from, {
        step: 'respuesta_oferta',
        resultado: 'rechazada',
        ...(via === 'documento' ? {} : { via })
    });
    if (isPreguntaPostRechazoEnabled() && typeof listaEsperaId === 'string' && listaEsperaId !== '') {
        await limpiarClavesOferta(state);
        await state.update({ ofertaPostRechazoLE: listaEsperaId, ofertaPostRechazoDesde: Date.now() });
        trackPaso(ctx.from, PASO_POST_RECHAZO, 'mostrado');
        await flowDynamic([{ body: M.MENSAJE_POST_RECHAZO, buttons: M.BOTONES_POST_RECHAZO }]);
        return gotoFlow(ofertaPostRechazoFlow);
    }
    await flowDynamic(M.MENSAJE_RECHAZO_SIGUE_EN_LISTA);
    await limpiarClavesOferta(state);
    if (cerrarSesion) closeUserSession(ctx.from, 'completado');
    return endFlow();
}

/**
 * Respuesta del backend a `responder` (rechazo o aceptación). Responde según el resultado exacto (404/409/200),
 * sin mencionar nunca especialidad ni palabras como "psicología"/"terapia"/"sesión" (regla de privacidad
 * transversal 9.1). `documento` solo se usa para la trazabilidad de identificación (undefined en el camino sin documento).
 */
async function procesarResultadoRespuesta(
    ctx: any,
    fns: any,
    resultado: any,
    respuesta: 'acepta' | 'rechaza',
    documento: string | undefined
): Promise<any> {
    const { state, flowDynamic, endFlow } = fns;
    const terminar = async () => { await limpiarClavesOferta(state); return endFlow(); };
    const via: 'documento' | 'payload' = documento ? 'documento' : 'payload';

    if (!resultado.ok) {
        if (resultado.code === 404) {
            await registrarActividadBot('chat_flujo_lista_espera', ctx.from, {
                step: 'respuesta_oferta',
                resultado: 'sin_oferta_activa'
            });
            await flowDynamic('Ya no tienes ninguna oferta de cupo pendiente en este momento.');
            return terminar();
        }
        if (resultado.code === 409) {
            await registrarActividadBot('chat_flujo_lista_espera', ctx.from, {
                step: 'respuesta_oferta',
                resultado: 'cupo_ya_asignado'
            });
            await flowDynamic('Ese espacio ya fue tomado por otra persona, lo sentimos. Sigues en la lista de espera para el siguiente que se libere.');
            return terminar();
        }
        if (esErrorGlobhoMovimiento(resultado.code, resultado.cause)) {
            const citaAnteriorRestaurada = resultado.citaAnteriorRestaurada === true;
            trackErrorBackend(ctx.from, PASO_RESPUESTA, ENDPOINT_RESPUESTA, {
                siempre: true,
                cause: CAUSE_GLOBHO_ERROR,
                httpStatus: 502,
            });
            await registrarActividadBot('chat_flujo_lista_espera', ctx.from, {
                step: 'respuesta_oferta',
                resultado: 'error_globho',
                code: 502,
                cita_anterior_restaurada: citaAnteriorRestaurada
            });
            await flowDynamic(mensajeErrorGlobhoMovimiento(citaAnteriorRestaurada));
            return terminar();
        }
        if (esErrorPostgresTrasGlobho(resultado.code, resultado.cause)) {
            // T-01: la cita SÍ quedó movida en Globho al cupo ofrecido, pero no quedó registrada en
            // Postgres. El backend ya dejó la oferta aceptada y el cupo asignado: reintentar no tiene
            // sentido. Se muestra el nuevo horario (viene en `data`) y se deriva al asesor.
            trackErrorBackend(ctx.from, PASO_RESPUESTA, ENDPOINT_RESPUESTA, {
                siempre: true,
                cause: CAUSE_POSTGRES_DESPUES_DE_GLOBHO,
                httpStatus: 502,
            });
            trackFin(ctx.from, 'lista_espera', 'revision_manual', {
                paso: PASO_RESPUESTA,
                metadata: { origen_movimiento: 'oferta_cupo', cause: CAUSE_POSTGRES_DESPUES_DE_GLOBHO, cita_creada_en_globho: true },
            });
            await registrarActividadBot('chat_flujo_lista_espera', ctx.from, {
                step: 'respuesta_oferta',
                resultado: 'postgres_despues_de_globho',
                code: 502,
                cita_creada_en_globho: true
            });
            await flowDynamic(mensajeCitaMovidaPendienteVerificacion(resultado.nuevaFechaCita, resultado.nuevaHoraCita));
            closeUserSession(ctx.from, 'completado');
            return terminar();
        }
        trackErrorBackend(ctx.from, PASO_RESPUESTA, ENDPOINT_RESPUESTA, { siempre: true });
        await registrarActividadBot('chat_flujo_lista_espera', ctx.from, {
            step: 'respuesta_oferta',
            resultado: 'error',
            code: resultado.code ?? null
        });
        await flowDynamic('Ocurrió un error procesando tu respuesta. Por favor intenta nuevamente en unos minutos.');
        return terminar();
    }

    if (respuesta === 'rechaza') {
        return finalizarRechazo(ctx, fns, resultado.data?.lista_espera_id, via, false);
    }

    // acepta
    const movimiento = resultado.data;
    // Aceptar la oferta mueve la cita al cupo liberado: es una reprogramación.
    trackFin(ctx.from, 'lista_espera', 'cita_reprogramada', { paso: PASO_RESPUESTA, metadata: { origen_movimiento: 'oferta_cupo' } });
    await registrarActividadBot('chat_flujo_lista_espera', ctx.from, {
        step: 'respuesta_oferta',
        resultado: 'aceptada',
        ...(documento ? {} : { via })
    });
    const fechaFormateada = formatearFechaCorta(movimiento?.nueva_fecha_cita);
    const profesional = movimiento?.profesional ?? 'el profesional que te atiende';
    const hora = formatearHoraHHMM(movimiento?.nueva_hora_cita ?? ''); // runbook B9: HH:MM
    await flowDynamic(
        `¡Listo! Tu espacio quedó movido a ${fechaFormateada ? fechaFormateada + ' ' : ''}${hora} con ${profesional}. ` +
        'Tu cita anterior quedó liberada para otra persona. Te esperamos. 😊'
    );
    return terminar();
}

/**
 * Flujo de acción (camino con documento): ya se conoce `numeroDocOfertaCupo` y `respuestaOfertaCupo`
 * ('acepta'|'rechaza') en el estado (los dejó el flujo de captura de documento correspondiente).
 */
const ofertaCupoAccionFlow = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, fns) => {
        const { state, flowDynamic, endFlow } = fns;
        const terminar = async () => { await limpiarClavesOferta(state); return endFlow(); };
        const numeroDoc = state.getMyState().numeroDocOfertaCupo;
        const respuesta = state.getMyState().respuestaOfertaCupo as 'acepta' | 'rechaza' | undefined;

        if (!numeroDoc || !respuesta) {
            cerrarSesionTraza(ctx.from, 'completado');
            await flowDynamic('No pudimos identificar tu respuesta. Por favor intenta nuevamente.');
            return terminar();
        }

        const resultado = await responderOfertaCupo(numeroDoc, ctx.from, respuesta);
        // Trazabilidad: la sesión de la respuesta a la oferta termina aquí en todos los casos.
        cerrarSesionTraza(ctx.from, 'completado');
        if (resultado.ok || resultado.code === 409) {
            trackIdentificacion(ctx.from, numeroDoc, 'encontrado', PASO_RESPUESTA);
        }
        return procesarResultadoRespuesta(ctx, fns, resultado, respuesta, numeroDoc);
    });

// ---------------------------------------------------------------------------
// "Sí, lo tomo"
// ---------------------------------------------------------------------------

/**
 * Camino de un toque para "Sí, lo tomo" (D1). Devuelve:
 *   - { terminado: true } si ya respondió al paciente (confirmación mostrada, oferta vencida, ya respondida);
 *   - { terminado: false, motivo } si hay que pedir el documento.
 */
async function aceptarConIdDelBoton(ctx: any, fns: any, ofertaId: string): Promise<{ terminado: true } | { terminado: false; motivo: MotivoFallbackOferta }> {
    const { state, flowDynamic } = fns;

    // Doble toque de la misma oferta: ya se mostró la confirmación hace instantes, no se repite.
    const previa = state.getMyState()?.ofertaConfirmacionMostrada;
    if (previa && previa.ofertaId === ofertaId && Date.now() - Number(previa.at) < VENTANA_DOBLE_TOQUE_CONFIRMACION_MS) {
        return { terminado: true };
    }

    const intencion = await registrarIntencionOfertaCupo(ctx.from, 'acepta', ofertaId);
    if (intencion.ok !== true) return { terminado: false, motivo: 'error_backend' };
    const datos = intencion.data;

    switch (datos.estado) {
        case 'vigente': {
            if (!datos.cupo || !datos.cupo.fecha_cita || !datos.cupo.hora_cita) return { terminado: false, motivo: 'error_backend' };
            await state.update({
                ofertaConfirmarId: datos.oferta_id ?? ofertaId,
                ofertaConfirmacionMostrada: { ofertaId, at: Date.now() },
            });
            trackPaso(ctx.from, PASO_CONFIRMACION, 'mostrado');
            await registrarActividadBot('chat_flujo_lista_espera', ctx.from, {
                step: 'respuesta_oferta',
                resultado: 'confirmacion_mostrada',
                via: 'payload',
            });
            await flowDynamic([{
                body: M.mensajeConfirmarOferta(datos.cupo, (datos as any).minutos_para_confirmar),
                buttons: M.BOTONES_CONFIRMAR_OFERTA,
            }]);
            return { terminado: true };
        }
        case 'vencida':
            await registrarActividadBot('chat_flujo_lista_espera', ctx.from, { step: 'respuesta_oferta', resultado: 'vencida', via: 'payload' });
            await flowDynamic(mensajeOfertaVencida(datos.estado_cupo));
            cerrarSesionTraza(ctx.from, 'completado');
            closeUserSession(ctx.from, 'completado');
            return { terminado: true };
        case 'ya_respondida':
            await flowDynamic(M.MENSAJE_OFERTA_YA_RESPONDIDA);
            cerrarSesionTraza(ctx.from, 'completado');
            closeUserSession(ctx.from, 'completado');
            return { terminado: true };
        case 'celular_distinto':
            return { terminado: false, motivo: 'celular_distinto' };
        case 'ambigua':
            return { terminado: false, motivo: 'varias_ofertas' };
        case 'oferta_no_encontrada':
        case 'sin_oferta':
            return { terminado: false, motivo: 'oferta_no_encontrada' };
        default:
            return { terminado: false, motivo: 'error_backend' };
    }
}

// Coincidencia exacta anclada (runbook B1): ver templates/flujos/keywordsBotones.ts.
const ofertaCupoAceptaDocumentoFlow = addKeyword(KW_SI_LO_TOMO, OPCIONES_REGEX)
    .addAction(async (ctx, fns) => {
        const { state, flowDynamic, endFlow } = fns;
        renovarActividadSesion(ctx.from, 'respuesta_plantilla');
        if (state.getMyState()?.trazaReintentoOfertaAcepta === true) return;

        // D1: con el id del botón, primero el camino de un toque.
        const { ofertaId, motivo, accionDistinta } = idDelBoton(ctx, 'A');
        let motivoFallback: MotivoFallbackOferta | null = motivo;
        if (ofertaId) {
            await trackRespuestaCampanaUnaVez(ctx.from, state, 'trazaReintentoOfertaAcepta', 'oferta_cupo', 'acepta_cupo', PASO_RESPUESTA);
            if (accionDistinta) {
                await registrarActividadBot('chat_flujo_lista_espera', ctx.from, { step: 'respuesta_oferta', resultado: 'payload_accion_distinta', accion: 'acepta' });
            }
            const intento = await aceptarConIdDelBoton(ctx, fns, ofertaId);
            if (intento.terminado === true) return endFlow();
            motivoFallback = (intento as { motivo: MotivoFallbackOferta }).motivo;
            await registrarFallback(ctx, motivoFallback, 'acepta');
        } else {
            await registrarFallback(ctx, motivoFallback, 'acepta');
        }

        await state.update({ ofertaAccion: 'acepta', ofertaCapturaDesde: Date.now(), numeroDocOfertaCupo: undefined, respuestaOfertaCupo: undefined });
        // Trazabilidad: respuesta esperada (tabla 11.2), una sola vez (no en el reintento del documento).
        if (!ofertaId) await trackRespuestaCampanaUnaVez(ctx.from, state, 'trazaReintentoOfertaAcepta', 'oferta_cupo', 'acepta_cupo', PASO_RESPUESTA);
        const intencion = await registrarIntencionOfertaCupo(ctx.from, 'acepta');
        if (intencion.ok && intencion.data.estado === 'vencida') {
            await flowDynamic(mensajeOfertaVencida(intencion.data.estado_cupo));
            await limpiarClavesOferta(state);
            cerrarSesionTraza(ctx.from, 'completado'); closeUserSession(ctx.from, 'completado');
            return endFlow();
        }
        if (intencion.ok && intencion.data.estado === 'sin_oferta') {
            await flowDynamic('Ya no tienes ninguna oferta de cupo pendiente en este momento.');
            await limpiarClavesOferta(state);
            cerrarSesionTraza(ctx.from, 'completado'); closeUserSession(ctx.from, 'completado');
            return endFlow();
        }
        const prorrogada = intencion.ok && intencion.data.estado === 'vigente' && intencion.data.prorrogada === true;
        await state.update({ ofertaProrrogada: prorrogada });
        await flowDynamic(prorrogada
            ? 'Para confirmar que el espacio es para ti, escribe tu número de documento 🔢. Tienes unos minutos para hacerlo.'
            : M.MENSAJE_PEDIR_DOCUMENTO_OFERTA_ACEPTAR);
    })
    .addAnswer(
        '',
        { capture: true },
        async (ctx, fns) => {
            const filtro = await filtrarCapturaOferta(ctx, fns, 'acepta', ofertaCupoAceptaDocumentoFlow);
            if (filtro) return filtro.salida;
            const { state, gotoFlow, flowDynamic } = fns;
            const numeroDoc = sanitizeString(ctx.body, 20);
            if (!isValidDocumentNumber(numeroDoc)) {
                trackNoEntendido(ctx.from, PASO_RESPUESTA);
                await flowDynamic('El número de documento ingresado no es válido. Intenta nuevamente escribiendo solo tu número de documento 🔢.');
                await state.update({ trazaReintentoOfertaAcepta: true });
                return gotoFlow(ofertaCupoAceptaDocumentoFlow);
            }
            trackPaso(ctx.from, PASO_RESPUESTA, 'ok');
            await state.update({ numeroDocOfertaCupo: numeroDoc, respuestaOfertaCupo: 'acepta' });
            return gotoFlow(ofertaCupoAccionFlow);
        }
    );

// ---------------------------------------------------------------------------
// "No puedo"
// ---------------------------------------------------------------------------

// Antes ['No puedo'] capturaba cualquier texto que contuviera "no puedo" (p. ej. "hoy no puedo ir").
// Coincidencia exacta anclada (runbook B1): ver templates/flujos/keywordsBotones.ts.
const ofertaCupoRechazaDocumentoFlow = addKeyword(KW_NO_PUEDO, OPCIONES_REGEX)
    .addAction(async (ctx, fns) => {
        const { state, flowDynamic, endFlow } = fns;
        renovarActividadSesion(ctx.from, 'respuesta_plantilla');
        if (state.getMyState()?.trazaReintentoOfertaRechaza === true) return;

        // D1: con el id del botón, el rechazo se registra directo (sin documento).
        const { ofertaId, motivo, accionDistinta } = idDelBoton(ctx, 'R');
        let motivoFallback: MotivoFallbackOferta | null = motivo;
        if (ofertaId) {
            await trackRespuestaCampanaUnaVez(ctx.from, state, 'trazaReintentoOfertaRechaza', 'oferta_cupo', 'rechaza_cupo', PASO_RESPUESTA);
            if (accionDistinta) {
                await registrarActividadBot('chat_flujo_lista_espera', ctx.from, { step: 'respuesta_oferta', resultado: 'payload_accion_distinta', accion: 'rechaza' });
            }
            const intencion = await registrarIntencionOfertaCupo(ctx.from, 'rechaza', ofertaId);
            if (intencion.ok !== true) {
                motivoFallback = 'error_backend';
            } else if (intencion.data.estado === 'rechazada') {
                trackPaso(ctx.from, PASO_RESPUESTA, 'ok', { metadata: { via: 'payload' } });
                cerrarSesionTraza(ctx.from, 'completado');
                return finalizarRechazo(ctx, fns, intencion.data.lista_espera_id, 'payload', true);
            } else if (intencion.data.estado === 'vencida' || intencion.data.estado === 'ya_respondida') {
                await flowDynamic('Gracias por avisarnos. Esa oferta ya no estaba vigente, así que no tienes que hacer nada más. Sigues en la lista de espera.');
                await limpiarClavesOferta(state);
                cerrarSesionTraza(ctx.from, 'completado'); closeUserSession(ctx.from, 'completado');
                return endFlow();
            } else if (intencion.data.estado === 'celular_distinto') {
                motivoFallback = 'celular_distinto';
            } else if (intencion.data.estado === 'ambigua') {
                motivoFallback = 'varias_ofertas';
            } else {
                motivoFallback = 'oferta_no_encontrada';
            }
            await registrarFallback(ctx, motivoFallback, 'rechaza');
        } else {
            await registrarFallback(ctx, motivoFallback, 'rechaza');
        }

        await state.update({ ofertaAccion: 'rechaza', ofertaCapturaDesde: Date.now(), numeroDocOfertaCupo: undefined, respuestaOfertaCupo: undefined });
        // Trazabilidad: respuesta esperada (tabla 11.2), una sola vez (no en el reintento del documento).
        if (!ofertaId) await trackRespuestaCampanaUnaVez(ctx.from, state, 'trazaReintentoOfertaRechaza', 'oferta_cupo', 'rechaza_cupo', PASO_RESPUESTA);
        const intencion = await registrarIntencionOfertaCupo(ctx.from, 'rechaza');
        if (intencion.ok && intencion.data.estado === 'rechazada') {
            trackPaso(ctx.from, PASO_RESPUESTA, 'ok', { metadata: { via: 'celular' } });
            cerrarSesionTraza(ctx.from, 'completado');
            return finalizarRechazo(ctx, fns, intencion.data.lista_espera_id, 'celular', true);
        }
        if (intencion.ok && ['vencida', 'sin_oferta'].includes(intencion.data.estado)) {
            await flowDynamic('Gracias por avisarnos. Esa oferta ya no estaba vigente, así que no tienes que hacer nada más. Sigues en la lista de espera.');
            await limpiarClavesOferta(state);
            cerrarSesionTraza(ctx.from, 'completado'); closeUserSession(ctx.from, 'completado');
            return endFlow();
        }
        await flowDynamic(M.MENSAJE_PEDIR_DOCUMENTO_OFERTA_RECHAZAR);
    })
    .addAnswer(
        '',
        { capture: true },
        async (ctx, fns) => {
            const filtro = await filtrarCapturaOferta(ctx, fns, 'rechaza', ofertaCupoRechazaDocumentoFlow);
            if (filtro) return filtro.salida;
            const { state, gotoFlow, flowDynamic } = fns;
            const numeroDoc = sanitizeString(ctx.body, 20);
            if (!isValidDocumentNumber(numeroDoc)) {
                trackNoEntendido(ctx.from, PASO_RESPUESTA);
                await flowDynamic('El número de documento ingresado no es válido. Intenta nuevamente escribiendo solo tu número de documento 🔢.');
                await state.update({ trazaReintentoOfertaRechaza: true });
                return gotoFlow(ofertaCupoRechazaDocumentoFlow);
            }
            trackPaso(ctx.from, PASO_RESPUESTA, 'ok');
            await state.update({ numeroDocOfertaCupo: numeroDoc, respuestaOfertaCupo: 'rechaza' });
            return gotoFlow(ofertaCupoAccionFlow);
        }
    );

// ---------------------------------------------------------------------------
// Confirmación de un toque (D1): "Sí, adelantar" / "No, dejar así" — SIN ESTADO
// ---------------------------------------------------------------------------

/**
 * Respuesta a los botones de la confirmación. No usa captura: la keyword anclada atiende el botón aunque el bot
 * se haya reiniciado o la conversación haya pasado por otros flujos. La oferta se identifica con el id guardado
 * al mostrar la confirmación o, si se perdió, por el celular (el backend exige que ya haya tocado "Sí, lo tomo").
 * Si el backend no puede resolverla (ambigua, celular distinto, sin confirmación previa), se pide el documento.
 */
async function responderConfirmacion(ctx: any, fns: any, respuesta: 'acepta' | 'rechaza'): Promise<any> {
    const { state, flowDynamic, endFlow, gotoFlow } = fns;
    renovarActividadSesion(ctx.from, 'respuesta_plantilla');
    try {
        const ofertaId: string | undefined = state.getMyState()?.ofertaConfirmarId;
        const resultado = await responderOfertaCupoSinDocumento(ctx.from, respuesta, ofertaId);

        const pideDocumento =
            !resultado.ok &&
            ((resultado.code === 403 && resultado.cause === 'CELULAR_NO_COINCIDE') ||
                (resultado.code === 404 && resultado.cause === 'OFERTA_NOT_FOUND') ||
                (resultado.code === 409 && (resultado.cause === 'OFERTA_AMBIGUA' || resultado.cause === 'CONFIRMACION_REQUERIDA')));
        // Sin respuesta del backend (red, 5xx) la oferta no se tocó: también se puede seguir con el documento.
        const sinRespuesta = !resultado.ok && resultado.code === undefined;
        if (pideDocumento || sinRespuesta) {
            const motivo: MotivoFallbackOferta =
                resultado.cause === 'CELULAR_NO_COINCIDE' ? 'celular_distinto'
                : resultado.cause === 'OFERTA_AMBIGUA' ? 'varias_ofertas'
                : resultado.cause === 'OFERTA_NOT_FOUND' ? 'oferta_no_encontrada'
                : 'error_backend';
            await registrarFallback(ctx, motivo, respuesta);
            const reintento = respuesta === 'acepta' ? 'trazaReintentoOfertaAcepta' : 'trazaReintentoOfertaRechaza';
            await state.update({
                ofertaAccion: respuesta, ofertaCapturaDesde: Date.now(), numeroDocOfertaCupo: undefined,
                respuestaOfertaCupo: undefined, [reintento]: true,
            });
            await flowDynamic(respuesta === 'acepta' ? M.MENSAJE_PEDIR_DOCUMENTO_OFERTA_ACEPTAR : M.MENSAJE_PEDIR_DOCUMENTO_OFERTA_RECHAZAR);
            return gotoFlow(respuesta === 'acepta' ? ofertaCupoAceptaDocumentoFlow : ofertaCupoRechazaDocumentoFlow);
        }

        // Trazabilidad: la sesión de la respuesta a la oferta termina aquí en todos los casos.
        cerrarSesionTraza(ctx.from, 'completado');
        if (resultado.ok) trackPaso(ctx.from, PASO_CONFIRMACION, 'ok', { metadata: { decision: respuesta } });
        return procesarResultadoRespuesta(ctx, fns, resultado, respuesta, undefined);
    } catch (error: any) {
        console.error('[ofertaCupo] Error en la confirmación de la oferta:', error?.message ?? error);
        await limpiarClavesOferta(state);
        await flowDynamic('Ocurrió un error procesando tu respuesta. Por favor intenta nuevamente en unos minutos.');
        return endFlow();
    }
}

const ofertaCupoConfirmaFlow = addKeyword(KW_CONFIRMAR_OFERTA, OPCIONES_REGEX)
    .addAction(async (ctx, fns) => responderConfirmacion(ctx, fns, 'acepta'));

const ofertaCupoNoConfirmaFlow = addKeyword(KW_NO_CONFIRMAR_OFERTA, OPCIONES_REGEX)
    .addAction(async (ctx, fns) => responderConfirmacion(ctx, fns, 'rechaza'));

// ---------------------------------------------------------------------------
// Pregunta de seguir en la lista tras rechazar (D10)
// ---------------------------------------------------------------------------

/** "Sí, seguir" / "No, gracias" tocados, o escritos a mano como respuesta a la pregunta. */
function decisionPostRechazo(texto: string): 'sigue' | 'sale' | null {
    if (texto === TEXTO_BOTON_SEGUIR_LISTA || /^s[ií]\s*(,\s*)?(seguir)?\s*[.!]*$/i.test(texto)) return 'sigue';
    if (texto === TEXTO_BOTON_SALIR_LISTA || /^no\s*(,\s*)?(gracias)?\s*[.!]*$/i.test(texto)) return 'sale';
    return null;
}

/**
 * Captura de la respuesta a la pregunta. Es el ÚLTIMO paso de su flujo (ver palabrasGlobales.ts). "No, gracias"
 * también es el botón de la invitación a la lista (invitacionRechazaFlow, registrado antes en createFlow): dentro
 * de esta captura gana la captura porque su callback termina con endFlow. Si el paciente no contesta, o escribe
 * otra cosa, sigue en la lista como hasta ahora.
 */
const ofertaPostRechazoFlow = addKeyword(EVENTS.ACTION).addAction({ capture: true }, async (ctx, fns) => {
    renovarActividadSesion(ctx.from, 'respuesta_plantilla');
    const { state, flowDynamic, endFlow, gotoFlow } = fns;
    const estado = state.getMyState() ?? {};
    const listaEsperaId: string | undefined = estado.ofertaPostRechazoLE;
    const texto = typeof ctx.body === 'string' ? ctx.body.trim() : '';
    const decision = decisionPostRechazo(texto);

    if (decision && listaEsperaId) {
        const resultado = await registrarDecisionPostRechazoOfertaCupo(listaEsperaId, ctx.from, decision);
        trackPaso(ctx.from, PASO_POST_RECHAZO, 'ok', { metadata: { decision, estado: resultado.ok ? resultado.data.estado : 'error' } });
        await registrarActividadBot('chat_flujo_lista_espera', ctx.from, {
            step: 'post_rechazo',
            resultado: decision === 'sale' ? 'sale' : 'sigue',
            ok: resultado.ok,
        });
        await limpiarClavesOferta(state);
        closeUserSession(ctx.from, 'completado');
        if (decision === 'sale') {
            await flowDynamic(resultado.ok && ['retirada', 'no_activa'].includes(resultado.data.estado)
                ? M.MENSAJE_POST_RECHAZO_SALE
                : M.MENSAJE_POST_RECHAZO_ERROR_SALIDA);
        } else {
            await flowDynamic(resultado.ok ? M.MENSAJE_POST_RECHAZO_SIGUE : M.MENSAJE_POST_RECHAZO_ERROR_SIGUE);
        }
        return endFlow();
    }

    // Otro botón de plantilla, una opción del menú o "Salir": se atienden como en el resto de capturas.
    const filtro = await aplicarFiltroCaptura(ctx, fns, { paso: PASO_POST_RECHAZO, reintentar: () => gotoFlow(ofertaPostRechazoFlow) });
    if (filtro) {
        if (filtro.salida === undefined) await limpiarClavesOferta(state);
        return filtro.salida;
    }

    // Cualquier otro texto: no contestó la pregunta. Sigue en la lista; se atiende como conversación nueva.
    const desde = Number(estado.ofertaPostRechazoDesde) || 0;
    trackPaso(ctx.from, PASO_POST_RECHAZO, 'ok', { metadata: { decision: 'sin_respuesta', vencida: desde === 0 || Date.now() - desde > VENTANA_CAPTURA_OFERTA_MS } });
    await limpiarClavesOferta(state);
    closeUserSession(ctx.from, 'completado');
    return gotoFlow(welcomeFlow);
});

// ---------------------------------------------------------------------------
// Capturas del documento
// ---------------------------------------------------------------------------

async function filtrarCapturaOferta(ctx: any, fns: any, accion: 'acepta' | 'rechaza', flujoActual: any): Promise<{ salida: any } | undefined> {
    renovarActividadSesion(ctx.from, 'respuesta_plantilla');
    const state = fns.state;
    const s = state.getMyState() ?? {};
    const texto = typeof ctx.body === 'string' ? ctx.body.trim() : '';
    const accionBoton = texto === 'Sí, lo tomo' ? 'acepta' : texto === 'No puedo' ? 'rechaza' : null;
    const desde = Number(s.ofertaCapturaDesde) || 0;
    const vencida = desde === 0 || Date.now() - desde > VENTANA_CAPTURA_OFERTA_MS;

    if (accionBoton) {
        if (vencida) {
            await limpiarClavesOferta(state);
            return { salida: undefined };
        }
        if (accionBoton === accion) {
            const retry = accion === 'acepta' ? 'trazaReintentoOfertaAcepta' : 'trazaReintentoOfertaRechaza';
            await fns.flowDynamic('Ya recibimos tu respuesta. Ahora escribe tu número de documento 🔢');
            await state.update({ [retry]: true });
            return { salida: await fns.gotoFlow(flujoActual) };
        }
        await limpiarClavesOferta(state);
        return { salida: undefined };
    }
    if (esBotonDeOtraPlantilla(ctx.body)) {
        await limpiarClavesOferta(state);
        return { salida: undefined };
    }
    if (typeof ctx.body === 'string' && REGEX_ID_MENU.test(ctx.body)) {
        await limpiarClavesOferta(state);
        return { salida: undefined };
    }

    const filtro = await aplicarFiltroCaptura(ctx, fns, {
        paso: PASO_RESPUESTA,
        reintentar: () => fns.gotoFlow(flujoActual),
    });
    if (filtro) return filtro;
    if (vencida) {
        await limpiarClavesOferta(state);
        closeUserSession(ctx.from, 'completado');
        return { salida: await fns.gotoFlow(welcomeFlow) };
    }
    return undefined;
}

export {
    ofertaCupoAceptaDocumentoFlow,
    ofertaCupoRechazaDocumentoFlow,
    ofertaCupoAccionFlow,
    ofertaCupoConfirmaFlow,
    ofertaCupoNoConfirmaFlow,
    ofertaPostRechazoFlow,
};
