import { addKeyword, EVENTS } from '@builderbot/bot';
import { step5CancelarCita } from '../cancelarCita/step3CancelarCita';
import { step5Reprogramar } from '../reprogramarCita/step3Reprogramar';
import { consultarPacientePorDocumento, consultarCitasPorPacienteId } from '../../../services/apiService';

async function consultarCitasPorDocumento(tipoDoc: string, numeroDoc: string) {
    // Consultar información del paciente usando la API real
    const paciente = await consultarPacientePorDocumento(numeroDoc);
    if (!paciente || paciente.length === 0) {
        return [];
    }
    // Obtener el PacientesID del primer resultado (ajustar si la API retorna diferente)
    const pacienteId = paciente[0]?.PacientesID;
    if (!pacienteId) {
        return [];
    }
    // Consultar las citas asociadas a ese pacienteId
    const citas = await consultarCitasPorPacienteId(pacienteId);
    if (!citas || citas.length === 0) {
        return [];
    }
    // Filtrar solo las citas con EstadoAgenda = 'Programada'
    const citasProgramadas = citas.filter((cita: any) => cita.EstadoAgenda === 'Programada');
    return citasProgramadas;
}

async function obtenerCitasValidas(citas: any, ahora: Date) {
        return citas.filter((cita: any) => {
            // FechaCita: "15/05/2025", HoraFinal: "14:50"
            if (!cita.FechaCita || !cita.HoraFinal) return false;
            const [dia, mes, anio] = (cita.FechaCita || '').split('/');
            const [hora, minuto] = (cita.HoraFinal || '').split(':');
            if (!dia || !mes || !anio || !hora || !minuto) return false;
            const fechaHoraFinal = new Date(`${anio}-${mes}-${dia}T${hora.padStart(2, '0')}:${minuto.padStart(2, '0')}:00`);
            return fechaHoraFinal > ahora;
        });
    }

const datosinicialesComunes5 = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        const flujoSeleccionadoMenu = state.getMyState().flujoSeleccionadoMenu;
        if (flujoSeleccionadoMenu === 'cancelarCita') {
            return gotoFlow(step5CancelarCita);
        } else if (flujoSeleccionadoMenu === 'reprogramarCita') {
            return gotoFlow(step5Reprogramar);
        } else {
            await flowDynamic('Opción no válida. Por favor, intenta nuevamente.');
            return;
        }
    });

const datosinicialesComunes4 = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        const { tipoDoc, numeroDoc } = state.getMyState();
        const paciente = await consultarPacientePorDocumento(numeroDoc);
        if (!paciente || paciente.length === 0) {
            await flowDynamic('No se encontró información del paciente con ese documento.');
            return;
        }
        const primerNombre = paciente[0]?.PrimerNombre || '';
        const segundoNombre = paciente[0]?.SegundoNombre || '';
        const nombreCompleto = `${primerNombre} ${segundoNombre}`.trim();

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
            mensaje += `*${idx + 1}*. *Fecha*: ${cita.FechaCita}, *Hora*: ${cita.HoraCita}, *Especialidad*: ${cita.Especialidad}\n`;
        });
        await flowDynamic(mensaje);
        await state.update({ esperaSeleccionCita: true });
        return gotoFlow(datosinicialesComunes5);
    });

const datosinicialesComunes3 = addKeyword(EVENTS.ACTION)
    .addAnswer('Ahora, por favor digita tu número de documento 🔢:',
        {capture: true },
        async (ctx, { state, gotoFlow }) => {
            const numeroDoc = ctx.body;
            await state.update({ numeroDoc, esperaNumeroDoc: false, esperaSeleccionCita: true });
            return gotoFlow(datosinicialesComunes4);
        }
    )

// Cuando responde el usuario a numero de documento, se captura el numero de documento y se guarda en el estado
const datosinicialesComunes2 = addKeyword(['doc_cc', 'doc_ce', 'doc_ti', 'doc_rc', 'doc_pas', 'doc_otro'])
    .addAction(async (ctx, { state, gotoFlow }) => {
        const tipoDoc = ctx.listResponse ? ctx.listResponse.title : ctx.body;
        await state.update({ tipoDoc, esperaTipoDoc: false });
        return gotoFlow(datosinicialesComunes3);
    });


// saludo de bienvenido a la seccion de reprogramación de citas y enviar listado de tipos de documento
const datosinicialesComunes = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { provider, state }) => {
        const list = {
            header: { type: 'text', text: 'Tipo de documento' },
            body: { text: 'Selecciona tu tipo de documento:' },
            footer: { text: '' },
            action: {
                button: 'Seleccionar',
                sections: [
                    {
                        title: 'Tipos',
                        rows: [
                            { id: 'doc_cc', title: 'Cédula de ciudadanía' },
                            { id: 'doc_ce', title: 'Cédula de extranjería' },
                            { id: 'doc_ti', title: 'Tarjeta de identidad' },
                            { id: 'doc_rc', title: 'Registro civil' },
                            { id: 'doc_pas', title: 'Pasaporte' },
                            { id: 'doc_otro', title: 'Otro' },
                        ]
                    }
                ]
            }
        };
        await provider.sendList(ctx.from, list);
    });
export {
    datosinicialesComunes,
    datosinicialesComunes2,
    datosinicialesComunes3,
    datosinicialesComunes4,
    datosinicialesComunes5,
};