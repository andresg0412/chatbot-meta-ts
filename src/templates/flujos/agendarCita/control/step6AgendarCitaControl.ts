import { addKeyword, EVENTS } from '@builderbot/bot';
import { step7AgendarCitaControl } from './step7AgendarCitaControl';
import { sanitizeString } from '../../../../utils/sanitize';
import { hayAgendamientoEnCurso, MENSAJE_CONVERSACION_TERMINADA } from '../../../../utils/estadoConversacion';
import { checkSessionTimeout } from '../../../../utils/proactiveSessionTimeout';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion } from '../../../../utils/trazabilidad';


const step6AgendarCitaControl = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'agendar.ct06_documento' });
        if (!sessionValid) {
            return endFlow();
        }
    })
    .addAnswer(
        'Por favor, ingresa el número de documento:',
        { capture: true },
        async (ctx, { state, gotoFlow }) => {
            await state.update({ numeroDocumentoPaciente: ctx.body });
            return gotoFlow(step7AgendarCitaControl);
        }
    );


const step6AgendarCitaControlDoc = addKeyword(['control_tipo_cedula', 'control_tipo_extran', 'control_tipo_identi', 'control_tipo_civil', 'control_tipo_pasaporte', 'control_tipo_other'])
    .addAction(async (ctx, { state, gotoFlow, endFlow }) => {
        // TBOT-02: entrada por keyword (lista/botón). Si no hay un agendamiento en curso (conversación
        // cerrada y state limpio), no se continúa sin contexto.
        if (!hayAgendamientoEnCurso(state)) {
            return endFlow(MENSAJE_CONVERSACION_TERMINADA);
        }
        trackPaso(ctx.from, 'agendar.ct05_tipo_documento', 'ok');
        const tipoDocRaw = ctx.listResponse ? ctx.listResponse.title : ctx.body;
        const tipoDoc = sanitizeString(tipoDocRaw, 30);
        await state.update({ tipoDoc, esperaTipoDoc: false });
        return gotoFlow(step6AgendarCitaControl);
    });

export {
    step6AgendarCitaControlDoc,
    step6AgendarCitaControl
};