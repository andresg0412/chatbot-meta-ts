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

const step17AgendarCita7 = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow, endFlow }) => {
        // CREAR EL NUEVO PACIENTE
        //PacientesID, TipoDocumento, NumeroDocumento, NombreCompleto, NúmeroContacto, Email, Convenio, FechaNacimiento, FechaRegistro
        //const pacienteId = generarAgendaIdAleatorio();
        const tipoDoc = state.getMyState().tipoDoc;
        const numeroDocumento = state.getMyState().numeroDocumentoPaciente;
        const nombrePaciente1 = state.getMyState().nombrePaciente1;
        const nombrePaciente2 = state.getMyState().nombrePaciente2;
        const apellidoPaciente1 = state.getMyState().apellidoPaciente1;
        const apellidoPaciente2 = state.getMyState().apellidoPaciente2;
        //const nombreCompleto = `${nombrePaciente1} ${nombrePaciente2} ${apellidoPaciente1} ${apellidoPaciente2}`.trim();
        const numeroContacto = await state.getMyState().celular;
        // el numero de contacto viene como 573185214214 requiero separar el 57
        //const codigoPais = numeroContacto.slice(0, 2);
        const numeroContactoSinCodigo = numeroContacto.slice(2);
        const email = state.getMyState().correoElectronico;
        //consultar convenio a la base de datos
        const fechaNacimiento = state.getMyState().fechaNacimiento;
        // fechaRegistro la necesito con este formato: '27/5/2025 18:34:21'
        const now = new Date();
        const fechaRegistro = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        let tipoDocumento = '';
        const convenio = await state.getMyState().nombreServicioConvenio || 'Particular';
        switch (tipoDoc) {
            case 'agendarcita_tipo_cd':
                tipoDocumento = 'CC';
                break;
            case 'agendarcita_tipo_cex':
                tipoDocumento = 'CE';
                break;
            case 'agendarcita_tipo_tid':
                tipoDocumento = 'TI';
                break;
            case 'agendarcita_tipo_rcv':
                tipoDocumento = 'RC';
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
            //PacientesID: pacienteId,
            tipo_documento: tipoDocumento,
            numero_documento: numeroDocumento,
            primer_nombre: nombrePaciente1,
            segundo_nombre: nombrePaciente2,
            primer_apellido: apellidoPaciente1,
            segundo_apellido: apellidoPaciente2,
            numero_contacto: numeroContactoSinCodigo,
            email: email,
            //convenio: convenio,
            fecha_nacimiento: fechaNacimiento,
            regimen: 'Particular'
        };
        try {
            const paciente_id = await crearPaciente(datosPaciente);
            await state.update({ pacienteId: paciente_id });
        } catch (error) {
            await flowDynamic('Lo siento, ocurrió un error al crear tu perfil. Por favor, inténtalo más tarde.');
            return endFlow();
        }
        return gotoFlow(step18AgendarCita);
    })

const step17AgendarCita6 = addKeyword(EVENTS.ACTION)
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
            return gotoFlow(step17AgendarCita7);
        }
    );


const step17AgendarCita5 = addKeyword(EVENTS.ACTION)
    .addAnswer('Ahora, por favor digita tu fecha de nacimiento (Utiliza el formato DD/MM/AAA por ejemplo 24/12/1990:',
        {capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const fechaNacimiento = ctx.body.trim();
            const fechaRegex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
            if (!fechaRegex.test(fechaNacimiento)) {
                await flowDynamic('La fecha de nacimiento ingresada no es válida. Intenta nuevamente.');
                return gotoFlow(step17AgendarCita2);
            }
            const partesFecha = fechaNacimiento.split('/');
            //fecha en formato YYYY-MM-DD
            const fechaFormateada = `${partesFecha[2]}-${partesFecha[1]}-${partesFecha[0]}`;
            await state.update({ fechaNacimiento: fechaFormateada, esperaFechaNacimiento: false, esperaSeleccionCita: true });
            return gotoFlow(step17AgendarCita6);
        }
    );

const step17AgendarCita4 = addKeyword(EVENTS.ACTION)
    .addAnswer('Digita tu *SEGUNDO* apellido:',
        {capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const apellidoPaciente2 = sanitizeString(ctx.body, 30);
            if (apellidoPaciente2.length < 3) {
                await flowDynamic('El apellido ingresado no es válido. Intenta nuevamente.');
                return gotoFlow(step17AgendarCita);
            }
            const apellidoPacienteMayuscula2 = apellidoPaciente2.toUpperCase();
            await state.update({ apellidoPaciente2: apellidoPacienteMayuscula2, esperaNombrePaciente: false, esperaSeleccionCita: true });
            return gotoFlow(step17AgendarCita5);
        }
    );

const step17AgendarCita3 = addKeyword(EVENTS.ACTION)
    .addAnswer('Digita tu *PRIMER* apellido:',
        {capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const apellidoPaciente1 = sanitizeString(ctx.body, 30);
            if (apellidoPaciente1.length < 3) {
                await flowDynamic('El apellido ingresado no es válido. Intenta nuevamente.');
                return gotoFlow(step17AgendarCita);
            }
            const apellidoPacienteMayuscula1 = apellidoPaciente1.toUpperCase();
            await state.update({ apellidoPaciente1: apellidoPacienteMayuscula1, esperaNombrePaciente: false, esperaSeleccionCita: true });
            return gotoFlow(step17AgendarCita4);
        }
    );

const step17AgendarCita2 = addKeyword(EVENTS.ACTION)
    .addAnswer('Ahora, digita tu *SEGUNDO* nombre:',
        {capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const nombrePaciente2 = sanitizeString(ctx.body, 30);
            if (nombrePaciente2.length < 3) {
                await flowDynamic('El nombre ingresado no es válido. Intenta nuevamente.');
                return gotoFlow(step17AgendarCita);
            }
            const nombrePacienteMayuscula2 = nombrePaciente2.toUpperCase();
            await state.update({ nombrePaciente2: nombrePacienteMayuscula2, esperaNombrePaciente: false, esperaSeleccionCita: true });
            return gotoFlow(step17AgendarCita3);
        }
    );

const step17AgendarCita = addKeyword(EVENTS.ACTION)
    .addAnswer('Por favor, digita tu *PRIMER* nombre:',
        {capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const nombrePaciente1 = sanitizeString(ctx.body, 30);
            if (nombrePaciente1.length < 3) {
                await flowDynamic('El nombre ingresado no es válido. Intenta nuevamente.');
                return gotoFlow(step17AgendarCita);
            }
            const nombrePacienteMayusculas1 = nombrePaciente1.toUpperCase();
            await state.update({ nombrePaciente1: nombrePacienteMayusculas1, esperaNombrePaciente: false, esperaSeleccionCita: true });
            return gotoFlow(step17AgendarCita2);
        }
    );


export {
    step17AgendarCita,
    step17AgendarCita2,
    step17AgendarCita3,
    step17AgendarCita4,
    step17AgendarCita5,
    step17AgendarCita6,
    step17AgendarCita7,
};
