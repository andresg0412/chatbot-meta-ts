import { addKeyword, EVENTS } from '@builderbot/bot';
import { step8AgendarCita } from '../step8AgendarCita';
import { volverMenuPrincipal } from '../../common/volverMenuPrincipal';

const step6AgendarCitaPrimeraVezPsicologiaAtencion = addKeyword(['psicologia_infantil', 'psicologia_adolescente', 'psicologia_adulto', 'psicologia_adulto_mayor', 'psicologia_pareja_familia'])
    .addAction(async (ctx, { state, gotoFlow }) => {
        const atencionPsicologica = ctx.listResponse ? ctx.listResponse.title : ctx.body;
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
                                    "id": "psicologia_pareja",
                                    "title": "Pareja",
                                    "description": ""
                                },
                                {
                                    "id": "psicologia_familia",
                                    "title": "Familia",
                                    "description": ""
                                }
                            ]
                        }
                    ]
                }
            }
            await provider.sendList(ctx.from, list)
        }
    );

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
                return gotoFlow(step8AgendarCita);
            } else if (ctx.body === 'No') {
                await flowDynamic('Lo siento, para agendar una cita en esta especialidad es necesario que el paciente tenga 16 años o más.');
                return gotoFlow(volverMenuPrincipal);
            }
        }
    );

const step6AgendarCitaPrimeraVezPsiquiatria = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'Recuerde que es necesario contar con una remisión médica y presentarla en el día de tu cita.',
        {
            capture: false,
        },
        async (ctx, { gotoFlow }) => {
            return gotoFlow(step8AgendarCita);
        }
    );

export {
    step6AgendarCitaPrimeraVezPsicologia,
    step6AgendarCitaPrimeraVezNeuropsicologia,
    step6AgendarCitaPrimeraVezPsiquiatria,
    step6AgendarCitaPrimeraVezPsicologiaAtencion,
};