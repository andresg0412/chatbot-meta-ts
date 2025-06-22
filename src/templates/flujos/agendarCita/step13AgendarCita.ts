import { addKeyword, EVENTS } from '@builderbot/bot';
import { step14AgendarCita } from './step14AgendarCita';
import { step17AgendarCita } from './step17AgendarCita';
import { step18AgendarCita } from './step18AgendarCita';

const step13AgendarCitaParticular = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { provider, state, gotoFlow }) => {
        const tipoDocumento = state.getMyState().tipoDoc;
        const numeroDocumento = state.getMyState().numeroDocumentoAgendarCitaControl;
        if (!tipoDocumento || !numeroDocumento) {
            return gotoFlow(step14AgendarCita);
        } else {
            // si ya tenemos tipo documento y documento
            // entonces validar que usuario exista ya en el estado
            //y si es asi entonces pasar al step de confirmar cita
            const pacienteId = state.getMyState().pacienteId;
            if (!pacienteId) {
                // si no existe pacienteId, entonces enviarlo a step formulario
                return gotoFlow(step17AgendarCita);
            }
            return gotoFlow(step18AgendarCita);
        }
    });


const step13AgendarCitaConvenio2 = addKeyword(['conv_poliza_sura', 'conv_poliza_allianz', 'conv_poliza_axa_colpatria', 'conv_poliza_seguros_bolivar', 'conv_coomeva_mp', 'conv_axa_colpatria_mp', 'conv_medplus_mp', 'conv_colmedica_mp'])
    .addAction(async (ctx, { provider, state, gotoFlow }) => {
        const convenioSeleccionado = ctx.listResponse ? ctx.listResponse.title : ctx.body;
        await state.update({ convenioSeleccionado });
        const tipoDocumento = state.getMyState().tipoDoc;
        const numeroDocumento = state.getMyState().numeroDocumentoAgendarCitaControl;
        if (!tipoDocumento || !numeroDocumento) {
            return gotoFlow(step14AgendarCita);
        } else {
            // si ya tenemos tipo documento y documento
            // entonces validar que usuario exista ya en el estado
            //y si es asi entonces pasar al step de confirmar cita
            const pacienteId = state.getMyState().pacienteId;
            if (!pacienteId) {
                // si no existe pacienteId, entonces enviarlo a step formulario
                return gotoFlow(step17AgendarCita);
            }
            return gotoFlow(step18AgendarCita);
        }
    });

const step13AgendarCitaConvenio = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { provider }) => {
        const list = {
            header: { type: 'text', text: 'Convenios' },
            body: { text: 'Selecciona por favor tu convenio' },
            footer: { text: '' },
            action: {
                button: 'Seleccionar',
                sections: [
                    {
                        title: 'Conevios disponibles',
                        rows: [
                            { id: 'conv_poliza_sura', title: 'Poliza sura' },
                            { id: 'conv_poliza_allianz', title: 'Poliza Allianz' },
                            { id: 'conv_poliza_axa_colpatria', title: 'Poliza Axa Copatria' },
                            { id: 'conv_poliza_seguros_bolivar', title: 'Poliza Seguros Bolivar' },
                            { id: 'conv_coomeva_mp', title: 'Coomeva MP' },
                            { id: 'conv_axa_colpatria_mp', title: 'Axa Colpatria MP' },
                            { id: 'conv_medplus_mp', title: 'Medplus MP' },
                            { id: 'conv_colmedica_mp', title: 'Colmedica MP' },
                            { id: 'hablar_con_agente', title: 'Hablar con un agente' },
                        ]
                    }
                ]
            }
        };
        await provider.sendList(ctx.from, list);
    });

export {
    step13AgendarCitaConvenio,
    step13AgendarCitaParticular,
    step13AgendarCitaConvenio2,
};