import { addKeyword, EVENTS } from '@builderbot/bot';
import { step4AgendarCitaPrimeraVez } from './primeravez/step4AgendarCitaPrimeraVez';
import { step4AgendarCitaControl } from './control/step4AgendarCitaControl';

const step2AgendarCita = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'Selecciona el tipo de cita:',
        {
            capture: true,
            buttons: [
                { body: 'Primera vez' },
                { body: 'Control' },
            ],
        },
        async (ctx, { state, gotoFlow }) => {
            if (ctx.body === 'Primera vez') {
                await state.update({ tipoConsultaPaciente: 'Primera vez' });
                return gotoFlow(step4AgendarCitaPrimeraVez);
            }
            if (ctx.body === 'Control') {
                await state.update({ tipoConsultaPaciente: 'Control' });
                return gotoFlow(step4AgendarCitaControl);
            }
        }
    );


export { step2AgendarCita };