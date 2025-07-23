import { addKeyword, EVENTS } from '@builderbot/bot';
import { consultarPaciente } from '../../../utils/consultarCitasPorDocumento';
import { step17AgendarCita } from './step17AgendarCita';
import { step18AgendarCita } from './step18AgendarCita';

const step16AgendarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        const documentoPaciente = state.getMyState().numeroDocumentoPaciente;
        const paciente = await consultarPaciente(documentoPaciente);
        if (!paciente) {
            await flowDynamic('No se encontró información del paciente con ese documento.');
            return gotoFlow(step17AgendarCita);
        }
        await state.update({
            pacienteId: paciente.pacienteId,
            nombreCompleto: paciente.nombreCompleto,
        });
        return gotoFlow(step18AgendarCita);
    })


export { step16AgendarCita };
