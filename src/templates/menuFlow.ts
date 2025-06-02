import { createBot, createProvider, createFlow, addKeyword, utils, EVENTS } from '@builderbot/bot';

const menuFlow = addKeyword(EVENTS.ACTION)
    .addAnswer(
        '¿Que deseas hacer hoy? 😊',
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
                                    "title": "Agendar cita",
                                    "description": ""
                                },
                                {
                                    "id": "280525003",
                                    "title": "Reprogramar cita",
                                    "description": ""
                                },
                                {
                                    "id": "280525004",
                                    "title": "Cancelar cita",
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

export { menuFlow };