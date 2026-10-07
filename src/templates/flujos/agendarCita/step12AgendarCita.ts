import { addKeyword, EVENTS } from '@builderbot/bot';
import { step13AgendarCitaConvenio, step13AgendarCitaParticular } from './step13AgendarCita';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { registrarActividadBot } from '../../../services/apiService';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion } from '../../../utils/trazabilidad';
import { aplicarFiltroCaptura } from '../filtroCaptura';


const step12AgendarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'agendar.s12_particular_convenio' });
        if (!sessionValid) {
            return endFlow();
        }
    })
    .addAnswer(
        'Atendemos tanto pacientes particulares como a aquellos con convenios médicos. ¿En cuál categoria te encuentras?',
        {
            capture: true,
            buttons: [
                { body: 'Particular' },
                { body: 'Convenio' },
            ],
        },
        async (ctx, ctxFn) => {
            const filtro = await aplicarFiltroCaptura(ctx, ctxFn, {
                paso: 'agendar.s12_particular_convenio',
                reintentar: () => ctxFn.gotoFlow(step12AgendarCita),
            });
            if (filtro) return filtro.salida;
            if (ctx.body === 'Particular') {
                trackPaso(ctx.from, 'agendar.s12_particular_convenio', 'ok');
                await ctxFn.state.update({ tipoUsuarioAtencion: 'Particular' });
                await registrarActividadBot('chat_flujo_agendar', ctx.from, {
                    step: 'tipo_paciente',
                    tipo_paciente: 'Particular'
                });
                return ctxFn.gotoFlow(step13AgendarCitaParticular)
            }
            if (ctx.body === 'Convenio') {
                trackPaso(ctx.from, 'agendar.s12_particular_convenio', 'ok');
                await ctxFn.state.update({ tipoUsuarioAtencion: 'Convenio' });
                await registrarActividadBot('chat_flujo_agendar', ctx.from, {
                    step: 'tipo_paciente',
                    tipo_paciente: 'Convenio'
                });
                return ctxFn.gotoFlow(step13AgendarCitaConvenio)
            }
            trackNoEntendido(ctx.from, 'agendar.s12_particular_convenio');
            await ctxFn.flowDynamic('Por favor elige una opción con los botones: *Particular* o *Convenio*.');
            return ctxFn.gotoFlow(step12AgendarCita);
        }
    );

export { step12AgendarCita };
