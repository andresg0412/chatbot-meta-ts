import { createFlow } from "@builderbot/bot";
import { welcomeFlow } from './welcomeFlow';
import { menuFlow } from './menuFlow';
import { politicaDatosFlow } from './flujos/principal/politicasDatos';
import { noAceptaPoliticas } from './flujos/principal/noAceptaPoliticas';
import { menuConocerIpsFlow } from './flujos/conocerIps/menuConocerIpsflow';
import {
    step1Reprogramar,
    step2Reprogramar,
    step3Reprogramar,
    step4Reprogramar,
    step5Reprogramar,
    step6Reprogramar,
    step7Reprogramar,
    stepConfirmaReprogramar,
    step8ConfirmaReprogramar,
    step9ConfirmaReprogramar,
    noConfirmaReprogramar,
    seleccionaCitaReprogramar,
    confirmarReprogramarCita,
    revisarPagoConsulta,
    noConfirmaReprogramarCita,
    preguntarConfirmarBotones,
} from './flujos/reprogramarCita';

import { volverMenuPrincipal } from './flujos/common/volverMenuPrincipal';

export default createFlow([
    welcomeFlow,
    politicaDatosFlow,
    noAceptaPoliticas,
    menuFlow,
    menuConocerIpsFlow,
    step1Reprogramar,
    step2Reprogramar,
    step3Reprogramar,
    step4Reprogramar,
    step5Reprogramar,
    step6Reprogramar,
    step7Reprogramar,
    stepConfirmaReprogramar,
    step8ConfirmaReprogramar,
    step9ConfirmaReprogramar,
    noConfirmaReprogramar,
    seleccionaCitaReprogramar,
    confirmarReprogramarCita,
    revisarPagoConsulta,
    noConfirmaReprogramarCita,
    preguntarConfirmarBotones,
    volverMenuPrincipal,
]);