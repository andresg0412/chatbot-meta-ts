// Respuesta al botón "Confirmo asistencia" de los recordatorios con botones (Fase 3 de "lista de
// espera inteligente" — Funcionalidad 1). Ver
// proyecto-ips/docs/features/2026-09-07-lista-espera-inteligente.md, secciones 15.5 y 15.6.
//
// Mismo patrón de correlación que el resto del sistema (6.2/13.4-c/15.6): `@builderbot/provider-meta`
// descarta `context.id` para mensajes `interactive`, así que se pide de nuevo el número de documento
// en vez de intentar correlacionar contra el mensaje saliente original (mismo patrón exacto que
// `confirmarCitaDocumentoFlow` en templates/flujos/campahna/ejecutarCampahna.ts y
// `ofertaCupoAceptaDocumentoFlow` en templates/flujos/listaEspera/ofertaCupoRespuestaFlow.ts).

import { addKeyword, EVENTS } from '@builderbot/bot';
import { responderRecordatorio, registrarActividadBot } from '../../../services/apiService';
import { sanitizeString, isValidDocumentNumber } from '../../../utils/sanitize';
import { KW_CONFIRMO_ASISTENCIA, OPCIONES_REGEX } from '../keywordsBotones';

const confirmoAsistenciaAccionFlow = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, endFlow }) => {
        const numeroDoc = state.getMyState().numeroDocRecordatorio;

        if (!numeroDoc) {
            await flowDynamic('No pudimos identificar tu respuesta. Por favor intenta nuevamente.');
            return endFlow();
        }

        const resultado = await responderRecordatorio(ctx.from, numeroDoc, 'confirma');

        if (!resultado) {
            await registrarActividadBot('recordatorio_respuesta', ctx.from, {
                accion: 'confirma',
                resultado: 'error_o_sin_cita'
            });
            await flowDynamic('No encontramos una cita activa asociada a ese número de documento. Si crees que es un error, contáctanos.');
            return endFlow();
        }

        await registrarActividadBot('recordatorio_respuesta', ctx.from, {
            accion: 'confirma',
            resultado: 'exitoso',
            persistido: resultado.persistido
        });
        await flowDynamic('¡Listo! Confirmamos tu cita. Te esperamos. 😊');
        return endFlow();
    });

// Coincidencia exacta anclada (runbook B1): ver templates/flujos/keywordsBotones.ts.
const confirmoAsistenciaFlow = addKeyword(KW_CONFIRMO_ASISTENCIA, OPCIONES_REGEX)
    .addAnswer(
        'Para confirmar tu cita, por favor digita tu número de documento 🔢:',
        { capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const numeroDoc = sanitizeString(ctx.body, 20);
            if (!isValidDocumentNumber(numeroDoc)) {
                await flowDynamic('El número de documento ingresado no es válido. Intenta nuevamente.');
                return gotoFlow(confirmoAsistenciaFlow);
            }
            await state.update({ numeroDocRecordatorio: numeroDoc });
            return gotoFlow(confirmoAsistenciaAccionFlow);
        }
    );

export { confirmoAsistenciaFlow, confirmoAsistenciaAccionFlow };
