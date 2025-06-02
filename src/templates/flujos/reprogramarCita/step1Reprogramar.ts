import { addKeyword, EVENTS } from '@builderbot/bot';
import { datosinicialesComunes } from '../common/datosInicialesComunes';

// saludo de bienvenido a la seccion de reprogramación de citas y enviar listado de tipos de documento
const step1Reprogramar = addKeyword(['280525003', '3', 'reprogramar cita'])
    .addAnswer('Perfecto, te solicitaré algunos datos para poder reprogramar tu cita. 😊🗓️', { capture: false })
    .addAction(async (ctx, { provider, state, gotoFlow }) => {
        // actualizar estado de flujoSeleccionadoMenu
        await state.update({ flujoSeleccionadoMenu: 'reprogramarCita' });
        //enviar a flujo comun
        return gotoFlow(datosinicialesComunes);
    });
export { step1Reprogramar };
