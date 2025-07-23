import { addKeyword, EVENTS } from '@builderbot/bot';
import { datosinicialesComunes } from '../common/datosInicialesComunes';

const step1Reprogramar = addKeyword(['280525003', '3', 'reprogramar cita'])
    .addAnswer('Perfecto, te solicitaré algunos datos para poder reprogramar tu cita. 😊🗓️', { capture: false })
    .addAction(async (ctx, { provider, state, gotoFlow }) => {
        await state.update({ flujoSeleccionadoMenu: 'reprogramarCita' });
        return gotoFlow(datosinicialesComunes);
    });
export { step1Reprogramar };
