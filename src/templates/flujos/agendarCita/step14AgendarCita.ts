import { addKeyword, EVENTS } from '@builderbot/bot';
import { sanitizeString } from '../../../utils/sanitize';
import { step15AgendarCita } from './step15AgendarCita';


const step14AgendarCita2 = addKeyword(['agendarcita_tipo_cd', 'agendarcita_tipo_cex', 'agendarcita_tipo_tid', 'agendarcita_tipo_rcv', 'agendarcita_tipo_ps', 'agendarcita_tipo_ot'])
    .addAction(async (ctx, { state, gotoFlow }) => {
        const tipoDocRaw = ctx.listResponse ? ctx.listResponse.title : ctx.body;
        const tipoDoc = sanitizeString(tipoDocRaw, 30);
        await state.update({ tipoDoc, esperaTipoDoc: false });
        return gotoFlow(step15AgendarCita);
    });

const step14AgendarCita = addKeyword(EVENTS.ACTION)
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
                            { id: 'agendarcita_tipo_cd', title: 'Cédula de ciudadanía' },
                            { id: 'agendarcita_tipo_cex', title: 'Cédula de extranjería' },
                            { id: 'agendarcita_tipo_tid', title: 'Tarjeta de identidad' },
                            { id: 'agendarcita_tipo_rcv', title: 'Registro civil' },
                            { id: 'agendarcita_tipo_ps', title: 'Pasaporte' },
                            { id: 'agendarcita_tipo_ot', title: 'Otro' },
                        ]
                    }
                ]
            }
        };
        await provider.sendList(ctx.from, list);
    });

export { step14AgendarCita, step14AgendarCita2 };