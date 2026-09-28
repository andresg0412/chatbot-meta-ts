// Respuesta al botón "No podré asistir" del recordatorio de 2h (job `daily`, plantilla
// `NOMBRE_PLANTILLA_META_DIARIA_BOTONES`) — Fase 3 de "lista de espera inteligente" (Funcionalidad 1).
// Ver proyecto-ips/docs/features/2026-09-07-lista-espera-inteligente.md, secciones 15.5, 15.6 y 15.8.
//
// Mismo valor de `respuesta` ('no_asistira') que `necesitoCancelarFlow` — el backend no distingue
// entre ambos botones de origen, solo cambia el texto que ve el paciente (15.6). Importante (15.8):
// esto cancela la cita de verdad (Globho + BD) y dispara la detección de cupo liberado de Fase 2.

import { addKeyword, EVENTS } from '@builderbot/bot';
import { responderRecordatorio, registrarActividadBot } from '../../../services/apiService';
import { sanitizeString, isValidDocumentNumber } from '../../../utils/sanitize';
import { MENSAJE_ERROR_RESPUESTA_RECORDATORIO } from '../../../utils/mensajesConfirmacion';
import { KW_NO_PODRE_ASISTIR, OPCIONES_REGEX } from '../keywordsBotones';

const noPodreAsistirAccionFlow = addKeyword(EVENTS.ACTION)
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
                origen_boton: 'no_podre_asistir',
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
            origen_boton: 'no_podre_asistir',
            resultado: 'exitoso',
            persistido: resultado.data.persistido
        });
        await flowDynamic('Entendido, cancelamos tu cita. Gracias por avisarnos con tiempo. Si quieres agendar un nuevo espacio cuando puedas, aquí estamos. 😊');
        return endFlow();
    });

// Coincidencia exacta anclada (runbook B1): ver templates/flujos/keywordsBotones.ts.
const noPodreAsistirFlow = addKeyword(KW_NO_PODRE_ASISTIR, OPCIONES_REGEX)
    .addAnswer(
        'Para cancelar tu cita, por favor digita tu número de documento 🔢:',
        { capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const numeroDoc = sanitizeString(ctx.body, 20);
            if (!isValidDocumentNumber(numeroDoc)) {
                await flowDynamic('El número de documento ingresado no es válido. Intenta nuevamente.');
                return gotoFlow(noPodreAsistirFlow);
            }
            await state.update({ numeroDocRecordatorio: numeroDoc });
            return gotoFlow(noPodreAsistirAccionFlow);
        }
    );

export { noPodreAsistirFlow, noPodreAsistirAccionFlow };
