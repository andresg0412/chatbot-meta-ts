import { createBot, createProvider, createFlow, addKeyword, utils, EVENTS } from '@builderbot/bot';
//ENVIA MENSAJE Y ENVIA A OTRO FLUJO

const welcomeFlow = addKeyword(EVENTS.WELCOME)
    .addAction(async (ctx, ctxFn) => {
        await ctxFn.flowDynamic(`¡Bienvenido a la IPS Cenro de Orientación! 👋 \n Soy Dianita 👩🏻‍💻, tu asistente virtual. \n Para comenzar, es importante que aceptes nuestra política de datos personales 📃 la cual puedes encontrar en 👉🏼:`);
        return ctxFn.gotoFlow(politicaDatosFlow);
    })


//LISTA DE OPCIONES DEL MENÚ Y ENVIA A OTRO FLUJO POR ID SELECCIONADO

const menuFlow = addKeyword(EVENTS.ACTION)
    .addAnswer(
        '¿Que deseas hacer hoy?',
        {
            capture: false
        },
        async (ctx, { provider }) => {
            const list = {
                "header": {
                    "type": "text",
                    "text": "Menú de opciones"
                },
                "body": {
                    "text": "Selecciona la acción que deseas realizar"
                },
                "footer": {
                    "text": ""
                },
                "action": {
                    "button": "Menú",
                    "sections": [
                        {
                            "title": "Opciones",
                            "rows": [
                                {
                                    "id": "280525001",
                                    "title": "Conocer la IPS",
                                    "description": ""
                                },
                                {
                                    "id": "280525002",
                                    "title": "Agendar Cita",
                                    "description": ""
                                },
                                {
                                    "id": "280525003",
                                    "title": "Reprogramar Cita",
                                    "description": ""
                                },
                                {
                                    "id": "280525004",
                                    "title": "Cancelar Cita",
                                    "description": ""
                                },
                                {
                                    "id": "280525005",
                                    "title": "Chatear con agente",
                                    "description": ""
                                }
                            ]
                        }
                    ]
                }
            }
            await provider.sendList(ctx.from, list)
        }
    );


//MENSAJE Y LISTA DE OPCIONES SIN ESPERAR UNA RESPUESTA DEL USUARIO

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


//PREGUNTAR BOTONES SI O NO
const step7Reprogramar = addKeyword(EVENTS.ACTION)
    .addAnswer(
        '¿Estás seguto que deseas reprogramar tu cita?',
        {
            capture: true,
            buttons: [
                { body: 'Si' },
                { body: 'No' },
            ],
        },
        async (ctx, ctxFn) => {
            if (ctx.body === 'Si'){
                return ctxFn.gotoFlow(stepConfirmaReprogramar)
            }
            if (ctx.body === 'No'){
                return ctxFn.gotoFlow(noConfirmaReprogramar)
            }
        }
    );



//MENSAJE Y ESPERA RESPUESTA LIBRE DEL USUARIO

const step3Reprogramar = addKeyword(EVENTS.ACTION)
    .addAnswer('Ahora, por favor digita tu número de documento:',
        {capture: true },
        async (ctx, { state, gotoFlow }) => {
            const numeroDoc = ctx.body;
            await state.update({ numeroDoc, esperaNumeroDoc: false });
            await state.update({ esperaSeleccionCita: true });
            return gotoFlow(step4Reprogramar);
        }
    )



