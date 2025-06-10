import { addKeyword } from '@builderbot/bot';
import { datosinicialesComunes3 } from './datosinicialesComunes3';

const datosinicialesComunes2 = addKeyword(['doc_cc', 'doc_ce', 'doc_ti', 'doc_rc', 'doc_pas', 'doc_otro'])
    .addAction(async (ctx, { state, gotoFlow }) => {
        const tipoDoc = ctx.listResponse ? ctx.listResponse.title : ctx.body;
        await state.update({ tipoDoc, esperaTipoDoc: false });
        return gotoFlow(datosinicialesComunes3);
    });

export { datosinicialesComunes2 };
