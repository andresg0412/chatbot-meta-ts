import { addKeyword } from '@builderbot/bot';
import { step3Reprogramar } from './step3Reprogramar';

// Cuando responde el usuario a numero de documento, se captura el numero de documento y se guarda en el estado
const step2Reprogramar = addKeyword(['doc_cc', 'doc_ce', 'doc_ti', 'doc_rc', 'doc_pas', 'doc_otro'])
    .addAction(async (ctx, { state, gotoFlow }) => {
        const tipoDoc = ctx.listResponse ? ctx.listResponse.title : ctx.body;
        await state.update({ tipoDoc, esperaTipoDoc: false });
        return gotoFlow(step3Reprogramar);
    });

export { step2Reprogramar };