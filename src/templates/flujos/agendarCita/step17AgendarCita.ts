import { addKeyword, EVENTS } from '@builderbot/bot';
import { sanitizeString } from '../../../utils/sanitize';
import {
    construirPayloadPacienteNuevo,
    normalizarEmail,
    normalizarFechaNacimiento,
    normalizarNombre,
    normalizarNombreOpcional,
} from '../../../utils/datosPacienteNuevo';
import { step18AgendarCita } from './step18AgendarCita';
import { crearPaciente } from '../../../utils/consultarCitasPorDocumento';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { closeUserSession } from '../../../utils/proactiveSessionManager';
import { registrarActividadBot, CausaFalloCrearPaciente } from '../../../services/apiService';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion } from '../../../utils/trazabilidad';


/** Mensaje al paciente cuando el backend no pudo registrarlo (sin reintento automático). */
function mensajeFalloCrearPaciente(causa?: CausaFalloCrearPaciente): string {
    if (causa === 'FECHA_NACIMIENTO_INVALIDA') {
        return 'No pudimos crear tu perfil porque la fecha de nacimiento no es válida. Por favor, escríbenos de nuevo para iniciar el registro con la fecha correcta (DD/MM/AAAA), o comunícate con un asesor.';
    }
    if (causa === 'VALIDATION_ERROR') {
        return 'No pudimos crear tu perfil porque alguno de los datos no tiene el formato esperado. Por favor, escríbenos de nuevo para iniciar el registro, o comunícate con un asesor.';
    }
    return 'Lo siento, ocurrió un error al crear tu perfil. Por favor, inténtalo más tarde.';
}

const step17AgendarCita7 = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow, endFlow }) => {
        // CREAR EL NUEVO PACIENTE (POST /chatbot/crearpaciente). El body se arma y revalida en
        // utils/datosPacienteNuevo.ts; si algo obligatorio no es válido (p. ej. tipo de documento no
        // reconocido, que antes salía como 'Desconocido' y el backend rechazaba) NO se llama al backend.
        const resultado = construirPayloadPacienteNuevo(state.getMyState() ?? {}, ctx.from);
        if (!resultado.ok || !resultado.payload) {
            console.error(`[step17AgendarCita7] Registro de paciente no enviado: datos inválidos (${resultado.camposInvalidos.join(', ')}).`);
            trackPaso(ctx.from, 'agendar.s17_formulario_paciente', 'error', {
                metadata: { motivo: 'datos_invalidos', campos: resultado.camposInvalidos },
            });
            trackFin(ctx.from, 'agendar', 'error_backend', {
                paso: 'agendar.s17_formulario_paciente',
                metadata: { motivo: 'datos_invalidos', campos: resultado.camposInvalidos },
            });
            await registrarActividadBot('chat_flujo_agendar', ctx.from, {
                step: 'error_datos_paciente',
                campos: resultado.camposInvalidos.join(','),
            });
            closeUserSession(ctx.from);
            await flowDynamic('No pudimos completar tu registro porque algunos datos no quedaron bien guardados. Por favor, vuelve a escribirnos para iniciar de nuevo o comunícate con un asesor.');
            return endFlow();
        }
        const datosPaciente = resultado.payload;
        const alta = await crearPaciente(datosPaciente); // nunca lanza
        if (!alta.ok || !alta.pacienteId) {
            trackErrorBackend(ctx.from, 'agendar.s17_formulario_paciente', '/chatbot/crearpaciente', { siempre: true });
            trackFin(ctx.from, 'agendar', 'error_backend', {
                paso: 'agendar.s17_formulario_paciente',
                metadata: { causa: alta.causa ?? 'ERROR' },
            });
            await registrarActividadBot('chat_flujo_agendar', ctx.from, {
                step: 'error_crear_paciente',
                causa: alta.causa ?? 'ERROR',
            });
            closeUserSession(ctx.from);
            await flowDynamic(mensajeFalloCrearPaciente(alta.causa));
            return endFlow();
        }
        // 200 con ya_existia: el documento ya estaba registrado; se sigue con ese paciente.
        await state.update({ pacienteId: alta.pacienteId });
        trackIdentificacion(ctx.from, datosPaciente.numero_documento, alta.yaExistia ? 'encontrado' : 'nuevo', 'agendar.s17_formulario_paciente');
        trackPaso(ctx.from, 'agendar.s17_formulario_paciente', 'ok', alta.yaExistia ? { metadata: { ya_existia: true } } : undefined);
        await registrarActividadBot('chat_flujo_agendar', ctx.from, {
            step: 'paciente_creado',
            ...(alta.yaExistia ? { ya_existia: true } : {}),
        });
        return gotoFlow(step18AgendarCita);
    })

// Cada paso del formulario, si la respuesta no es válida, vuelve a preguntar ESE MISMO dato (antes la
// fecha inválida volvía al segundo nombre, el correo inválido al primer apellido y los nombres al
// primer nombre, rehaciendo el formulario).

const step17AgendarCita6 = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow);
        if (!sessionValid) {
            return endFlow();
        }
    })
    .addAnswer('Ahora, por favor digita tu correo electrónico 📧:',
        {
            capture: true,
        },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const correoElectronico = normalizarEmail(sanitizeString(ctx.body, 200));
            if (!correoElectronico) {
                trackNoEntendido(ctx.from, 'agendar.s17_formulario_paciente', 1, { contexto: 'correo' });
                await flowDynamic('El correo electrónico ingresado no es válido. Escríbelo sin espacios, por ejemplo nombre@correo.com. Intenta nuevamente.');
                return gotoFlow(step17AgendarCita6);
            }
            await state.update({ correoElectronico, esperaCorreoElectronico: false, esperaSeleccionCita: true });
            return gotoFlow(step17AgendarCita7);
        }
    );


const step17AgendarCita5 = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow);
        if (!sessionValid) {
            return endFlow();
        }
    })
    .addAnswer('Ahora, por favor digita tu fecha de nacimiento. Utiliza el formato DD/MM/AAAA, por ejemplo 24/12/1990:',
        { capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            // Se guarda en formato YYYY-MM-DD (el que exige el backend).
            const fechaFormateada = normalizarFechaNacimiento(sanitizeString(ctx.body, 20));
            if (!fechaFormateada) {
                trackNoEntendido(ctx.from, 'agendar.s17_formulario_paciente', 1, { contexto: 'fecha_nacimiento' });
                await flowDynamic('La fecha de nacimiento ingresada no es válida. Usa el formato DD/MM/AAAA, por ejemplo 24/12/1990. Intenta nuevamente.');
                return gotoFlow(step17AgendarCita5);
            }
            await state.update({ fechaNacimiento: fechaFormateada, esperaFechaNacimiento: false, esperaSeleccionCita: true });
            return gotoFlow(step17AgendarCita6);
        }
    );

const step17AgendarCita4 = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow);
        if (!sessionValid) {
            return endFlow();
        }
    })
    .addAnswer('Digita tu *SEGUNDO* apellido. Si no tienes, escribe *no*:',
        { capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            // '' = no tiene segundo apellido (el backend lo guarda como NULL).
            const apellidoPaciente2 = normalizarNombreOpcional(ctx.body);
            if (apellidoPaciente2 === null) {
                trackNoEntendido(ctx.from, 'agendar.s17_formulario_paciente', 1, { contexto: 'apellido' });
                await flowDynamic('El apellido ingresado no es válido. Usa solo letras, o escribe *no* si no tienes segundo apellido. Intenta nuevamente.');
                return gotoFlow(step17AgendarCita4);
            }
            await state.update({ apellidoPaciente2, esperaNombrePaciente: false, esperaSeleccionCita: true });
            return gotoFlow(step17AgendarCita5);
        }
    );

const step17AgendarCita3 = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow);
        if (!sessionValid) {
            return endFlow();
        }
    })
    .addAnswer('Digita tu *PRIMER* apellido:',
        { capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const apellidoPaciente1 = normalizarNombre(ctx.body);
            if (!apellidoPaciente1) {
                trackNoEntendido(ctx.from, 'agendar.s17_formulario_paciente', 1, { contexto: 'apellido' });
                await flowDynamic('El apellido ingresado no es válido. Usa solo letras (mínimo 2). Intenta nuevamente.');
                return gotoFlow(step17AgendarCita3);
            }
            await state.update({ apellidoPaciente1, esperaNombrePaciente: false, esperaSeleccionCita: true });
            return gotoFlow(step17AgendarCita4);
        }
    );

const step17AgendarCita2 = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow);
        if (!sessionValid) {
            return endFlow();
        }
    })
    .addAnswer('Ahora, digita tu *SEGUNDO* nombre. Si no tienes, escribe *no*:',
        { capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            // '' = no tiene segundo nombre (el backend lo guarda como NULL).
            const nombrePaciente2 = normalizarNombreOpcional(ctx.body);
            if (nombrePaciente2 === null) {
                trackNoEntendido(ctx.from, 'agendar.s17_formulario_paciente', 1, { contexto: 'nombre' });
                await flowDynamic('El nombre ingresado no es válido. Usa solo letras, o escribe *no* si no tienes segundo nombre. Intenta nuevamente.');
                return gotoFlow(step17AgendarCita2);
            }
            await state.update({ nombrePaciente2, esperaNombrePaciente: false, esperaSeleccionCita: true });
            return gotoFlow(step17AgendarCita3);
        }
    );

const step17AgendarCita = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'agendar.s17_formulario_paciente' });
        if (!sessionValid) {
            return endFlow();
        }
        // Al re-preguntar el primer nombre no se vuelve a contar la llegada al formulario.
        if (state.getMyState()?.reintentoPrimerNombre) {
            await state.update({ reintentoPrimerNombre: false });
            return;
        }
        await registrarActividadBot('chat_flujo_agendar', ctx.from, {
            step: 'formulario_paciente',
            paciente: 'paciente_nuevo'
        });
    })
    .addAnswer('Por favor, digita tu *PRIMER* nombre:',
        { capture: true },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const nombrePaciente1 = normalizarNombre(ctx.body);
            if (!nombrePaciente1) {
                trackNoEntendido(ctx.from, 'agendar.s17_formulario_paciente', 1, { contexto: 'nombre' });
                await flowDynamic('El nombre ingresado no es válido. Usa solo letras (mínimo 2). Intenta nuevamente.');
                await state.update({ reintentoPrimerNombre: true });
                return gotoFlow(step17AgendarCita);
            }
            await state.update({ nombrePaciente1, esperaNombrePaciente: false, esperaSeleccionCita: true });
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
