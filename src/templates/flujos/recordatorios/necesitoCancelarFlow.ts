// Respuesta al botón "Necesito cancelar" de los recordatorios con botones (48h/24h) — Fase 3 de
// "lista de espera inteligente" (Funcionalidad 1). Ver
// proyecto-ips/docs/features/2026-09-07-lista-espera-inteligente.md, secciones 15.5, 15.6 y 15.8.
//
// Importante (15.8): responder 'no_asistira' hace que el backend cancele la cita de verdad (Globho +
// BD) y dispare la detección de cupo liberado de Fase 2 — no es una operación de solo lectura, mismo
// camino crítico que ya usa el flujo "Cancelar cita" del menú principal.

import { addKeyword, EVENTS } from '@builderbot/bot';
import { responderRecordatorio, registrarActividadBot } from '../../../services/apiService';
import { sanitizeString, isValidDocumentNumber } from '../../../utils/sanitize';
import { MENSAJE_ERROR_RESPUESTA_RECORDATORIO } from '../../../utils/mensajesConfirmacion';
import { KW_NECESITO_CANCELAR, OPCIONES_REGEX } from '../keywordsBotones';

const necesitoCancelarAccionFlow = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, endFlow }) => {
        const numeroDoc = state.getMyState().numeroDocRecordatorio;

        if (!numeroDoc) {
            await flowDynamic('No pudimos identificar tu respuesta. Por favor intenta nuevamente.');
            return endFlow();
        }

        const resultado = await responderRecordatorio(ctx.from, numeroDoc, 'no_asistira');

        if (resultado.ok === false) {
            // Error técnico (incluye un eventual GLOBHO_ERROR) ≠ "no hay cita" (404 con causa).
            const esErrorTecnico = resultado.causa === 'ERROR' || resultado.causa === 'GLOBHO_ERROR';
            await registrarActividadBot('recordatorio_respuesta', ctx.from, {
                accion: 'no_asistira',
                origen_boton: 'necesito_cancelar',
                resultado: 'error_o_sin_cita',
                causa: resultado.causa.toLowerCase()
            });
            await flowDynamic(
                esErrorTecnico
                    ? MENSAJE_ERROR_RESPUESTA_RECORDATORIO
                    : 'No encontramos una cita activa asociada a ese número de documento. Si crees que es un error, contáctanos.'
            );
            return endFlow();
        }

        await registrarActividadBot('recordatorio_respuesta', ctx.from, {
            accion: 'no_asistira',
            origen_boton: 'necesito_cancelar',
            resultado: 'exitoso',
            persistido: resultado.data.persistido
        });
        await flowDynamic('Entendido, cancelamos tu cita. Gracias por avisarnos con tiempo. Si quieres agendar un nuevo espacio cuando puedas, aquí estamos. 😊');
        return endFlow();
    });

// Coincidencia exacta anclada (runbook B1): ver templates/flujos/keywordsBotones.ts.
const necesitoCancelarFlow = addKeyword(KW_NECESITO_CANCELAR, OPCIONES_REGEX)
    .addAnswer(
        'Para cancelar tu cita, por favor digita tu número de documento 🔢:',
        { capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const numeroDoc = sanitizeString(ctx.body, 20);
            if (!isValidDocumentNumber(numeroDoc)) {
                await flowDynamic('El número de documento ingresado no es válido. Intenta nuevamente.');
                return gotoFlow(necesitoCancelarFlow);
            }
            await state.update({ numeroDocRecordatorio: numeroDoc });
            return gotoFlow(necesitoCancelarAccionFlow);
        }
    );

export { necesitoCancelarFlow, necesitoCancelarAccionFlow };
