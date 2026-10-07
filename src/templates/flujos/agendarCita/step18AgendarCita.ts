import { addKeyword, EVENTS } from '@builderbot/bot';
import { step19AgendarCita } from './step19AgendarCita';
import { volverMenuPrincipal } from '../common';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { aplicarFiltroCaptura } from '../filtroCaptura';
import { MENSAJE_CONVERSACION_TERMINADA } from '../../../utils/estadoConversacion';
import { registrarActividadBot } from '../../../services/apiService';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion } from '../../../utils/trazabilidad';


const step18AgendarCita2 = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'agendar.s18_confirmacion' });
        if (!sessionValid) {
            return endFlow();
        }
    })
    .addAnswer(
        '¿Confirmas la cita? ✅',
        {
            capture: true,
            buttons: [
                { body: 'Si' },
                { body: 'No' },
            ],
        },
        async (ctx, ctxFn) => {
            const filtro = await aplicarFiltroCaptura(ctx, ctxFn, {
                paso: 'agendar.s18_confirmacion', reintentar: () => ctxFn.gotoFlow(step18AgendarCita2),
            });
            if (filtro) return filtro.salida;
            if (ctx.body === 'Si') {
                trackPaso(ctx.from, 'agendar.s18_confirmacion', 'ok');
                await registrarActividadBot('chat_flujo_agendar', ctx.from, {
                    step: 'confirmar_cita',
                    cita: 'creada'
                });
                return ctxFn.gotoFlow(step19AgendarCita);
            }
            if (ctx.body === 'No') {
                trackPaso(ctx.from, 'agendar.s18_confirmacion', 'ok', { metadata: { confirma: false } });
                await registrarActividadBot('chat_flujo_agendar', ctx.from, {
                    step: 'confirmar_cita',
                    cita: 'no_confirma_agenda'
                });
                await ctxFn.flowDynamic('Recuerda que puedes agendar tu cita cuando lo requieras.');
                return ctxFn.gotoFlow(volverMenuPrincipal);
            }
            trackNoEntendido(ctx.from, 'agendar.s18_confirmacion');
        }
    );

const step18AgendarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow, endFlow }) => {
        const citaSeleccionadaHora = state.getMyState()?.citaSeleccionadaHora;
        // TBOT-02: nunca se pide confirmar una cita sin la hora elegida y el paciente identificados en
        // este recorrido (antes lanzaba TypeError con el state vacío).
        if (!citaSeleccionadaHora || !state.getMyState()?.pacienteId) {
            return endFlow(MENSAJE_CONVERSACION_TERMINADA);
        }
        await flowDynamic(`Has seleccionado la siguiente cita:\n*Fecha*: ${citaSeleccionadaHora.fechacita} \n*Hora*: ${citaSeleccionadaHora.horacita} \n*Profesional*: ${citaSeleccionadaHora.profesional} \n*Especialidad*: ${citaSeleccionadaHora.especialidad} \n*Lugar*: ${citaSeleccionadaHora.lugar}.`);
        return gotoFlow(step18AgendarCita2);
    })

export {
    step18AgendarCita,
    step18AgendarCita2,
};
