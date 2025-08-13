import { addKeyword, EVENTS } from '@builderbot/bot';
import { step13AgendarCitaConvenio, step13AgendarCitaParticular } from './step13AgendarCita';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { registrarActividadBot } from '../../../services/apiService';


const step12AgendarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow);
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
            if (ctx.body === 'Particular') {
                await ctxFn.state.update({ tipoUsuarioAtencion: 'Particular' });
                await registrarActividadBot('chat_flujo_agendar', ctx.from, {
                    step: 'tipo_paciente',
                    tipo_paciente: 'Particular'
                });
                return ctxFn.gotoFlow(step13AgendarCitaParticular)
            }
            if (ctx.body === 'Convenio') {
                await ctxFn.state.update({ tipoUsuarioAtencion: 'Convenio' });
                await registrarActividadBot('chat_flujo_agendar', ctx.from, {
                    step: 'tipo_paciente',
                    tipo_paciente: 'Convenio'
                });
                return ctxFn.gotoFlow(step13AgendarCitaConvenio)
            }
        }
    );

export { step12AgendarCita };