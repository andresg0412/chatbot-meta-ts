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
import { trackRespuestaCampana, trackRespuestaCampanaUnaVez, trackPaso, trackNoEntendido, trackIdentificacion, trackErrorBackend, trackFin, cerrarSesionTraza, asegurarSesionTraza } from '../../../utils/trazabilidad';

const noPodreAsistirAccionFlow = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, endFlow }) => {
        const numeroDoc = state.getMyState().numeroDocRecordatorio;

        if (!numeroDoc) {
            cerrarSesionTraza(ctx.from, 'completado');
            await flowDynamic('No pudimos identificar tu respuesta. Por favor intenta nuevamente.');
            return endFlow();
        }

        const resultado = await responderRecordatorio(ctx.from, numeroDoc, 'no_asistira');

        if (resultado.ok === false) {
            // Error técnico (incluye un eventual GLOBHO_ERROR) ≠ "no hay cita" (404 con causa).
            const esErrorTecnico = resultado.causa === 'ERROR' || resultado.causa === 'GLOBHO_ERROR';
            if (esErrorTecnico) {
                trackErrorBackend(ctx.from, 'recordatorio.no_podre_asistir', '/chatbot/recordatorios/responder', { siempre: true, cause: resultado.causa });
                trackFin(ctx.from, 'recordatorio', 'error_backend', { paso: 'recordatorio.no_podre_asistir' });
            } else {
                trackIdentificacion(ctx.from, numeroDoc, ['CITA_NOT_FOUND', 'DOCUMENTO_INVALIDO'].includes(resultado.causa) ? 'no_encontrado' : 'encontrado', 'recordatorio.no_podre_asistir');
            }
            cerrarSesionTraza(ctx.from, 'completado');
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
        trackIdentificacion(ctx.from, numeroDoc, 'encontrado', 'recordatorio.no_podre_asistir');
        trackFin(ctx.from, 'recordatorio', 'cita_cancelada', { paso: 'recordatorio.no_podre_asistir', agendaId: resultado.data.agenda_id });
        cerrarSesionTraza(ctx.from, 'completado');
        await flowDynamic('Entendido, cancelamos tu cita. Gracias por avisarnos con tiempo. Si quieres agendar un nuevo espacio cuando puedas, aquí estamos. 😊');
        return endFlow();
    });

// Coincidencia exacta anclada (runbook B1): ver templates/flujos/keywordsBotones.ts.
const noPodreAsistirFlow = addKeyword(KW_NO_PODRE_ASISTIR, OPCIONES_REGEX)
    .addAction(async (ctx, { state }) => {
        // Trazabilidad: respuesta esperada (tabla 11.2), una sola vez (no en el reintento del documento).
        await trackRespuestaCampanaUnaVez(ctx.from, state, 'trazaReintentoNoPodreAsistir', null, 'no_asistira', 'recordatorio.no_podre_asistir');
    })
    .addAnswer(
        'Para cancelar tu cita, por favor digita tu número de documento 🔢:',
        { capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const numeroDoc = sanitizeString(ctx.body, 20);
            if (!isValidDocumentNumber(numeroDoc)) {
                trackNoEntendido(ctx.from, 'recordatorio.no_podre_asistir');
                await flowDynamic('El número de documento ingresado no es válido. Intenta nuevamente.');
                await state.update({ trazaReintentoNoPodreAsistir: true });
                return gotoFlow(noPodreAsistirFlow);
            }
            trackPaso(ctx.from, 'recordatorio.no_podre_asistir', 'ok');
            await state.update({ numeroDocRecordatorio: numeroDoc });
            return gotoFlow(noPodreAsistirAccionFlow);
        }
    );

export { noPodreAsistirFlow, noPodreAsistirAccionFlow };
