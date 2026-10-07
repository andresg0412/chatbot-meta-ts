import type { PasoId } from '../constants/pasosTrazabilidad';
import { closeUserSession } from './proactiveSessionManager';
import { trackFin } from './trazabilidad';
import { isWorkingHours } from './verificarHorario';

type MotivoDerivacion =
    | 'sin_fechas'
    | 'sin_horas'
    | 'sin_profesional'
    | 'catalogo_solo_asesor'
    | 'error_repetido';

export async function derivarAAsesorSinOpciones(
    ctx: { from: string },
    flowDynamic: (mensaje: string) => Promise<any>,
    opciones: { flujo: 'reprogramar' | 'agendar'; paso: PasoId; motivo: MotivoDerivacion }
): Promise<void> {
    const enHorario = isWorkingHours();
    if (enHorario) {
        const numero = process.env.NUMERO_ASESOR_HUMANO || '573158070460';
        const enlace = `\n\ud83d\udc49 https://wa.me/${numero}?text=Hola,%20deseo%20hablar%20con%20una%20asistente.`;
        if (opciones.motivo === 'catalogo_solo_asesor') {
            await flowDynamic(`Para mover esta cita, un asesor te ayudará directamente:${enlace}`);
        } else {
            const accion = opciones.flujo === 'reprogramar' ? 'hacer este cambio' : 'continuar';
            await flowDynamic(`No encontramos horarios disponibles para ${accion} por aquí. Un asesor te ayudará:${enlace}`);
        }
    } else {
        await flowDynamic(
            'Lo sentimos, en estos momentos nuestros agentes no están disponibles. Nuestros horarios de atención ' +
            'son de lunes a viernes de 7 am a 7 pm y sábados de 7 am a 1 pm. \ud83d\udcc5\u23f0\n' +
            'Escríbenos en ese horario y te ayudaremos a mover tu cita.'
        );
    }
    trackFin(ctx.from, opciones.flujo, enHorario ? 'derivado_agente' : 'fuera_horario', {
        paso: opciones.paso,
        metadata: { motivo: opciones.motivo },
    });
    closeUserSession(ctx.from, 'completado');
}
