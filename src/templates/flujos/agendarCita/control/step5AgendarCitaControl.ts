import { addKeyword, EVENTS } from '@builderbot/bot';

const step5AgendarCitaControl = addKeyword(EVENTS.ACTION)
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
                            { id: 'control_tipo_cedula', title: 'Cédula de ciudadanía' },
                            { id: 'control_tipo_extran', title: 'Cédula de extranjería' },
                            { id: 'control_tipo_identi', title: 'Tarjeta de identidad' },
                            { id: 'control_tipo_civil', title: 'Registro civil' },
                            { id: 'control_tipo_pasaporte', title: 'Pasaporte' },
                            { id: 'control_tipo_other', title: 'Otro' },
                        ]
                    }
                ]
            }
        };
        await provider.sendList(ctx.from, list);
    });
    

export { step5AgendarCitaControl };