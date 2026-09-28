// Respuesta al botón "Confirmo asistencia" de los recordatorios con botones (Fase 3 de "lista de
// espera inteligente" — Funcionalidad 1). Ver
// proyecto-ips/docs/features/2026-09-07-lista-espera-inteligente.md, secciones 15.5 y 15.6.
//
// Mismo patrón de correlación que el resto del sistema (6.2/13.4-c/15.6): `@builderbot/provider-meta`
// descarta `context.id` para mensajes `interactive`, así que se pide de nuevo el número de documento
// en vez de intentar correlacionar contra el mensaje saliente original (mismo patrón exacto que
// `confirmarCitaDocumentoFlow` en templates/flujos/campahna/ejecutarCampahna.ts y
// `ofertaCupoAceptaDocumentoFlow` en templates/flujos/listaEspera/ofertaCupoRespuestaFlow.ts).

// Mensajes y reintento del documento según proyecto-ips/docs/features/2026-09-27-confirmar-cita-ya-confirmada.md
// (sección 4.6): en las plantillas de 24h confirmado y de 2h el botón se toca sobre citas que ya están
// confirmadas, así que `ya_confirmada` es el caso normal y suena a agradecimiento.
//
// State: `intentosDocRecordatorio` (reintentos de documento consumidos, máximo 1) y
// `reintentoDocRecordatorioEnCurso` (distingue el reingreso por gotoFlow de una entrada nueva por el
// botón, que reinicia el contador).

import { addKeyword, EVENTS } from '@builderbot/bot';
import { responderRecordatorio, registrarActividadBot } from '../../../services/apiService';
import type { ResultadoConfirmacion } from '../../../services/apiService';
import { sanitizeString, isValidDocumentNumber } from '../../../utils/sanitize';
import {
    construirRespuestaConfirmacion,
    metricaConfirmacionRecordatorio,
    resultadoConfirmacionDesdeRecordatorio,
    MENSAJE_ERROR_CONFIRMACION,
} from '../../../utils/mensajesConfirmacion';
import { KW_CONFIRMO_ASISTENCIA, OPCIONES_REGEX } from '../keywordsBotones';

const confirmoAsistenciaAccionFlow = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, endFlow, gotoFlow }) => {
        const numeroDoc = state.getMyState()?.numeroDocRecordatorio;

        if (!numeroDoc) {
            await state.update({ intentosDocRecordatorio: 0, reintentoDocRecordatorioEnCurso: false });
            await flowDynamic('No pudimos identificar tu respuesta. Por favor intenta nuevamente.');
            return endFlow();
        }

        let resultado: ResultadoConfirmacion;
        let persistido: boolean | undefined;
        try {
            const respuestaBackend = await responderRecordatorio(ctx.from, numeroDoc, 'confirma');
            if (respuestaBackend.ok) persistido = respuestaBackend.data.persistido;
            resultado = resultadoConfirmacionDesdeRecordatorio(respuestaBackend);
        } catch (error) {
            console.error('Error respondiendo recordatorio (confirma):', (error as any)?.message ?? error);
            resultado = { ok: false, causa: 'ERROR' };
        }

        const intentosPrevios = Number(state.getMyState()?.intentosDocRecordatorio) || 0;
        const respuesta = construirRespuestaConfirmacion(resultado, 'recordatorio', intentosPrevios);

        try {
            for (const mensaje of respuesta.mensajes) {
                await flowDynamic(mensaje);
            }
        } catch (error) {
            console.error('Error enviando respuesta de confirmación:', (error as any)?.message ?? error);
            await flowDynamic(MENSAJE_ERROR_CONFIRMACION);
        }

        await registrarActividadBot('recordatorio_respuesta', ctx.from, {
            accion: 'confirma',
            resultado: metricaConfirmacionRecordatorio(resultado),
            ...(persistido !== undefined ? { persistido } : {})
        });

        if (respuesta.siguiente === 'reintentar') {
            await state.update({ intentosDocRecordatorio: intentosPrevios + 1, reintentoDocRecordatorioEnCurso: true });
            return gotoFlow(confirmoAsistenciaFlow);
        }
        await state.update({ intentosDocRecordatorio: 0, reintentoDocRecordatorioEnCurso: false });
        return endFlow();
    });

// Coincidencia exacta anclada (runbook B1): ver templates/flujos/keywordsBotones.ts.
const confirmoAsistenciaFlow = addKeyword(KW_CONFIRMO_ASISTENCIA, OPCIONES_REGEX)
    .addAction(async (_ctx, { state }) => {
        if (state.getMyState()?.reintentoDocRecordatorioEnCurso) {
            await state.update({ reintentoDocRecordatorioEnCurso: false });
        } else {
            await state.update({ intentosDocRecordatorio: 0 });
        }
    })
    .addAnswer(
        'Para confirmar tu cita, por favor digita tu número de documento 🔢:',
        { capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const numeroDoc = sanitizeString(ctx.body, 20);
            if (!isValidDocumentNumber(numeroDoc)) {
                await flowDynamic('El número de documento ingresado no es válido. Intenta nuevamente.');
                await state.update({ reintentoDocRecordatorioEnCurso: true });
                return gotoFlow(confirmoAsistenciaFlow);
            }
            await state.update({ numeroDocRecordatorio: numeroDoc });
            return gotoFlow(confirmoAsistenciaAccionFlow);
        }
    );

export { confirmoAsistenciaFlow, confirmoAsistenciaAccionFlow };
