import { addKeyword, EVENTS } from '@builderbot/bot';
import { step7AgendarCitaControl } from './step7AgendarCitaControl';
import { sanitizeString } from '../../../../utils/sanitize';


const step6AgendarCitaControl = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'Por favor, ingresa el número de documento:',
        { capture: true },
        async (ctx, { state, gotoFlow }) => {
            await state.update({ numeroDocumentoPaciente: ctx.body });
            return gotoFlow(step7AgendarCitaControl);
        }
    );


const step6AgendarCitaControlDoc = addKeyword(['control_tipo_cedula', 'control_tipo_extran', 'control_tipo_identi', 'control_tipo_civil', 'control_tipo_pasaporte', 'control_tipo_other'])
    .addAction(async (ctx, { state, gotoFlow }) => {
        const tipoDocRaw = ctx.listResponse ? ctx.listResponse.title : ctx.body;
        const tipoDoc = sanitizeString(tipoDocRaw, 30);
        await state.update({ tipoDoc, esperaTipoDoc: false });
        return gotoFlow(step6AgendarCitaControl);
    });

export {
    step6AgendarCitaControlDoc,
    step6AgendarCitaControl
};