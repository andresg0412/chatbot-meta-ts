import { addKeyword, EVENTS } from '@builderbot/bot';
import {
    step5AgendarCitaPrimeraVezPresencial,
    step5AgendarCitaPrimeraVezVirtual,
} from './step5AgendarCitaPrimeraVez';

const step4AgendarCitaPrimeraVez = addKeyword(EVENTS.ACTION)
    .addAction(
        async (ctx, { state, gotoFlow }) => {
            const tipoCitaAgendarCita = await state.getMyState().tipoCitaAgendarCita;
            if (tipoCitaAgendarCita === 'Presencial') {
                return gotoFlow(step5AgendarCitaPrimeraVezPresencial)
            }
            else if (tipoCitaAgendarCita === 'Virtual') {
                return gotoFlow(step5AgendarCitaPrimeraVezVirtual)
            }
        },
    );

export { step4AgendarCitaPrimeraVez };