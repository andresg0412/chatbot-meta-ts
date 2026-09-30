import { addKeyword, EVENTS } from '@builderbot/bot';
import { consultarPaciente } from '../../../utils/consultarCitasPorDocumento';
import { step17AgendarCita } from './step17AgendarCita';
import { step18AgendarCita } from './step18AgendarCita';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion } from '../../../utils/trazabilidad';

const step16AgendarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        trackPaso(ctx.from, 'agendar.s16_consulta_paciente');
        const documentoPaciente = state.getMyState().numeroDocumentoPaciente;
        const paciente = await consultarPaciente(documentoPaciente);
        trackIdentificacion(ctx.from, documentoPaciente, paciente ? 'encontrado' : 'no_encontrado', 'agendar.s15_documento');
        if (!paciente) {
            trackErrorBackend(ctx.from, 'agendar.s16_consulta_paciente', '/chatbot/paciente');
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
