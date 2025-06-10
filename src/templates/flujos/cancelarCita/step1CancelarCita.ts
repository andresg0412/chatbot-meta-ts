import { addKeyword, EVENTS } from '@builderbot/bot';
import { datosinicialesComunes } from '../common/datosInicialesComunes';

const step1CencelarCita = addKeyword(['280525004', '4', 'cancelar'])
    .addAnswer('Perfecto, te solicitaré algunos datos para poder cancelar tu cita. 😊🗓️', { capture: false })
    .addAction(async (ctx, { provider, state, gotoFlow }) => {
        await state.update({ flujoSeleccionadoMenu: 'cancelarCita' });
        return gotoFlow(datosinicialesComunes);
    });
export { step1CencelarCita };