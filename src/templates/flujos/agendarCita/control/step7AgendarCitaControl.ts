import { addKeyword, EVENTS } from '@builderbot/bot';
import { step8AgendarCita } from '../step8AgendarCita';
import { consultarCitasPorPacEsp } from '../../../../utils/consultarCitasPorPacEsp';
// Aquí deberías importar los servicios reales de consulta de paciente y citas

const step7AgendarCitaControl = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, gotoFlow, flowDynamic }) => {
        const numeroDocumento = await state.getMyState().numeroDocumentoPaciente;
        const especialidad = await state.getMyState().especialidadAgendarCita;
        const { pacienteId, pacienteNombre, profesionalId, profesionalNombre } = await consultarCitasPorPacEsp(numeroDocumento, especialidad);
        await state.update({
            pacienteId,
            pacienteNombre,
            profesionalId,
            profesionalNombre,
        });
        await flowDynamic(`${pacienteNombre}, a continuación te proporcionaré las citas más cercanas con el profesional ${profesionalNombre} para la especialidad ${especialidad}.`);
        return gotoFlow(step8AgendarCita);
    });

export { step7AgendarCitaControl };