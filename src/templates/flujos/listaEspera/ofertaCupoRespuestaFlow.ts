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

function formatearFechaCorta(fecha?: string): string {
    if (!fecha) return '';
    const parsed = new Date(fecha);
    if (isNaN(parsed.getTime())) return fecha;
    return parsed.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
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
            await flowDynamic('No pudimos identificar tu respuesta. Por favor intenta nuevamente.');
            return endFlow();
        }

        const resultado = await responderOfertaCupo(numeroDoc, ctx.from, respuesta);

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
        await registrarActividadBot('chat_flujo_lista_espera', ctx.from, {
            step: 'respuesta_oferta',
            resultado: 'aceptada'
        });
        const fechaFormateada = formatearFechaCorta(movimiento?.nueva_fecha_cita);
        const profesional = movimiento?.profesional ?? 'el profesional que te atiende';
        const hora = movimiento?.nueva_hora_cita ?? '';
        await flowDynamic(
            `¡Listo! Tu espacio quedó movido a ${fechaFormateada ? fechaFormateada + ' ' : ''}${hora} con ${profesional}. ` +
            'Tu cita anterior quedó liberada para otra persona. Te esperamos. 😊'
        );
        return endFlow();
    });

const ofertaCupoAceptaDocumentoFlow = addKeyword(['Sí, lo tomo'])
    .addAnswer(
        'Para confirmar que el espacio es para ti, por favor digita tu número de documento 🔢:',
        { capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const numeroDoc = sanitizeString(ctx.body, 20);
            if (!isValidDocumentNumber(numeroDoc)) {
                await flowDynamic('El número de documento ingresado no es válido. Intenta nuevamente.');
                return gotoFlow(ofertaCupoAceptaDocumentoFlow);
            }
            await state.update({ numeroDocOfertaCupo: numeroDoc, respuestaOfertaCupo: 'acepta' });
            return gotoFlow(ofertaCupoAccionFlow);
        }
    );

const ofertaCupoRechazaDocumentoFlow = addKeyword(['No puedo'])
    .addAnswer(
        'Entendido. Para registrar tu respuesta, por favor digita tu número de documento 🔢:',
        { capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const numeroDoc = sanitizeString(ctx.body, 20);
            if (!isValidDocumentNumber(numeroDoc)) {
                await flowDynamic('El número de documento ingresado no es válido. Intenta nuevamente.');
                return gotoFlow(ofertaCupoRechazaDocumentoFlow);
            }
            await state.update({ numeroDocOfertaCupo: numeroDoc, respuestaOfertaCupo: 'rechaza' });
            return gotoFlow(ofertaCupoAccionFlow);
        }
    );

export { ofertaCupoAceptaDocumentoFlow, ofertaCupoRechazaDocumentoFlow, ofertaCupoAccionFlow };
