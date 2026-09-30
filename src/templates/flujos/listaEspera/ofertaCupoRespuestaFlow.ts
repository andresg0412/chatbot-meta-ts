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
import { responderOfertaCupo, registrarActividadBot } from '../../../services/apiService';
import { sanitizeString, isValidDocumentNumber } from '../../../utils/sanitize';
import { KW_SI_LO_TOMO, KW_NO_PUEDO, OPCIONES_REGEX } from '../keywordsBotones';
import { formatearFechaLarga, formatearHoraHHMM } from '../../../utils/fechaHora';
import { trackRespuestaCampana, trackRespuestaCampanaUnaVez, trackPaso, trackNoEntendido, trackIdentificacion, trackErrorBackend, trackFin, cerrarSesionTraza, asegurarSesionTraza } from '../../../utils/trazabilidad';

// Runbook B2: antes `new Date('YYYY-MM-DD')` (medianoche UTC) formateado en la zona local del proceso
// mostraba el día anterior en America/Bogota. Ahora se formatea desde los componentes de la fecha.
function formatearFechaCorta(fecha?: string): string {
    return formatearFechaLarga(fecha);
}

/**
 * Flujo de acción: ya se conoce `numeroDocOfertaCupo` y `respuestaOfertaCupo` ('acepta'|'rechaza')
 * en el estado (los dejó el flujo de captura de documento correspondiente). Llama al backend y
 * responde según el resultado exacto (404/409/200), sin mencionar nunca especialidad ni palabras
 * como "psicología"/"terapia"/"sesión" (regla de privacidad transversal 9.1).
 */
const ofertaCupoAccionFlow = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, endFlow }) => {
        const numeroDoc = state.getMyState().numeroDocOfertaCupo;
        const respuesta = state.getMyState().respuestaOfertaCupo as 'acepta' | 'rechaza' | undefined;

        if (!numeroDoc || !respuesta) {
            cerrarSesionTraza(ctx.from, 'completado');
            await flowDynamic('No pudimos identificar tu respuesta. Por favor intenta nuevamente.');
            return endFlow();
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
                return endFlow();
            }
            if (resultado.code === 409) {
                await registrarActividadBot('chat_flujo_lista_espera', ctx.from, {
                    step: 'respuesta_oferta',
                    resultado: 'cupo_ya_asignado'
                });
                await flowDynamic('Ese espacio ya fue tomado por otra persona, lo sentimos. Sigues en la lista de espera para el siguiente que se libere.');
                return endFlow();
            }
            trackErrorBackend(ctx.from, 'lista_espera.oferta_respuesta', '/chatbot/listaespera/cascada/respuesta', { siempre: true });
            await registrarActividadBot('chat_flujo_lista_espera', ctx.from, {
                step: 'respuesta_oferta',
                resultado: 'error',
                code: resultado.code ?? null
            });
            await flowDynamic('Ocurrió un error procesando tu respuesta. Por favor intenta nuevamente en unos minutos.');
            return endFlow();
        }

        if (respuesta === 'rechaza') {
            await registrarActividadBot('chat_flujo_lista_espera', ctx.from, {
                step: 'respuesta_oferta',
                resultado: 'rechazada'
            });
            await flowDynamic('Entendido, gracias por avisarnos. Sigues en la lista de espera y te contactaremos si se libera otro espacio. 😊');
            return endFlow();
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
        return endFlow();
    });

// Coincidencia exacta anclada (runbook B1): ver templates/flujos/keywordsBotones.ts.
const ofertaCupoAceptaDocumentoFlow = addKeyword(KW_SI_LO_TOMO, OPCIONES_REGEX)
    .addAction(async (ctx, { state }) => {
        // Trazabilidad: respuesta esperada (tabla 11.2), una sola vez (no en el reintento del documento).
        await trackRespuestaCampanaUnaVez(ctx.from, state, 'trazaReintentoOfertaAcepta', 'oferta_cupo', 'acepta_cupo', 'lista_espera.oferta_respuesta');
    })
    .addAnswer(
        'Para confirmar que el espacio es para ti, por favor digita tu número de documento 🔢:',
        { capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const numeroDoc = sanitizeString(ctx.body, 20);
            if (!isValidDocumentNumber(numeroDoc)) {
                trackNoEntendido(ctx.from, 'lista_espera.oferta_respuesta');
                await flowDynamic('El número de documento ingresado no es válido. Intenta nuevamente.');
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
    .addAction(async (ctx, { state }) => {
        // Trazabilidad: respuesta esperada (tabla 11.2), una sola vez (no en el reintento del documento).
        await trackRespuestaCampanaUnaVez(ctx.from, state, 'trazaReintentoOfertaRechaza', 'oferta_cupo', 'rechaza_cupo', 'lista_espera.oferta_respuesta');
    })
    .addAnswer(
        'Entendido. Para registrar tu respuesta, por favor digita tu número de documento 🔢:',
        { capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const numeroDoc = sanitizeString(ctx.body, 20);
            if (!isValidDocumentNumber(numeroDoc)) {
                trackNoEntendido(ctx.from, 'lista_espera.oferta_respuesta');
                await flowDynamic('El número de documento ingresado no es válido. Intenta nuevamente.');
                await state.update({ trazaReintentoOfertaRechaza: true });
                return gotoFlow(ofertaCupoRechazaDocumentoFlow);
            }
            trackPaso(ctx.from, 'lista_espera.oferta_respuesta', 'ok');
            await state.update({ numeroDocOfertaCupo: numeroDoc, respuestaOfertaCupo: 'rechaza' });
            return gotoFlow(ofertaCupoAccionFlow);
        }
    );

export { ofertaCupoAceptaDocumentoFlow, ofertaCupoRechazaDocumentoFlow, ofertaCupoAccionFlow };
