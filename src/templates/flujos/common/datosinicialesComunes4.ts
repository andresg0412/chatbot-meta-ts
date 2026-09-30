import { addKeyword, EVENTS } from '@builderbot/bot';
import { consultarPacientePorDocumento } from '../../../services/apiService';
import { consultarCitasPorDocumento } from '../../../utils/consultarCitasPorDocumento';
import { obtenerCitasValidas } from '../../../utils/obtenerCitasValidas';
import { sanitizeString } from '../../../utils/sanitize';
import { datosinicialesComunes5 } from './datosinicialesComunes5';
import { datosinicialesComunes3 } from './datosinicialesComunes3';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { formatearFechaLarga, formatearHoraHHMM } from '../../../utils/fechaHora';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion, flujoDesdeSeleccionMenu } from '../../../utils/trazabilidad';

const ETIQUETA_ESTADO_CITA: Record<string, string> = {
    Confirmado: '(Confirmada)',
    Pendiente: '(Pendiente por confirmar)',
};

const datosinicialesComunes4 = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        const flujoEnCurso = flujoDesdeSeleccionMenu(state.getMyState()?.flujoSeleccionadoMenu);
        trackPaso(ctx.from, 'comun.c04_consulta_citas', 'mostrado', { flujo: flujoEnCurso });
        let { tipoDoc, numeroDoc } = state.getMyState();
        tipoDoc = sanitizeString(tipoDoc, 30);
        numeroDoc = sanitizeString(numeroDoc, 20);
        const paciente = await consultarPacientePorDocumento(numeroDoc);
        trackIdentificacion(ctx.from, numeroDoc, paciente ? 'encontrado' : 'no_encontrado', 'comun.c03_documento', { flujo: flujoEnCurso });
        if (!paciente) {
            trackErrorBackend(ctx.from, 'comun.c04_consulta_citas', '/chatbot/paciente', { flujo: flujoEnCurso });
            await flowDynamic('No se encontró información del paciente con ese documento.');
            return gotoFlow(datosinicialesComunes3);
        }
        const nombreCompleto = paciente.nombre_paciente;

        const citas = await consultarCitasPorDocumento(tipoDoc, numeroDoc);
        const ahora = new Date();
        const citasValidas = await obtenerCitasValidas(citas, ahora);

        await state.update({ citasProgramadas: citasValidas });
        if (!citasValidas || citasValidas.length === 0) {
            trackErrorBackend(ctx.from, 'comun.c04_consulta_citas', '/chatbot/citaspaciente', { flujo: flujoEnCurso });
            trackPaso(ctx.from, 'comun.c04_consulta_citas', 'ok', { flujo: flujoEnCurso, metadata: { citas_vigentes: 0 } });
            await flowDynamic('No se encontraron citas agendadas y vigentes con ese documento.');
            return;
        }
        let mensaje = `Estimado/a *${nombreCompleto}* Tienes las siguientes citas agendadas y vigentes:\n`;
        citasValidas.forEach((cita: any, idx: number) => {
            const etiqueta = ETIQUETA_ESTADO_CITA[cita.estado_agenda];
            mensaje += `*${idx + 1}*. *Fecha*: ${formatearFechaLarga(cita.fecha_cita)}, *Hora*: ${formatearHoraHHMM(cita.hora_cita)}, *Especialidad*: ${cita.especialidad}${etiqueta ? ` ${etiqueta}` : ''}\n`;
        });
        await flowDynamic(mensaje);
        await state.update({ esperaSeleccionCita: true });
        return gotoFlow(datosinicialesComunes5);
    });

export { datosinicialesComunes4 };
