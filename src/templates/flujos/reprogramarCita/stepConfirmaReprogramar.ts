import { addKeyword, EVENTS } from '@builderbot/bot';

const step8ConfirmaReprogramar = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic }) => {
        const citasDisponibles = state.getMyState().citasDisponiblesReprogramar;
        if (!citasDisponibles || citasDisponibles.length === 0) {
            await flowDynamic('No hay citas disponibles para reprogramar.');
            return;
        }
        let mensaje = '';
        citasDisponibles.forEach((cita, idx) => {
            mensaje += `${idx + 1}. Fecha: ${cita.fecha}, Hora: ${cita.hora}, Lugar: ${cita.lugar}\n`;
        });
        mensaje += '0. Ver más';
        await flowDynamic(mensaje);
        await state.update({ esperaSeleccionCita: true });
        return;
    });

const stepConfirmaReprogramar = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'A continuación le mostrare las fechas disponibles para reprogramar su cita:',
        {
            capture: false,
        },
        async (ctx, { state, gotoFlow }) => {
            //Primera vez o control ? se pregunta o se obtiene de la API ?
            const tipoCita = 'primera vez'; // Aquí deberías obtener el tipo de cita del estado o de la API
            if (tipoCita === 'primera vez') {
                // consultar citas disponibles de la API
                const citasDisponiblesReprogramar = [
                    { id: '1', fecha: '2025-06-20', hora: '10:00 AM', lugar: 'Sede Norte' },
                    { id: '2', fecha: '2025-06-22', hora: '2:00 PM', lugar: 'Sede Centro' },
                ];
                await state.update({ citasDisponiblesReprogramar });
            } else if (tipoCita === 'control') {
                // consultar citas disponibles de la API
                const citasDisponiblesReprogramar = [
                    { id: '1', fecha: '2025-06-25', hora: '11:00 AM', lugar: 'Sede Sur' },
                    { id: '2', fecha: '2025-06-27', hora: '3:00 PM', lugar: 'Sede Este' },
                ];
                await state.update({ citasDisponiblesReprogramar });
            }
            return gotoFlow(step8ConfirmaReprogramar);
        }

    );


export { stepConfirmaReprogramar };