import { addKeyword, EVENTS } from '@builderbot/bot';
import { step5CancelarCita } from '../cancelarCita/step3CancelarCita';
import { step5Reprogramar } from '../reprogramarCita/step3Reprogramar';

async function consultarCitasPorDocumento(tipoDoc: string, numeroDoc: string) {
    // Simulación de respuesta
    return [
        { id: '1', fecha: '2025-06-10', hora: '10:00 AM', lugar: 'Sede Norte' },
        { id: '2', fecha: '2025-06-15', hora: '2:00 PM', lugar: 'Sede Centro' },
    ];
}

const datosinicialesComunes5 = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, gotoFlow }) => {
        // obtener estado flujoSeleccionadoMenu
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
        // Obtener tipo y número de documento del estado
        const { tipoDoc, numeroDoc } = state.getMyState();
        // Simular consulta a la API
        const citas = await consultarCitasPorDocumento(tipoDoc, numeroDoc);
        await state.update({ citas });
        if (!citas || citas.length === 0) {
            await flowDynamic('No se encontraron citas agendadas con ese documento.');
            return;
        }
        let mensaje = 'Estas son tus citas agendadas:\n';
        citas.forEach((cita, idx) => {
            mensaje += `${idx + 1}. Fecha: ${cita.fecha}, Hora: ${cita.hora}, Lugar: ${cita.lugar}\n`;
        });
        await flowDynamic(mensaje);
        await state.update({ esperaSeleccionCita: true });
        return gotoFlow(datosinicialesComunes5);
    });

const datosinicialesComunes3 = addKeyword(EVENTS.ACTION)
    .addAnswer('Ahora, por favor digita tu número de documento:',
        {capture: true },
        async (ctx, { state, gotoFlow }) => {
            const numeroDoc = ctx.body;
            console.log('Número de documento recibido:', numeroDoc);
            await state.update({ numeroDoc, esperaNumeroDoc: false });
            await state.update({ esperaSeleccionCita: true });
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