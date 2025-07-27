import { addKeyword, EVENTS } from '@builderbot/bot';
import { step13AgendarCitaConvenio, step13AgendarCitaParticular } from './step13AgendarCita';

const step12AgendarCita = addKeyword(EVENTS.ACTION)
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
            if (ctx.body === 'Particular'){
                await ctxFn.state.update({ tipoUsuarioAtencion: 'Particular' });
                return ctxFn.gotoFlow(step13AgendarCitaParticular)
            }
            if (ctx.body === 'Convenio'){
                await ctxFn.state.update({ tipoUsuarioAtencion: 'Convenio' });
                return ctxFn.gotoFlow(step13AgendarCitaConvenio)
            }
        }
    );

export { step12AgendarCita };