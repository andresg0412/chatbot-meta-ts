// Si seleccionan Psicologia en los botones de especialidades en step5AgendarCitaPrimeraVezPresencial o step5AgendarCitaPrimeraVezVirtual).
// entonces mostrar un mensaje de "Por favor, selecciona para quien requieres la atencion psicologica:"
// Mostrar listado: Infantil, Adolescente, Adulto, Adulto Mayor, Pareja o Familia


// Si seleccionan Neuropsicologia en los botones de especialidades en step5AgendarCitaPrimeraVezPresencial o step5AgendarCitaPrimeraVezVirtual.
// entonces mostrar un mensaje de "El paciente tiene 16 años o más?"
// Mostrar botones: "Si" y "No"



// Si seleccionan Psiquiatria en los botones de especialidades en step5AgendarCitaPrimeraVezPresencial.
// entonces mostrar un mensaje de "Recuerde que es necesario contar con una remisión médica y presentarla en dia de tu cita"


import { addKeyword, EVENTS } from '@builderbot/bot';
import { step8AgendarCita } from '../step8AgendarCita';

const step6AgendarCitaPrimeraVezPsicologiaAtencion = addKeyword(['psicologia_infantil', 'psicologia_adolescente', 'psicologia_adulto', 'psicologia_adulto_mayor', 'psicologia_pareja_familia'])
    .addAction(async (ctx, { state, gotoFlow }) => {
        // Guardamos la atención psicológica seleccionada
        const atencionPsicologica = ctx.listResponse ? ctx.listResponse.title : ctx.body;
        console.log('Atención psicológica seleccionada:', atencionPsicologica);
        await state.update({ atencionPsicologica: atencionPsicologica });
        return gotoFlow(step8AgendarCita);
    });

const step6AgendarCitaPrimeraVezPsicologia = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'Por favor, selecciona para quien requieres la atención psicológica:',
        {
            capture: false,
        },
        async (ctx, { provider }) => {
            const list = {
                "header": {
                    "type": "text",
                    "text": "Tipo de atención"
                },
                "body": {
                    "text": "Selecciona la acción que deseas realizar"
                },
                "footer": {
                    "text": ""
                },
                "action": {
                    "button": "Seleccionar",
                    "sections": [
                        {
                            "title": "Tipos",
                            "rows": [
                                {
                                    "id": "psicologia_infantil",
                                    "title": "Infantil",
                                    "description": ""
                                },
                                {
                                    "id": "psicologia_adolescente",
                                    "title": "Adolescente",
                                    "description": ""
                                },
                                {
                                    "id": "psicologia_adulto",
                                    "title": "Adulto",
                                    "description": ""
                                },
                                {
                                    "id": "psicologia_adulto_mayor",
                                    "title": "Adulto Mayor",
                                    "description": ""
                                },
                                {
                                    "id": "psicologia_pareja_familia",
                                    "title": "Pareja o familia",
                                    "description": ""
                                },
                            ]
                        }
                    ]
                }
            }
            await provider.sendList(ctx.from, list)
        }
    );
    //necesitamos otro step donde captura la seleccion de la lista, guarda y pasa al otro step

const step6AgendarCitaPrimeraVezNeuropsicologia = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'El paciente tiene 16 años o más?',
        {
            capture: true,
            buttons: [
                { body: 'Si' },
                { body: 'No' },
            ],
        },
        async (ctx, { state, gotoFlow, flowDynamic, endFlow }) => {
            await state.update({ edadPacienteNeuropsicologia: ctx.body });
            if (ctx.body === 'Si') {
                //pasa al step de citas
                return gotoFlow(step8AgendarCita);
            } else if (ctx.body === 'No') {
                await flowDynamic('Lo siento, para agendar una cita en esta especialidad es necesario que el paciente tenga 16 años o más.');
                return endFlow();
            }
        }
    );

const step6AgendarCitaPrimeraVezPsiquiatria = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'Recuerde que es necesario contar con una remisión médica y presentarla en el día de tu cita.',
        {
            capture: false,
        },
        null,
        [step8AgendarCita]
        
    );

export {
    step6AgendarCitaPrimeraVezPsicologia,
    step6AgendarCitaPrimeraVezNeuropsicologia,
    step6AgendarCitaPrimeraVezPsiquiatria,
    step6AgendarCitaPrimeraVezPsicologiaAtencion,
};