import { addKeyword, EVENTS } from '@builderbot/bot';
import { sanitizeString } from '../../../utils/sanitize';
import { step15AgendarCita } from './step15AgendarCita';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';

const step14AgendarCita2 = addKeyword(['agindarcita_tipo_cd', 'agindarcita_tipo_cex', 'agindarcita_tipo_tid', 'agindarcita_tipo_rcv', 'agindarcita_tipo_ps', 'agindarcita_tipo_ot'])
    .addAction(async (ctx, { state, gotoFlow }) => {
        const tipoDocRaw = ctx.listResponse ? ctx.listResponse.title : ctx.body;
        const tipoDoc = sanitizeString(tipoDocRaw, 30);
        await state.update({ tipoDoc, esperaTipoDoc: false });
        return gotoFlow(step15AgendarCita);
    });

const step14AgendarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow);
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
                        rows: [
                            { id: 'agindarcita_tipo_cd', title: 'Cédula de ciudadanía' },
                            { id: 'agindarcita_tipo_cex', title: 'Cédula de extranjería' },
                            { id: 'agindarcita_tipo_tid', title: 'Tarjeta de identidad' },
                            { id: 'agindarcita_tipo_rcv', title: 'Registro civil' },
                            { id: 'agindarcita_tipo_ps', title: 'Pasaporte' },
                            { id: 'agindarcita_tipo_ot', title: 'Otro' },
                        ]
                    }
                ]
            }
        };
        await provider.sendList(ctx.from, list);
    });

export { step14AgendarCita, step14AgendarCita2 };