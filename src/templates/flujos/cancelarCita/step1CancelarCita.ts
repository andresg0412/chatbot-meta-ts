import { addKeyword, EVENTS } from '@builderbot/bot';
import { datosinicialesComunes } from '../common/datosInicialesComunes';

// saludo de bienvenido a la seccion de reprogramación de citas y enviar listado de tipos de documento
const step1CencelarCita = addKeyword(['280525004', '4', 'cancelar'])
    .addAnswer('Perfecto, te solicitaré algunos datos para poder cancelar tu cita', { capture: false })
    .addAction(async (ctx, { provider, state, gotoFlow }) => {
        // actualizar estado de flujoSeleccionadoMenu
        await state.update({ flujoSeleccionadoMenu: 'cancelarCita' });
        //enviar a flujo comun
        return gotoFlow(datosinicialesComunes);
    });
export { step1CencelarCita };