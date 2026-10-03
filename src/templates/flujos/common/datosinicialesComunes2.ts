import { addKeyword } from '@builderbot/bot';
import { sanitizeString } from '../../../utils/sanitize';
import { datosinicialesComunes3 } from './datosinicialesComunes3';
import { hayGestionCitaEnCurso, MENSAJE_CONVERSACION_TERMINADA } from '../../../utils/estadoConversacion';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion, flujoDesdeSeleccionMenu } from '../../../utils/trazabilidad';

const datosinicialesComunes2 = addKeyword(['doc_cc', 'doc_ce', 'doc_ti', 'doc_rc', 'doc_pas', 'doc_otro'])
    .addAction(async (ctx, { state, gotoFlow, endFlow }) => {
        // TBOT-02: se entra por el id de la lista de tipo de documento. Si no hay una cancelación o
        // reprogramación en curso (conversación cerrada y state limpio, o la lista vino de otro flujo), no
        // se sigue: antes se llegaba a datosinicialesComunes5 sin flujo y se repetía "Opción no válida".
        if (!hayGestionCitaEnCurso(state)) {
            return endFlow(MENSAJE_CONVERSACION_TERMINADA);
        }
        trackPaso(ctx.from, 'comun.c02_tipo_documento_sel', 'ok', { flujo: flujoDesdeSeleccionMenu(state.getMyState()?.flujoSeleccionadoMenu) });
        const tipoDocRaw = ctx.listResponse ? ctx.listResponse.title : ctx.body;
        const tipoDoc = sanitizeString(tipoDocRaw, 30);
        await state.update({ tipoDoc, esperaTipoDoc: false });
        return gotoFlow(datosinicialesComunes3);
    });

export { datosinicialesComunes2 };
