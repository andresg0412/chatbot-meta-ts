import { createFlow } from "@builderbot/bot";
import { welcomeFlow } from './welcomeFlow';
import { menuFlow } from './menuFlow';
import { politicaDatosFlow } from './flujos/principal/politicasDatos';
import { noAceptaPoliticas } from './flujos/principal/noAceptaPoliticas';
import { menuConocerIpsFlow } from './flujos/conocerIps/menuConocerIpsflow';
import {
    step1Reprogramar,
    step5Reprogramar,
    step6Reprogramar,
    step7Reprogramar,
    stepConfirmaReprogramar,
    stepSeleccionaFechaReprogramar,
    stepHoraSeleccionada,
    noConfirmaReprogramar,
    seleccionaCitaReprogramar,
    confirmarReprogramarCita,
    revisarPagoConsulta,
    noConfirmaReprogramarCita,
    preguntarConfirmarBotones,
} from './flujos/reprogramarCita';

import { volverMenuPrincipal } from './flujos/common/volverMenuPrincipal';

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
} from './flujos/common';
import { pasoAgenteFlow } from './flujos/pasoAgente';
import { ejecutarPlantillaDiariaFlow, confirmarCitaFlow } from './flujos/campahna';

export default createFlow([
    welcomeFlow,
    politicaDatosFlow,
    noAceptaPoliticas,
    menuFlow,
    menuConocerIpsFlow,
    step1Reprogramar,
    step1CencelarCita,
    datosinicialesComunes,
    datosinicialesComunes2,
    datosinicialesComunes3,
    datosinicialesComunes4,
    datosinicialesComunes5,
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
    seleccionaCitaReprogramar,
    confirmarReprogramarCita,
    revisarPagoConsulta,
    noConfirmaReprogramarCita,
    preguntarConfirmarBotones,
    volverMenuPrincipal,
    stepConfirmaCancelarCita,
    pasoAgenteFlow,
    ejecutarPlantillaDiariaFlow,
    confirmarCitaFlow,
]);