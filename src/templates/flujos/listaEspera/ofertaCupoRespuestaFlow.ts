// Respuesta a la plantilla de oferta de cupo liberado (Fase 2 de "lista de espera inteligente").
// Ver proyecto-ips/docs/features/2026-09-07-lista-espera-inteligente.md, secciones 13.4-c y 13.7.
//
// La plantilla `oferta_cupo_disponible` tiene botones de respuesta rápida de plantilla ("Sí, lo
// tomo" / "No puedo"). Un botón de plantilla, al tocarse, regresa como texto plano igual al título
// del botón (comportamiento nativo de WhatsApp Cloud API para quick-reply de plantilla) — por eso
// estos `addKeyword` capturan la respuesta directamente, igual que ya hace
// `confirmarCitaDocumentoCampahna48Flow` en templates/flujos/campahna/ejecutarCampahna.ts.
//
// Correlación de identidad: exactamente igual que el resto del sistema (ver 6.2/13.4-c), se pide de
// nuevo el número de documento en vez de intentar correlacionar por `context.id` (descartado por
// @builderbot/provider-meta para mensajes `interactive`).

import { addKeyword, EVENTS } from '@builderbot/bot';
import { responderOfertaCupo, registrarActividadBot, registrarIntencionOfertaCupo } from '../../../services/apiService';
import { sanitizeString, isValidDocumentNumber } from '../../../utils/sanitize';
import { KW_SI_LO_TOMO, KW_NO_PUEDO, OPCIONES_REGEX } from '../keywordsBotones';
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
];
export const VENTANA_CAPTURA_OFERTA_MS = 30 * 60 * 1000;

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

/**
 * Flujo de acción: ya se conoce `numeroDocOfertaCupo` y `respuestaOfertaCupo` ('acepta'|'rechaza')
 * en el estado (los dejó el flujo de captura de documento correspondiente). Llama al backend y
 * responde según el resultado exacto (404/409/200), sin mencionar nunca especialidad ni palabras
 * como "psicología"/"terapia"/"sesión" (regla de privacidad transversal 9.1).
 */
const ofertaCupoAccionFlow = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, endFlow }) => {
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
            trackIdentificacion(ctx.from, numeroDoc, 'encontrado', 'lista_espera.oferta_respuesta');
        }

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
                trackErrorBackend(ctx.from, 'lista_espera.oferta_respuesta', '/chatbot/listaespera/cascada/respuesta', {
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
                trackErrorBackend(ctx.from, 'lista_espera.oferta_respuesta', '/chatbot/listaespera/cascada/respuesta', {
                    siempre: true,
                    cause: CAUSE_POSTGRES_DESPUES_DE_GLOBHO,
                    httpStatus: 502,
                });
                trackFin(ctx.from, 'lista_espera', 'revision_manual', {
                    paso: 'lista_espera.oferta_respuesta',
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
            trackErrorBackend(ctx.from, 'lista_espera.oferta_respuesta', '/chatbot/listaespera/cascada/respuesta', { siempre: true });
            await registrarActividadBot('chat_flujo_lista_espera', ctx.from, {
                step: 'respuesta_oferta',
                resultado: 'error',
                code: resultado.code ?? null
            });
            await flowDynamic('Ocurrió un error procesando tu respuesta. Por favor intenta nuevamente en unos minutos.');
            return terminar();
        }

        if (respuesta === 'rechaza') {
            await registrarActividadBot('chat_flujo_lista_espera', ctx.from, {
                step: 'respuesta_oferta',
                resultado: 'rechazada'
            });
            await flowDynamic('Entendido, gracias por avisarnos. Sigues en la lista de espera y te contactaremos si se libera otro espacio. 😊');
            return terminar();
        }

        // acepta
        const movimiento = resultado.data;
        // Aceptar la oferta mueve la cita al cupo liberado: es una reprogramación.
        trackFin(ctx.from, 'lista_espera', 'cita_reprogramada', { paso: 'lista_espera.oferta_respuesta', metadata: { origen_movimiento: 'oferta_cupo' } });
        await registrarActividadBot('chat_flujo_lista_espera', ctx.from, {
            step: 'respuesta_oferta',
            resultado: 'aceptada'
        });
        const fechaFormateada = formatearFechaCorta(movimiento?.nueva_fecha_cita);
        const profesional = movimiento?.profesional ?? 'el profesional que te atiende';
        const hora = formatearHoraHHMM(movimiento?.nueva_hora_cita ?? ''); // runbook B9: HH:MM
        await flowDynamic(
            `¡Listo! Tu espacio quedó movido a ${fechaFormateada ? fechaFormateada + ' ' : ''}${hora} con ${profesional}. ` +
            'Tu cita anterior quedó liberada para otra persona. Te esperamos. 😊'
        );
        return terminar();
    });

// Coincidencia exacta anclada (runbook B1): ver templates/flujos/keywordsBotones.ts.
const ofertaCupoAceptaDocumentoFlow = addKeyword(KW_SI_LO_TOMO, OPCIONES_REGEX)
    .addAction(async (ctx, { state, flowDynamic, endFlow }) => {
        renovarActividadSesion(ctx.from, 'respuesta_plantilla');
        if (state.getMyState()?.trazaReintentoOfertaAcepta === true) return;
        await state.update({ ofertaAccion: 'acepta', ofertaCapturaDesde: Date.now(), numeroDocOfertaCupo: undefined, respuestaOfertaCupo: undefined });
        // Trazabilidad: respuesta esperada (tabla 11.2), una sola vez (no en el reintento del documento).
        await trackRespuestaCampanaUnaVez(ctx.from, state, 'trazaReintentoOfertaAcepta', 'oferta_cupo', 'acepta_cupo', 'lista_espera.oferta_respuesta');
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
            : 'Para confirmar que el espacio es para ti, por favor digita tu número de documento 🔢:');
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
                trackNoEntendido(ctx.from, 'lista_espera.oferta_respuesta');
                await flowDynamic('El número de documento ingresado no es válido. Intenta nuevamente escribiendo solo tu número de documento 🔢.');
                await state.update({ trazaReintentoOfertaAcepta: true });
                return gotoFlow(ofertaCupoAceptaDocumentoFlow);
            }
            trackPaso(ctx.from, 'lista_espera.oferta_respuesta', 'ok');
            await state.update({ numeroDocOfertaCupo: numeroDoc, respuestaOfertaCupo: 'acepta' });
            return gotoFlow(ofertaCupoAccionFlow);
        }
    );

// Antes ['No puedo'] capturaba cualquier texto que contuviera "no puedo" (p. ej. "hoy no puedo ir").
// Coincidencia exacta anclada (runbook B1): ver templates/flujos/keywordsBotones.ts.
const ofertaCupoRechazaDocumentoFlow = addKeyword(KW_NO_PUEDO, OPCIONES_REGEX)
    .addAction(async (ctx, { state, flowDynamic, endFlow }) => {
        renovarActividadSesion(ctx.from, 'respuesta_plantilla');
        if (state.getMyState()?.trazaReintentoOfertaRechaza === true) return;
        await state.update({ ofertaAccion: 'rechaza', ofertaCapturaDesde: Date.now(), numeroDocOfertaCupo: undefined, respuestaOfertaCupo: undefined });
        // Trazabilidad: respuesta esperada (tabla 11.2), una sola vez (no en el reintento del documento).
        await trackRespuestaCampanaUnaVez(ctx.from, state, 'trazaReintentoOfertaRechaza', 'oferta_cupo', 'rechaza_cupo', 'lista_espera.oferta_respuesta');
        const intencion = await registrarIntencionOfertaCupo(ctx.from, 'rechaza');
        if (intencion.ok && intencion.data.estado === 'rechazada') {
            trackPaso(ctx.from, 'lista_espera.oferta_respuesta', 'ok', { metadata: { via: 'celular' } });
            await registrarActividadBot('chat_flujo_lista_espera', ctx.from, { step: 'respuesta_oferta', resultado: 'rechazada', via: 'celular' });
            await flowDynamic('Entendido, gracias por avisarnos. Sigues en la lista de espera y te contactaremos si se libera otro espacio. 😊');
            await limpiarClavesOferta(state);
            cerrarSesionTraza(ctx.from, 'completado'); closeUserSession(ctx.from, 'completado');
            return endFlow();
        }
        if (intencion.ok && ['vencida', 'sin_oferta'].includes(intencion.data.estado)) {
            await flowDynamic('Gracias por avisarnos. Esa oferta ya no estaba vigente, así que no tienes que hacer nada más. Sigues en la lista de espera.');
            await limpiarClavesOferta(state);
            cerrarSesionTraza(ctx.from, 'completado'); closeUserSession(ctx.from, 'completado');
            return endFlow();
        }
        await flowDynamic('Entendido. Para registrar tu respuesta, por favor digita tu número de documento 🔢:');
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
                trackNoEntendido(ctx.from, 'lista_espera.oferta_respuesta');
                await flowDynamic('El número de documento ingresado no es válido. Intenta nuevamente escribiendo solo tu número de documento 🔢.');
                await state.update({ trazaReintentoOfertaRechaza: true });
                return gotoFlow(ofertaCupoRechazaDocumentoFlow);
            }
            trackPaso(ctx.from, 'lista_espera.oferta_respuesta', 'ok');
            await state.update({ numeroDocOfertaCupo: numeroDoc, respuestaOfertaCupo: 'rechaza' });
            return gotoFlow(ofertaCupoAccionFlow);
        }
    );

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
        paso: 'lista_espera.oferta_respuesta',
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

export { ofertaCupoAceptaDocumentoFlow, ofertaCupoRechazaDocumentoFlow, ofertaCupoAccionFlow };
