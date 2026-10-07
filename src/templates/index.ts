import { createFlow } from "@builderbot/bot";
import { welcomeFlow, exitFlow } from './welcomeFlow';
import { menuFlow } from './menuFlow';
import { politicaDatosFlow } from './flujos/principal/politicasDatos';
import { noAceptaPoliticas } from './flujos/principal/noAceptaPoliticas';
import { killSwitchFlow } from './flujos/principal/killSwitchFlow';
import { multimediaFlow } from './flujos/multimediaFlow';
import {
    menuConocerIpsFlow,
    serviciosStepConocer,
    conveniosStepConocer,
    tarifasStepConocer,
    formaspagoStepConocer,
    ubicacionStepConocer,
    horariosStepConocer,
    canalesStepConocer,
} from './flujos/conocerIps';
import {
    step1Reprogramar,
    step5Reprogramar,
    step6Reprogramar,
    step7Reprogramar,
    stepConfirmaReprogramar,
    stepSeleccionaFechaReprogramar,
    stepHoraSeleccionada,
    noConfirmaReprogramar,
    //seleccionaCitaReprogramar,
    confirmarReprogramarCita,
    revisarPagoConsulta,
    noConfirmaReprogramarCita,
    preguntarConfirmarBotones,
} from './flujos/reprogramarCita';

import {
    step1CencelarCita,
    step5CancelarCita,
    step6CancelarCita,
    step7CancelarCita,
    stepConfirmaCancelarCita,
    stepOpcionReprogramar,
} from './flujos/cancelarCita';

import {
    datosinicialesComunes,
    datosinicialesComunes2,
    datosinicialesComunes3,
    datosinicialesComunes4,
    datosinicialesComunes5,
    volverMenuPrincipal,
    mesajeSalida,
} from './flujos/common';
import { pasoAgenteFlow } from './flujos/pasoAgente';
import { pqrsFlow } from './flujos/pasoAgente/enviarpqrs';
import {
    ejecutarPlantillaDiariaFlow,
    confirmarCitaFlow,
    confirmarCitaDocumentoFlow,
    confirmarCitaCampahna48Flow,
    confirmarCitaDocumentoCampahna48Flow,
    ejecutarPlantillaRecuperacionFlow,
    ejecutarPlantillaUsuariosConAsistenciaFlow,
    respuestaCampahnaEnOtroMomento,
    respuestaCampahnaFinalizado,
    ejecutarCampahnaRecordatorioFlow,
} from './flujos/campahna';
import {
    step1AgendarCita,
    step2AgendarCita,
    // CONTROL
    step4AgendarCitaControl,
    step5AgendarCitaControl,
    step6AgendarCitaControlDoc,
    step6AgendarCitaControl,
    step7AgendarCitaControl,
    // PRIMERA VEZ
    step4AgendarCitaPrimeraVez,
    step5AgendarCitaPrimeraVezPresencial,
    step5AgendarCitaPrimeraVezVirtual,
    step6AgendarCitaPrimeraVezPsicologia,
    step6AgendarCitaPrimeraVezNeuropsicologia,
    step6AgendarCitaPrimeraVezPsiquiatria,
    step6AgendarCitaPrimeraVezPsicologiaAtencion,
    // PASOS GENERALES
    step8AgendarCita,
    step9AgendarCita,
    step10AgendarCita,
    step11AgendarCita,
    step12AgendarCita,
    step13AgendarCitaConvenio,
    step13AgendarCitaParticular,
    step13AgendarCitaConvenio2,
    step13AgendarCitaAgente,
    step14AgendarCita,
    step14AgendarCita2,
    step15AgendarCita,
    step16AgendarCita,
    step17AgendarCita,
    step17AgendarCita2,
    step17AgendarCita3,
    step17AgendarCita4,
    step17AgendarCita5,
    step17AgendarCita6,
    step17AgendarCita7,
    step18AgendarCita,
    step18AgendarCita2,
    step19AgendarCita,
    step20AgendarCita,
    step21AgendarCita,
    step22AgendarCita,
    step23AgendarCita,
    // LISTA DE ESPERA (Fase 1)
    stepListaEsperaOptIn,
} from './flujos/agendarCita'
import {
    // LISTA DE ESPERA (Fase 2) — respuesta a la cascada de ofertas de cupo
    ofertaCupoAceptaDocumentoFlow,
    ofertaCupoRechazaDocumentoFlow,
    ofertaCupoAccionFlow,
    // LISTA DE ESPERA — retiro voluntario por WhatsApp (runbook B5)
    retiroListaEsperaFlow,
    retiroListaEsperaAccionFlow,
    // LISTA DE ESPERA — respuesta a la invitación de las campañas de regularización/continua
    invitacionAceptaFlow,
    invitacionRechazaFlow,
    invitacionAgenteFlow,
    invitacionDocumentoFlow,
    invitacionSeleccionFlow,
    invitacionRechazoPayloadFlow,
} from './flujos/listaEspera'
import {
    // RECORDATORIOS (Fase 3) — captura de respuesta en recordatorios con botones
    confirmoAsistenciaFlow,
    confirmoAsistenciaAccionFlow,
    necesitoCancelarFlow,
    necesitoCancelarAccionFlow,
    noPodreAsistirFlow,
    noPodreAsistirAccionFlow,
    // TB-05 / TBOT-03: elegir la cita y confirmar antes de cancelar
    seleccionCitaRecordatorioFlow,
    confirmacionCancelarRecordatorioFlow,
    botonesConfirmarCancelacionFlow,
    reprogramarRecordatorioFlow,
    reprogramarRecordatorioAccionFlow,
} from './flujos/recordatorios'
import { isRecordatoriosBotonesEnabled } from '../utils/listaEsperaFlags';

// ORDEN IMPORTANTE (runbook B1, proyecto-ips/docs/features/2026-09-26-lista-espera-runbook-produccion.md):
// @builderbot asigna cada mensaje al PRIMER flujo de esta lista cuya keyword coincida, y las keywords
// sin `{ regex: true }` coinciden por subcadena sin distinguir mayúsculas. Los flujos de botón nuevos
// usan regex ancladas (coincidencia exacta, ver templates/flujos/keywordsBotones.ts) y van al inicio
// para ganarle a los flujos viejos ('Confirmo', 'cancelar', 'salir'...) solo cuando el texto es
// exactamente el del botón. Cualquier otro texto sigue yendo al mismo flujo de antes.
// Cubierto por src/templates/__tests__/keywordRouting.test.ts.
const flujosRegistradosCompletos = [
    killSwitchFlow,
    multimediaFlow,
    // Coincidencia exacta (regex anclada) — deben ir antes de exitFlow y de los flujos viejos.
    retiroListaEsperaFlow,
    confirmoAsistenciaFlow,
    necesitoCancelarFlow,
    noPodreAsistirFlow,
    reprogramarRecordatorioFlow,
    // "Sí, cancelar" / "No, mantener" fuera de su captura: antes de step1CencelarCita ('cancelar').
    botonesConfirmarCancelacionFlow,
    ofertaCupoAceptaDocumentoFlow,
    ofertaCupoRechazaDocumentoFlow,
    // Invitación a la lista de espera ("Si, deseo ingresar" / "No, gracias" / "Hablar con agente"), regex ancladas.
    // proyecto-ips/docs/features/2026-10-04-campanas-invitacion-lista-espera-implementacion.md, 6.6.
    invitacionAceptaFlow,
    invitacionRechazaFlow,
    invitacionAgenteFlow,
    welcomeFlow,
    exitFlow,
    ejecutarPlantillaDiariaFlow,
    ejecutarCampahnaRecordatorioFlow,
    ejecutarPlantillaRecuperacionFlow,
    ejecutarPlantillaUsuariosConAsistenciaFlow,
    respuestaCampahnaEnOtroMomento,
    respuestaCampahnaFinalizado,
    confirmarCitaFlow,
    confirmarCitaDocumentoFlow,
    confirmarCitaCampahna48Flow,
    confirmarCitaDocumentoCampahna48Flow,
    politicaDatosFlow,
    noAceptaPoliticas,
    menuFlow,
    menuConocerIpsFlow,
    serviciosStepConocer,
    conveniosStepConocer,
    tarifasStepConocer,
    formaspagoStepConocer,
    ubicacionStepConocer,
    horariosStepConocer,
    canalesStepConocer,
    step1Reprogramar,
    step1CencelarCita,
    datosinicialesComunes,
    datosinicialesComunes2,
    datosinicialesComunes3,
    datosinicialesComunes4,
    datosinicialesComunes5,
    step1AgendarCita,
    step2AgendarCita,
    // CONTROL
    step4AgendarCitaControl,
    step5AgendarCitaControl,
    step6AgendarCitaControlDoc,
    step6AgendarCitaControl,
    step7AgendarCitaControl,
    // PRIMERA VEZ
    step4AgendarCitaPrimeraVez,
    step5AgendarCitaPrimeraVezPresencial,
    step5AgendarCitaPrimeraVezVirtual,
    step6AgendarCitaPrimeraVezPsicologia,
    step6AgendarCitaPrimeraVezNeuropsicologia,
    step6AgendarCitaPrimeraVezPsiquiatria,
    step6AgendarCitaPrimeraVezPsicologiaAtencion,
    // PASOS GENERALES
    step8AgendarCita,
    step9AgendarCita,
    step10AgendarCita,
    step11AgendarCita,
    step12AgendarCita,
    step13AgendarCitaConvenio,
    step13AgendarCitaParticular,
    step13AgendarCitaConvenio2,
    step13AgendarCitaAgente,
    step14AgendarCita,
    step14AgendarCita2,
    step15AgendarCita,
    step16AgendarCita,
    step17AgendarCita,
    step17AgendarCita2,
    step17AgendarCita3,
    step17AgendarCita4,
    step17AgendarCita5,
    step17AgendarCita6,
    step17AgendarCita7,
    step18AgendarCita,
    step18AgendarCita2,
    step19AgendarCita,
    step20AgendarCita,
    step21AgendarCita,
    step22AgendarCita,
    step23AgendarCita,
    stepListaEsperaOptIn,
    ofertaCupoAccionFlow,
    retiroListaEsperaAccionFlow,
    invitacionDocumentoFlow,
    invitacionSeleccionFlow,
    invitacionRechazoPayloadFlow,
    confirmoAsistenciaAccionFlow,
    reprogramarRecordatorioAccionFlow,
    necesitoCancelarAccionFlow,
    noPodreAsistirAccionFlow,
    seleccionCitaRecordatorioFlow,
    confirmacionCancelarRecordatorioFlow,
    step5Reprogramar,
    step6Reprogramar,
    step7Reprogramar,
    step5CancelarCita,
    step6CancelarCita,
    step7CancelarCita,
    stepOpcionReprogramar,
    stepConfirmaReprogramar,
    stepSeleccionaFechaReprogramar,
    stepHoraSeleccionada,
    noConfirmaReprogramar,
    //seleccionaCitaReprogramar,
    confirmarReprogramarCita,
    revisarPagoConsulta,
    noConfirmaReprogramarCita,
    preguntarConfirmarBotones,
    volverMenuPrincipal,
    mesajeSalida,
    stepConfirmaCancelarCita,
    pasoAgenteFlow,
    pqrsFlow,
];

// TBOT-03 (proyecto-ips/docs/features/2026-10-02-informe-qa-lista-espera.md): los botones de los
// recordatorios ("Confirmo asistencia" / "Necesito cancelar" / "No podré asistir") solo se escuchan con
// RECORDATORIOS_BOTONES_ENABLED=true. Con el flag apagado nadie recibe esas plantillas, y escribir la
// frase a mano cancelaba la cita más próxima sin confirmación; ahora sigue yendo a los flujos de
// siempre (p. ej. "Necesito cancelar" → cancelar cita guiado). Se evalúa al arrancar: cambiar el flag
// exige `pm2 restart bot-meta --update-env`, igual que el resto de interruptores.
export const FLUJOS_BOTONES_RECORDATORIO = [
    reprogramarRecordatorioFlow,
    confirmoAsistenciaFlow,
    necesitoCancelarFlow,
    noPodreAsistirFlow,
    botonesConfirmarCancelacionFlow,
];

export function construirFlujosRegistrados(recordatoriosBotones: boolean = isRecordatoriosBotonesEnabled()) {
    return recordatoriosBotones
        ? flujosRegistradosCompletos
        : flujosRegistradosCompletos.filter((flujo) => !FLUJOS_BOTONES_RECORDATORIO.includes(flujo));
}

export function construirTemplates(recordatoriosBotones?: boolean) {
    return createFlow(construirFlujosRegistrados(recordatoriosBotones));
}

export const flujosRegistrados = construirFlujosRegistrados();

export default createFlow(flujosRegistrados);
