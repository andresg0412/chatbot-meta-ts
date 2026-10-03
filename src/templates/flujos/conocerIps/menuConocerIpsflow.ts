import { createBot, createProvider, createFlow, addKeyword, utils, EVENTS } from '@builderbot/bot';
import { abrirOSostenerSesion } from '../../../utils/proactiveSessionTimeout';
import { registrarActividadBot } from '../../../services/apiService';
import { trackPaso, trackFin } from '../../../utils/trazabilidad';

const menuConocerIpsFlow = addKeyword('280525001')
    .addAction(async (ctx) => {
        // T-04: se puede tocar la opción de una lista vieja sin sesión activa; antes terminaba en silencio.
        // Es informativo: se abre (o renueva) la sesión y se sigue.
        abrirOSostenerSesion(ctx.from, { paso: 'conocer_ips.menu' });
        await registrarActividadBot('chat_flujo_conocer_ips', ctx.from);
    })
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