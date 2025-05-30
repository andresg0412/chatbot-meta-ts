import { addKeyword, EVENTS } from '@builderbot/bot';

// Simulación de consulta a API externa para obtener citas agendadas
async function consultarCitasPorDocumento(tipoDoc: string, numeroDoc: string) {
    // Simulación de respuesta
    return [
        { id: '1', fecha: '2025-06-10', hora: '10:00 AM', lugar: 'Sede Norte' },
        { id: '2', fecha: '2025-06-15', hora: '2:00 PM', lugar: 'Sede Centro' },
    ];
}

export const reprogramarCitaFlow = addKeyword(['280525003', '3', 'reprogramar cita'])
    .addAnswer('Perfecto, te solicitaré algunos datos para poder reprogramar tu cita', { capture: false })
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
        await state.update({ esperaTipoDoc: true });
    })
    .addAction(async (ctx, { state, flowDynamic }) => {
        const { esperaTipoDoc } = state.getMyState();
        if (esperaTipoDoc && ctx.listResponse) {
            await state.update({ tipoDoc: ctx.listResponse.title, esperaTipoDoc: false });
            await flowDynamic('Ahora, por favor digita tu número de documento:');
            await state.update({ esperaNumeroDoc: true });
        }
    })
    .addAction(async (ctx, { state, flowDynamic }) => {
        const { esperaNumeroDoc, tipoDoc } = state.getMyState();
        if (esperaNumeroDoc && ctx.body && !ctx.listResponse) {
            await state.update({ numeroDoc: ctx.body, esperaNumeroDoc: false });
            const citas = await consultarCitasPorDocumento(tipoDoc, ctx.body);
            await state.update({ citas });
            if (!citas || citas.length === 0) {
                await flowDynamic('No se encontraron citas agendadas con ese documento.');
                return;
            }
            let mensaje = 'Estas son tus citas agendadas:\n';
            citas.forEach((cita, idx) => {
                mensaje += `${idx + 1}. Fecha: ${cita.fecha}, Hora: ${cita.hora}, Lugar: ${cita.lugar}\n`;
            });
            mensaje += 'Por favor, escribe el número de la cita que deseas reprogramar:';
            await flowDynamic(mensaje);
            await state.update({ esperaSeleccionCita: true });
        }
    })
    .addAction(async (ctx, { state, flowDynamic }) => {
        const { esperaSeleccionCita, citas } = state.getMyState();
        if (esperaSeleccionCita && ctx.body && !ctx.listResponse) {
            const idx = parseInt(ctx.body) - 1;
            if (citas && citas[idx]) {
                await state.update({ citaSeleccionada: citas[idx], esperaSeleccionCita: false });
                const cita = citas[idx];
                await flowDynamic(`¿Estás seguro de que deseas reprogramar la cita del ${cita.fecha} a las ${cita.hora} en ${cita.lugar}?\nResponde *Sí* o *No*.`);
                await state.update({ esperaConfirmacion: true });
            } else {
                await flowDynamic('No se seleccionó una cita válida.');
            }
        }
    })
    .addAction(async (ctx, { state, flowDynamic }) => {
        const { esperaConfirmacion } = state.getMyState();
        if (esperaConfirmacion && (ctx.body === 'Sí' || ctx.body === 'No')) {
            await state.update({ confirmacion: ctx.body, esperaConfirmacion: false });
            await flowDynamic(`Has seleccionado reprogramar la cita. Confirmación: ${ctx.body}`);
            // Aquí puedes continuar el flujo según la respuesta
        }
    });
