import { addKeyword, EVENTS } from '@builderbot/bot';
import { sanitizeString } from '../../../utils/sanitize';
import { mapearTipoDocumento, KEYWORDS_TIPO_DOCUMENTO, OPCIONES_TIPO_DOCUMENTO } from '../../../utils/datosPacienteNuevo';
import { step15AgendarCita } from './step15AgendarCita';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { hayAgendamientoEnCurso, MENSAJE_CONVERSACION_TERMINADA } from '../../../utils/estadoConversacion';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion } from '../../../utils/trazabilidad';

// IMPORTANTE: los ids de la lista llevan "agindarcita" (no "agendarcita") A PROPÓSITO. @builderbot enruta
// por subcadena sin distinguir mayúsculas (`new RegExp(keyword, 'i').test(body)`), así que un id que
// contenga "agendar" lo captura antes el flujo de agendar (keyword 'agendar') y reinicia la conversación.
// Lo cubre templates/__tests__/keywordRouting.test.ts. El mapeo id → código vive en
// utils/datosPacienteNuevo.ts (OPCIONES_TIPO_DOCUMENTO y mapearTipoDocumento, que acepta ambas grafías).
// Se escuchan también ids retirados (el `_ot` de "Otro"): llegan aquí, no se reconocen y se vuelve a
// mostrar la lista, en vez de caer en otro flujo o enviarse al backend.

const step14AgendarCita2 = addKeyword(KEYWORDS_TIPO_DOCUMENTO)
    .addAction(async (ctx, { state, gotoFlow, flowDynamic, endFlow }) => {
        // TBOT-02: entrada por keyword (lista/botón). Si no hay un agendamiento en curso (conversación
        // cerrada y state limpio), no se continúa sin contexto.
        if (!hayAgendamientoEnCurso(state)) {
            return endFlow(MENSAJE_CONVERSACION_TERMINADA);
        }
        const tipoDocRaw = ctx.listResponse ? ctx.listResponse.title : ctx.body;
        const tipoDoc = sanitizeString(tipoDocRaw, 30);
        const tipoDocumentoCodigo = mapearTipoDocumento(tipoDoc);
        if (!tipoDocumentoCodigo) {
            // Id retirado (p. ej. `agindarcita_tipo_ot` de una lista vieja) u otro valor inesperado:
            // nunca se avanza con un tipo que el backend no acepte; se vuelve a mostrar la lista.
            console.error(`[step14AgendarCita2] Tipo de documento no reconocido: "${tipoDoc}"`);
            trackNoEntendido(ctx.from, 'agendar.s14_tipo_documento', 1, { contexto: 'tipo_documento' });
            await flowDynamic('No pudimos identificar el tipo de documento. Por favor, selecciónalo de nuevo en la lista.');
            return gotoFlow(step14AgendarCita);
        }
        trackPaso(ctx.from, 'agendar.s14_tipo_documento', 'ok');
        await state.update({ tipoDoc, tipoDocumentoCodigo, esperaTipoDoc: false });
        return gotoFlow(step15AgendarCita);
    });

const step14AgendarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'agendar.s14_tipo_documento' });
        if (!sessionValid) {
            return endFlow();
        }
    })
    .addAction(async (ctx, { provider }) => {
        const list = {
            header: { type: 'text', text: 'Tipo de documento' },
            body: { text: 'Selecciona tu tipo de documento:' },
            footer: { text: '' },
            action: {
                button: 'Seleccionar',
                sections: [
                    {
                        title: 'Tipos',
                        rows: OPCIONES_TIPO_DOCUMENTO.map((opcion) => ({ id: opcion.id, title: opcion.title })),
                    }
                ]
            }
        };
        await provider.sendList(ctx.from, list);
    });

export { step14AgendarCita, step14AgendarCita2 };