import { addKeyword, EVENTS } from '@builderbot/bot';
import { step12AgendarCita } from './step12AgendarCita';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion } from '../../../utils/trazabilidad';

const step11AgendarCita = addKeyword(EVENTS.ACTION)
    .addAnswer('Para agendar tu cita, requerimos los siguientes datos.',
        {capture: false},
        async (ctx, { gotoFlow }) => {
            trackPaso(ctx.from, 'agendar.s11_datos_intro');
            return gotoFlow(step12AgendarCita);
        }
    );

export { step11AgendarCita };