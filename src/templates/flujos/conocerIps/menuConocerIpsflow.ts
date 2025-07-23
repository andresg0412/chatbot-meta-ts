import { createBot, createProvider, createFlow, addKeyword, utils, EVENTS } from '@builderbot/bot';

const menuConocerIpsFlow = addKeyword('280525001')
    .addAnswer(
        '¿Que te gustaria conocer de la IPS?',
        {
            capture: false
        },
        async (ctx, { provider }) => {
            const list = {
                "header": {
                    "type": "text",
                    "text": "Información de la IPS"
                },
                "body": {
                    "text": "Selecciona la acción que desees"
                },
                "footer": {
                    "text": ""
                },
                "action": {
                    "button": "Menú Conocer IPS",
                    "sections": [
                        {
                            "title": "Opciones",
                            "rows": [
                                {
                                    "id": "280525011",
                                    "title": "Servicios",
                                    "description": ""
                                },
                                {
                                    "id": "280525012",
                                    "title": "Convenios",
                                    "description": ""
                                },
                                {
                                    "id": "280525013",
                                    "title": "Tarifas",
                                    "description": ""
                                },
                                {
                                    "id": "280525014",
                                    "title": "Formas de pago",
                                    "description": ""
                                },
                                {
                                    "id": "280525015",
                                    "title": "Ubicación",
                                    "description": ""
                                },
                                {
                                    "id": "280525016",
                                    "title": "Horarios de atención",
                                    "description": ""
                                },
                                {
                                    "id": "280525017",
                                    "title": "Canales de atención",
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

export { menuConocerIpsFlow };