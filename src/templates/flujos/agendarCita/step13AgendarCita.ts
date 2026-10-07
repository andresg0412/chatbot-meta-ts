import { addKeyword, EVENTS } from '@builderbot/bot';
import { step14AgendarCita } from './step14AgendarCita';
import { step17AgendarCita } from './step17AgendarCita';
import { step18AgendarCita } from './step18AgendarCita';
import { CONVENIOS_SERVICIOS, ID_CONVENIOS_SERVICIOS } from '../../../constants/conveniosConstants';
//import { obtenerConvenios } from '../../../services/apiService';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { hayAgendamientoEnCurso, MENSAJE_CONVERSACION_TERMINADA } from '../../../utils/estadoConversacion';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion } from '../../../utils/trazabilidad';
import { pasoAgenteFlow } from '../pasoAgente';
import { OPCIONES_REGEX } from '../keywordsBotones';

const step13AgendarCitaParticular = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { provider, state, gotoFlow }) => {
        const tipoDocumento = state.getMyState().tipoDoc;
        const numeroDocumento = state.getMyState().numeroDocumentoPaciente;
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


const step13AgendarCitaConvenio2 = addKeyword(['conv_poliza_sura', 'conv_poliza_allianz', 'conv_poliza_axa_colpatria', 'conv_poliza_seguros_bolivar', 'conv_coomeva_mp', 'conv_axa_colpatria_mp', 'conv_medplus_mp', 'conv_colmedica_mp'])
    .addAction(async (ctx, { provider, state, gotoFlow, flowDynamic, endFlow }) => {
        // TBOT-02: entrada por keyword (lista/botón). Si no hay un agendamiento en curso (conversación
        // cerrada y state limpio), no se continúa sin contexto.
        if (!hayAgendamientoEnCurso(state)) {
            return endFlow(MENSAJE_CONVERSACION_TERMINADA);
        }
        const convenioSeleccionado = ctx.listResponse ? ctx.listResponse.title : ctx.body;
        // Obtener el nombre del servicio del convenio seleccionado
        const nombreConvenio = CONVENIOS_SERVICIOS[convenioSeleccionado];
        const idConvenio = ID_CONVENIOS_SERVICIOS[convenioSeleccionado];
        if (!nombreConvenio) {
            trackNoEntendido(ctx.from, 'agendar.s13_convenio');
            await flowDynamic('El convenio no es válido. Por favor, selecciona un convenio válido.');
            return gotoFlow(step13AgendarCitaConvenio);
        }
        //const especialidad = await state.getMyState().especialidadAgendarCita;
        //const inforConvenio = await obtenerConvenios(especialidad, nombreConvenio);
        /**if(!inforConvenio) {
            await flowDynamic('No se encontraron convenios para esta especialidad. Por favor, selecciona un convenio válido.');
            return gotoFlow(step13AgendarCitaConvenio);
        }*/
        trackPaso(ctx.from, 'agendar.s13_convenio', 'ok');
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

const step13AgendarCitaAgente = addKeyword('/^\\s*hablar_con_agente\\s*$/', OPCIONES_REGEX)
    .addAction(async (ctx, { state, endFlow, gotoFlow }) => {
        if (!hayAgendamientoEnCurso(state)) return endFlow(MENSAJE_CONVERSACION_TERMINADA);
        trackPaso(ctx.from, 'agendar.s13_convenio', 'ok', { metadata: { opcion: 'hablar_con_agente' } });
        return gotoFlow(pasoAgenteFlow);
    });

const step13AgendarCitaConvenio = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow, { paso: 'agendar.s13_convenio' });
        if (!sessionValid) {
            return endFlow();
        }
    })
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
        trackPaso(ctx.from, 'agendar.s13_convenio', 'mostrado');
    });

export {
    step13AgendarCitaConvenio,
    step13AgendarCitaParticular,
    step13AgendarCitaConvenio2,
    step13AgendarCitaAgente,
};
