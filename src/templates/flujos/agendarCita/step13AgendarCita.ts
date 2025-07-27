import { addKeyword, EVENTS } from '@builderbot/bot';
import { step14AgendarCita } from './step14AgendarCita';
import { step17AgendarCita } from './step17AgendarCita';
import { step18AgendarCita } from './step18AgendarCita';
import { CONVENIOS_SERVICIOS, ID_CONVENIOS_SERVICIOS } from '../../../constants/conveniosConstants';
//import { obtenerConvenios } from '../../../services/apiService';

const step13AgendarCitaParticular = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { provider, state, gotoFlow }) => {
        const tipoDocumento = state.getMyState().tipoDoc;
        const numeroDocumento = state.getMyState().numeroDocumentoPaciente;
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
    .addAction(async (ctx, { provider, state, gotoFlow, flowDynamic }) => {
        const convenioSeleccionado = ctx.listResponse ? ctx.listResponse.title : ctx.body;
        // Obtener el nombre del servicio del convenio seleccionado
        const nombreConvenio = CONVENIOS_SERVICIOS[convenioSeleccionado];
        const idConvenio = ID_CONVENIOS_SERVICIOS[convenioSeleccionado];
        if (!nombreConvenio) {
            await flowDynamic('El convenio no es válido. Por favor, selecciona un convenio válido.');
            return gotoFlow(step13AgendarCitaConvenio);
        }
        //const especialidad = await state.getMyState().especialidadAgendarCita;
        //const inforConvenio = await obtenerConvenios(especialidad, nombreConvenio);
        /**if(!inforConvenio) {
            await flowDynamic('No se encontraron convenios para esta especialidad. Por favor, selecciona un convenio válido.');
            return gotoFlow(step13AgendarCitaConvenio);
        }*/
        await state.update({ 
            convenioSeleccionado,
            nombreServicioConvenio: nombreConvenio,
            idConvenio,
        });
        
        const tipoDocumento = state.getMyState().tipoDoc;
        const numeroDocumento = state.getMyState().numeroDocumentoAgendarCitaControl;
        if (!tipoDocumento || !numeroDocumento) {
            return gotoFlow(step14AgendarCita);
        } else {
            const pacienteId = state.getMyState().pacienteId;
            if (!pacienteId) {
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
                            { id: 'conv_poliza_sura', title: 'Poliza Sura' },
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