import { createBot, createProvider, createFlow, addKeyword, utils, EVENTS } from '@builderbot/bot';
import { politicaDatosFlow } from './flujos/principal/politicasDatos';
import { checkAndRegisterUserAttempt } from '../utils/userRateLimiter';
import { metricConversationStarted } from '../utils/metrics';
import { updateUserActivity, closeUserSession, isSessionExpired } from '../utils/proactiveSessionManager';
import { hayAgendamientoEnCurso, reiniciarEstadoEnFlujo } from '../utils/estadoConversacion';
import { isNumberValid } from '../constants/killSwichConstants';
import { esBotHabilitado } from '../services/citasService';
import { registrarActividadBot } from '../services/apiService';
import {
    cerrarSesionTraza,
    obtenerSesionTraza,
    trackEvento,
    trackNoEntendido,
    trackPaso,
} from '../utils/trazabilidad';

const welcomeFlow = addKeyword(EVENTS.WELCOME)
    .addAction(async (ctx, ctxFn) => {
        if (!ctx.from) {
            console.warn('⚠️ Mensaje entrante sin remitente (ctx.from indefinido), se ignora:', ctx);
            return ctxFn.endFlow();
        }
        if (!esBotHabilitado()) {
            // Trazabilidad: mensaje rechazado por el kill switch (y cierre de la sesión si había una).
            trackEvento({ tipo_evento: 'control_kill_switch', telefono: ctx.from, resultado: 'desactivado', origen: 'sistema' });
            cerrarSesionTraza(ctx.from, 'kill_switch');
            await ctxFn.flowDynamic(
                'Lo sentimos, el servicio no está disponible en este momento. ' +
                'Por favor intenta más tarde.'
            );
            return ctxFn.endFlow();
        }
        // Trazabilidad: un WELCOME con una sesión activa es un mensaje que no coincidió con ninguna
        // opción del paso en curso (el bot reinicia la conversación). Sin texto (P7).
        const sesionPrevia = obtenerSesionTraza(ctx.from);
        if (sesionPrevia) {
            trackNoEntendido(ctx.from, sesionPrevia.ultimoPaso ?? null, 1, {
                flujo: sesionPrevia.ultimoFlujo,
                contexto: 'welcome',
            });
            if (sesionPrevia.ultimoPaso === 'agendar.s13_convenio' && hayAgendamientoEnCurso(ctxFn.state)) {
                await ctxFn.flowDynamic(
                    'No encontré ese convenio en la lista. Si el tuyo no aparece, elige *Hablar con un agente* ' +
                    'al final de la lista, o vuelve atrás y elige *Particular*.'
                );
                const { step13AgendarCitaConvenio } = await import('./flujos/agendarCita/step13AgendarCita');
                return ctxFn.gotoFlow(step13AgendarCitaConvenio);
            }
        }
        // TBOT-02: una interacción nueva (sin sesión activa) empieza con el state limpio. Sin esto, el
        // paciente, el documento y el convenio de la sesión anterior del mismo celular seguían en memoria
        // y "Particular" agendaba a nombre de esa persona sin pedir el documento. Se evalúa ANTES de
        // updateUserActivity (que abre la sesión nueva). Con una sesión activa no se borra nada aquí (la
        // conversación se reinicia y el step1 de cada flujo limpia sus propias claves).
        if (isSessionExpired(ctx.from)) {
            await reiniciarEstadoEnFlujo(ctxFn.state, ctx.from);
        }
        await registrarActividadBot('chat_inicio', ctx.from);
        metricConversationStarted(ctx.from);
        updateUserActivity(ctx.from, 'welcome');
        trackPaso(ctx.from, 'inicio.bienvenida');
        await ctxFn.state.update({ celular: ctx.from });
        const rate = checkAndRegisterUserAttempt(ctx.from);
        if (!rate.allowed) {
            trackEvento({ tipo_evento: 'control_rate_limit', telefono: ctx.from, resultado: 'bloqueado', origen: 'sistema' });
            closeUserSession(ctx.from, 'rate_limit');
            await ctxFn.flowDynamic(`Has superado el límite de intentos. Intenta nuevamente después de ${(Math.ceil((rate.blockedUntil - Date.now())/60000))} minutos.`);
            return ctxFn.endFlow();
        }
        await ctxFn.flowDynamic(`¡Bienvenido a la IPS Centro de Orientación! 👋 \nSoy *Dianita* 👩🏻‍💻, tu asistente virtual. \nPara comenzar, es importante que aceptes nuestra política de datos personales 📃 la cual puedes encontrar en:\n👉🏼 https://www.centrodeorientacion.com.co/politica-privacidad/`);
        return ctxFn.gotoFlow(politicaDatosFlow);
    })

const exitFlow = addKeyword(['Salir', 'Exit', 'salir', 'exit'])
    .addAction(async (ctx, ctxFn) => {
        if (!ctx.from) {
            console.warn('⚠️ Mensaje entrante sin remitente (ctx.from indefinido), se ignora:', ctx);
            return ctxFn.endFlow();
        }
        trackPaso(ctx.from, 'comun.salida');
        closeUserSession(ctx.from, 'salir');
        await ctxFn.flowDynamic('Gracias por usar nuestro servicio. ¡Hasta luego! 👋');
        return ctxFn.endFlow();
    })


export { welcomeFlow, exitFlow };
