// guardamos la especialidad seleccionada en step4AgendarCitaControl.ts
// mensaje de seleccionar documento y lista con tipos de documentos


// Si seleccionan Psicologia en los botones de especialidades en step5AgendarCitaPrimeraVezPresencial o step5AgendarCitaPrimeraVezVirtual).
// entonces mostrar un mensaje de "Por favor, selecciona para quien requieres la atencion psicologica:"
// Mostrar listado: Infantil, Adolescente, Adulto, Adulto Mayor, Pareja o Familia


// Si seleccionan Neuropsicologia en los botones de especialidades en step5AgendarCitaPrimeraVezPresencial o step5AgendarCitaPrimeraVezVirtual.
// entonces mostrar un mensaje de "El paciente tiene 16 años o más?"
// Mostrar botones: "Si" y "No"



// Si seleccionan Psiquiatria en los botones de especialidades en step5AgendarCitaPrimeraVezPresencial.
// entonces mostrar un mensaje de "Recuerde que es necesario contar con una remisión médica y presentarla en dia de tu cita"


import { addKeyword, EVENTS } from '@builderbot/bot';

const step5AgendarCitaControl = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { provider }) => {
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
                            { id: 'control_tipo_cedula', title: 'Cédula de ciudadanía' },
                            { id: 'control_tipo_extran', title: 'Cédula de extranjería' },
                            { id: 'control_tipo_identi', title: 'Tarjeta de identidad' },
                            { id: 'control_tipo_civil', title: 'Registro civil' },
                            { id: 'control_tipo_pasaporte', title: 'Pasaporte' },
                            { id: 'control_tipo_other', title: 'Otro' },
                        ]
                    }
                ]
            }
        };
        await provider.sendList(ctx.from, list);
    });
    

export { step5AgendarCitaControl };