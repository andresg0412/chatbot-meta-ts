import { addKeyword, EVENTS } from '@builderbot/bot';
import { closeUserSession } from '../../../../utils/proactiveSessionManager';
import { registrarActividadBot, inscribirListaEspera } from '../../../../services/apiService';
import { TEXTO_COMANDO_RETIRO_LISTA_ESPERA } from '../../keywordsBotones';

/**
 * Texto exacto de consentimiento mostrado al paciente — se envía tal cual al backend en
 * `consentimiento_texto` para dejar auditoría de qué aceptó exactamente (Ley 1581/2012).
 * Ver docs/features/2026-09-07-lista-espera-inteligente.md, secciones 3.2-3.4 del spec original:
 * debe quedar explícito que la cita actual queda firme y que esto es opcional/adicional.
 */
export const TEXTO_CONSENTIMIENTO_LISTA_ESPERA =
    'Tu cita ya quedó agendada y confirmada ✅. Esto es un servicio adicional y totalmente opcional: ' +
    'si se libera un cupo antes con el mismo profesional, ¿quieres que te avisemos por este medio para ' +
    'ofrecerte adelantar tu cita? Aceptes o no, tu cita actual se mantiene exactamente igual. ' +
    `En cualquier momento puedes escribir *"${TEXTO_COMANDO_RETIRO_LISTA_ESPERA}"* para dejar de recibir estos avisos.`;
// Runbook B5: antes decía *"Salir"*, pero "Salir" solo cierra la conversación (no retira). El comando
// "Retirar lista de espera" lo atiende templates/flujos/listaEspera/retiroListaEsperaFlow.ts. Este
// texto se guarda como auditoría en lista_espera.consentimiento_texto.

const stepListaEsperaOptIn = addKeyword(EVENTS.ACTION)
    .addAnswer(
        TEXTO_CONSENTIMIENTO_LISTA_ESPERA,
        {
            capture: true,
            buttons: [
                { body: 'Sí, avísame' },
                { body: 'No, gracias' },
            ],
        },
        async (ctx, { state, flowDynamic, endFlow }) => {
            if (ctx.body === 'Salir' || ctx.body === 'salir') {
                closeUserSession(ctx.from);
                await flowDynamic('Listo, no te inscribimos en la lista de espera. Tu cita agendada sigue firme. ¡Gracias por confiar en nosotros! 😊');
                return endFlow();
            }

            if (ctx.body !== 'Sí, avísame') {
                closeUserSession(ctx.from);
                await registrarActividadBot('chat_flujo_lista_espera', ctx.from, { step: 'rechazada' });
                await flowDynamic('Entendido, no te inscribiremos en la lista de espera. ¡Gracias por confiar en nosotros! 😊');
                return endFlow();
            }

            const pacienteId = state.getMyState().pacienteId;
            const nuevaCita = state.getMyState().citaSeleccionadaHora;
            const especialidadCita = state.getMyState().especialidadAgendarCita;

            if (!pacienteId || !nuevaCita?.profesionalId || !nuevaCita?.fechacita || !nuevaCita?.horacita) {
                closeUserSession(ctx.from);
                await flowDynamic('No pudimos inscribirte en la lista de espera en este momento, pero tu cita agendada sigue firme. 😊');
                return endFlow();
            }

            const inscripcion = await inscribirListaEspera({
                paciente_id: pacienteId,
                profesional_id: nuevaCita.profesionalId,
                fecha_cita: nuevaCita.fechacita,
                hora_cita: nuevaCita.horacita,
                especialidad: especialidadCita,
                consentimiento_texto: TEXTO_CONSENTIMIENTO_LISTA_ESPERA,
            });

            await registrarActividadBot('chat_flujo_lista_espera', ctx.from, {
                step: 'inscripcion',
                resultado: inscripcion ? 'ok' : 'error',
                lista_espera_id: inscripcion?.lista_espera_id ?? null
            });

            if (!inscripcion || !inscripcion.lista_espera_id) {
                closeUserSession(ctx.from);
                await flowDynamic('No pudimos inscribirte en la lista de espera en este momento, pero tu cita agendada sigue firme. 😊');
                return endFlow();
            }

            // Decisión de German (2026-09-08): NO se pregunta día/horario preferido al inscribirse.
            // Solo se registra. Cuando haya un cupo disponible (Fase 2), se le preguntará directo,
            // sin filtrar por ninguna disponibilidad declarada de antemano. Ver
            // docs/features/2026-09-07-lista-espera-inteligente.md, override explícito de la
            // sección 3.4 del spec original.
            closeUserSession(ctx.from);
            await flowDynamic(`¡Listo! Quedaste inscrito en la lista de espera. Si se libera un cupo antes con tu profesional te vamos a escribir por este mismo medio para ofrecértelo. Te esperamos en tu cita agendada. 😊\n\nSi en algún momento ya no quieres recibir estos avisos, escribe *"${TEXTO_COMANDO_RETIRO_LISTA_ESPERA}"*.`);
            return endFlow();
        }
    );

export { stepListaEsperaOptIn };
