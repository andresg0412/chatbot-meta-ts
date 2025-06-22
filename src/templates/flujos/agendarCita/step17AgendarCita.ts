import { addKeyword, EVENTS } from '@builderbot/bot';
import { sanitizeString, isValidDocumentNumber } from '../../../utils/sanitize';
import { step18AgendarCita } from './step18AgendarCita';
import { crearPaciente } from '../../../utils/consultarCitasPorDocumento';

function generarAgendaIdAleatorio() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 8; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

const step17AgendarCita4 = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow, endFlow }) => {
        // CREAR EL NUEVO PACIENTE
        //PacientesID, TipoDocumento, NumeroDocumento, NombreCompleto, NúmeroContacto, Email, Convenio, FechaNacimiento, FechaRegistro
        const pacienteId = generarAgendaIdAleatorio();
        const tipoDoc = state.getMyState().tipoDoc;
        const numeroDocumento = state.getMyState().numeroDocumentoPaciente;
        const nombreCompleto = state.getMyState().nombrePaciente;
        const numeroContacto = ctx.from;
        const email = state.getMyState().correoElectronico;
        //consultar convenio a la base de datos
        const fechaNacimiento = state.getMyState().fechaNacimiento;
        const fechaRegistro = new Date().toString();
        let tipoDocumento = '';
        switch (tipoDoc) {
            case 'agendarcita_tipo_cd':
                tipoDocumento = 'Cc';
                break;
            case 'agendarcita_tipo_cex':
                tipoDocumento = 'Ce';
                break;
            case 'agendarcita_tipo_tid':
                tipoDocumento = 'TI';
                break;
            case 'agendarcita_tipo_rcv':
                tipoDocumento = 'Rc';
                break;
            case 'agendarcita_tipo_ps':
                tipoDocumento = 'Pasaporte';
                break;
            case 'agendarcita_tipo_ot':
                tipoDocumento = 'Otro';
                break;
            default:
                tipoDocumento = 'Desconocido';
            
            
        }
        const datosPaciente = {
            PacientesID: pacienteId,
            TipoDocumento: tipoDocumento,
            NumeroDocumento: numeroDocumento,
            NombreCompleto: nombreCompleto,
            NumeroContacto: numeroContacto,
            Email: email,
            Convenio: 'Convenio Desconocido', // Aquí deberías consultar el convenio a la base de datos
            FechaNacimiento: fechaNacimiento,
            FechaRegistro: fechaRegistro
        };
        try {
            await crearPaciente(datosPaciente);
            await state.update({ pacienteId });
        } catch (error) {
            await flowDynamic('Lo siento, ocurrió un error al crear tu perfil. Por favor, inténtalo más tarde.');
            return endFlow();
        }
        return gotoFlow(step18AgendarCita);
    })

const step17AgendarCita3 = addKeyword(EVENTS.ACTION)
    .addAnswer('Ahora, por favor digita tu correo electrónico 📧:',
        {
            capture: true,
        },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const correoElectronico = sanitizeString(ctx.body, 50);
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(correoElectronico)) {
                await flowDynamic('El correo electrónico ingresado no es válido. Intenta nuevamente.');
                return gotoFlow(step17AgendarCita3);
            }
            await state.update({ correoElectronico, esperaCorreoElectronico: false, esperaSeleccionCita: true });
            return gotoFlow(step17AgendarCita4);
        }
    );


const step17AgendarCita2 = addKeyword(EVENTS.ACTION)
    .addAnswer('Ahora, por favor digita tu fecha de nacimiento (Utiliza el formato DD/MM/AAA por ejemplo 24/12/1990:',
        {capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const fechaNacimiento = ctx.body.trim();
            const fechaRegex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
            if (!fechaRegex.test(fechaNacimiento)) {
                await flowDynamic('La fecha de nacimiento ingresada no es válida. Intenta nuevamente.');
                return gotoFlow(step17AgendarCita2);
            }
            await state.update({ fechaNacimiento, esperaFechaNacimiento: false, esperaSeleccionCita: true });
            return gotoFlow(step17AgendarCita3);
        }
    );

const step17AgendarCita = addKeyword(EVENTS.ACTION)
    .addAnswer('Por favor, digita tu nombre completo:',
        {capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const nombrePaciente = sanitizeString(ctx.body, 30);
            if (nombrePaciente.length < 3) {
                await flowDynamic('El nombre ingresado no es válido. Intenta nuevamente.');
                return gotoFlow(step17AgendarCita);
            }
            await state.update({ nombrePaciente, esperaNombrePaciente: false, esperaSeleccionCita: true });
            return gotoFlow(step17AgendarCita2);
        }
    );


export {
    step17AgendarCita,
    step17AgendarCita2,
    step17AgendarCita3,
    step17AgendarCita4,
};
