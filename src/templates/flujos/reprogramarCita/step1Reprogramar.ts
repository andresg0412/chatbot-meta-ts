import { addKeyword, EVENTS } from '@builderbot/bot';

// saludo de bienvenido a la seccion de reprogramación de citas y enviar listado de tipos de documento
const step1Reprogramar = addKeyword(['280525003', '3', 'reprogramar cita'])
    .addAnswer('Perfecto, te solicitaré algunos datos para poder reprogramar tu cita', { capture: false })
    .addAction(async (ctx, { provider, state }) => {
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
                            { id: 'doc_cc', title: 'Cédula de ciudadanía' },
                            { id: 'doc_ce', title: 'Cédula de extranjería' },
                            { id: 'doc_ti', title: 'Tarjeta de identidad' },
                            { id: 'doc_rc', title: 'Registro civil' },
                            { id: 'doc_pas', title: 'Pasaporte' },
                            { id: 'doc_otro', title: 'Otro' },
                        ]
                    }
                ]
            }
        };
        await provider.sendList(ctx.from, list);
    });
export { step1Reprogramar };
