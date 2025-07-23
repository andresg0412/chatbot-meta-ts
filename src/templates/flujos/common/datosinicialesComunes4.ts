import { addKeyword, EVENTS } from '@builderbot/bot';
import { consultarPacientePorDocumento } from '../../../services/apiService';
import { consultarCitasPorDocumento } from '../../../utils/consultarCitasPorDocumento';
import { obtenerCitasValidas } from '../../../utils/obtenerCitasValidas';
import { sanitizeString } from '../../../utils/sanitize';
import { datosinicialesComunes5 } from './datosinicialesComunes5';
import { datosinicialesComunes3 } from './datosinicialesComunes3';

const datosinicialesComunes4 = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        let { tipoDoc, numeroDoc } = state.getMyState();
        tipoDoc = sanitizeString(tipoDoc, 30);
        numeroDoc = sanitizeString(numeroDoc, 20);
        const paciente = await consultarPacientePorDocumento(numeroDoc);
        if (!paciente) {
            await flowDynamic('No se encontró información del paciente con ese documento.');
            return gotoFlow(datosinicialesComunes3);
        }
        const nombreCompleto = paciente.nombre_paciente;

        const citas = await consultarCitasPorDocumento(tipoDoc, numeroDoc);
        const ahora = new Date();
        const citasValidas = await obtenerCitasValidas(citas, ahora);

        await state.update({ citasProgramadas: citasValidas });
        if (!citasValidas || citasValidas.length === 0) {
            await flowDynamic('No se encontraron citas agendadas y vigentes con ese documento.');
            return;
        }
        let mensaje = `Estimado/a *${nombreCompleto}* Tienes las siguientes citas agendadas y vigentes:\n`;
        citasValidas.forEach((cita: any, idx: number) => {
            mensaje += `*${idx + 1}*. *Fecha*: ${cita.fecha_cita}, *Hora*: ${cita.hora_cita}, *Especialidad*: ${cita.especialidad}\n`;
        });
        await flowDynamic(mensaje);
        await state.update({ esperaSeleccionCita: true });
        return gotoFlow(datosinicialesComunes5);
    });

export { datosinicialesComunes4 };
