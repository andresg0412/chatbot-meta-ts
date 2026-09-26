// Retiro voluntario de la lista de espera por WhatsApp — runbook B5,
// proyecto-ips/docs/features/2026-09-26-lista-espera-runbook-produccion.md.
//
// El texto de consentimiento (stepListaEsperaOptIn.ts) le indica al paciente que puede escribir
// "Retirar lista de espera" para dejar de recibir avisos de cupos. "Salir" a secas NO se toca: sigue
// cerrando la conversación como siempre (exitFlow).
//
// Correlación de identidad: mismo patrón que ofertaCupoRespuestaFlow / confirmarCitaDocumentoFlow — se
// pide el número de documento (no se usa `context.id`, que @builderbot/provider-meta descarta).
// Contrato backend (Fase 1, sin cambios): GET /chatbot/listaespera?documento= para listar las
// inscripciones y POST /chatbot/listaespera/retirar { lista_espera_id } por cada una 'activa'.
// Las inscripciones 'pausada' no reciben ofertas y el backend no las retira por id (solo cambia las
// 'activa'), así que no se tocan.

import { addKeyword, EVENTS } from '@builderbot/bot';
import {
    consultarListaEsperaPorDocumento,
    retirarListaEspera,
    registrarActividadBot,
} from '../../../services/apiService';
import { sanitizeString, isValidDocumentNumber } from '../../../utils/sanitize';
import { closeUserSession } from '../../../utils/proactiveSessionManager';
import { KW_RETIRAR_LISTA_ESPERA, OPCIONES_REGEX } from '../keywordsBotones';

export const MENSAJE_RETIRO_EXITOSO =
    'Listo, te retiramos de la lista de espera y no te enviaremos más avisos de espacios disponibles. ' +
    'Tu cita agendada se mantiene exactamente igual. 😊';
export const MENSAJE_RETIRO_NO_INSCRITO =
    'No encontramos una inscripción activa en la lista de espera asociada a ese número de documento, ' +
    'así que no recibirás avisos de espacios disponibles. Tus citas agendadas no cambian.';
export const MENSAJE_RETIRO_ERROR =
    'No pudimos procesar tu solicitud en este momento. Por favor intenta nuevamente en unos minutos ' +
    'escribiendo *"Retirar lista de espera"*.';

const retiroListaEsperaAccionFlow = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, endFlow }) => {
        const numeroDoc = state.getMyState().numeroDocRetiroListaEspera;
        closeUserSession(ctx.from);

        if (!numeroDoc) {
            return endFlow(MENSAJE_RETIRO_ERROR);
        }

        const consulta = await consultarListaEsperaPorDocumento(numeroDoc);
        if (!consulta.ok) {
            await registrarActividadBot('chat_flujo_lista_espera', ctx.from, { step: 'retiro', resultado: 'error_consulta' });
            return endFlow(MENSAJE_RETIRO_ERROR);
        }

        const activas = consulta.inscripciones.filter((i) => i?.estado === 'activa' && i?.lista_espera_id);
        if (activas.length === 0) {
            await registrarActividadBot('chat_flujo_lista_espera', ctx.from, { step: 'retiro', resultado: 'sin_inscripcion_activa' });
            return endFlow(MENSAJE_RETIRO_NO_INSCRITO);
        }

        let retiradas = 0;
        for (const inscripcion of activas) {
            const ok = await retirarListaEspera({ lista_espera_id: inscripcion.lista_espera_id });
            if (ok) retiradas++;
        }

        const resultado = retiradas === activas.length ? 'ok' : retiradas > 0 ? 'parcial' : 'error';
        await registrarActividadBot('chat_flujo_lista_espera', ctx.from, {
            step: 'retiro',
            resultado,
            inscripciones_activas: activas.length,
            inscripciones_retiradas: retiradas
        });

        if (resultado !== 'ok') {
            return endFlow(MENSAJE_RETIRO_ERROR);
        }
        return endFlow(MENSAJE_RETIRO_EXITOSO);
    });

// Coincidencia exacta anclada (runbook B1/B5): ver templates/flujos/keywordsBotones.ts.
const retiroListaEsperaFlow = addKeyword(KW_RETIRAR_LISTA_ESPERA, OPCIONES_REGEX)
    .addAnswer(
        'Para retirarte de la lista de espera, por favor digita tu número de documento 🔢:',
        { capture: true },
        async (ctx, { state, gotoFlow, flowDynamic, endFlow }) => {
            const texto = sanitizeString(ctx.body, 20);
            if (/^(salir|exit)$/i.test(texto.trim())) {
                // "Salir" tiene forma de documento válido (5 letras); se trata igual que exitFlow (que no
                // alcanza a responder porque este callback de captura corre primero y termina el flujo).
                closeUserSession(ctx.from);
                return endFlow('Gracias por usar nuestro servicio. ¡Hasta luego! 👋');
            }
            if (!isValidDocumentNumber(texto)) {
                await flowDynamic('El número de documento ingresado no es válido. Intenta nuevamente.');
                return gotoFlow(retiroListaEsperaFlow);
            }
            await state.update({ numeroDocRetiroListaEspera: texto });
            return gotoFlow(retiroListaEsperaAccionFlow);
        }
    );

export { retiroListaEsperaFlow, retiroListaEsperaAccionFlow };
