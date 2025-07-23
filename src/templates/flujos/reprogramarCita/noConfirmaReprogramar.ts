import { addKeyword, EVENTS } from '@builderbot/bot';
import { menuFlow } from '../../menuFlow';
import { volverMenuPrincipal } from '../common/volverMenuPrincipal';


const noConfirmaReprogramar = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        // Obtener tipo y número de documento del estado
        const { tipoDoc, numeroDoc } = state.getMyState();
        // Simular consulta a la API
        const { citasProgramadas } = state.getMyState();
        if (!citasProgramadas || citasProgramadas.length === 0) {
            await flowDynamic('No se encontraron citas agendadas con ese documento.');
            return;
        }
        let mensaje = 'Recuerda que tienes las siguientes citas agendadas:\n';
        citasProgramadas.forEach((cita: any, idx: any) => {
            mensaje += `*${idx + 1}*. *Fecha*: ${cita.FechaCita}, *Hora*: ${cita.HoraCita}, *Especialidad*: ${cita.Especialidad}\n`;
        });
        await flowDynamic(mensaje);
        return gotoFlow(volverMenuPrincipal);
    });

export { noConfirmaReprogramar };