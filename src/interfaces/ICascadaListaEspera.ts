// Tipos del contrato de la cascada de ofertas de cupo (Fase 2 de "lista de espera inteligente").
// Ver proyecto-ips/docs/features/2026-09-07-lista-espera-inteligente.md, sección 13.6 (contrato
// definitivo de POST /api/chatbot/listaespera/cascada/tick y endpoints relacionados).

export interface AccionOfertar {
    tipo: 'ofertar';
    cupo_liberado_id: string;
    lista_espera_id: string;
    paciente_id: string;
    nombre_paciente: string;
    telefono_paciente: string;
    especialidad: string | null;
    profesional: string;
    fecha_cita: string;
    hora_cita: string;
    nivel_cascada_origen: number;
    ventana_respuesta_segundos: number;
}

export interface AccionEscalar {
    tipo: 'escalar';
    cupo_liberado_id: string;
    profesional: string;
    fecha_cita: string;
    hora_cita: string;
    motivo: string;
    candidatos_contactados: number;
    resumen_respuestas: {
        aceptaron: number;
        rechazaron: number;
        sin_respuesta: number;
    };
}

export interface AccionNotificarPausa {
    tipo: 'notificar_pausa';
    lista_espera_id: string;
    paciente_id: string;
    nombre_paciente: string;
    telefono_paciente: string;
}

export type AccionCascada = AccionOfertar | AccionEscalar | AccionNotificarPausa;

/**
 * Respuesta de `POST /chatbot/listaespera/cascada/respuesta` cuando `respuesta==='acepta'` y el
 * movimiento de cita se ejecutó correctamente.
 */
export interface MovimientoCascadaAceptado {
    movimiento: 'ok';
    nueva_fecha_cita: string;
    nueva_hora_cita: string;
    profesional: string;
}

/**
 * Respuesta de `POST /chatbot/listaespera/cascada/respuesta` cuando `respuesta==='rechaza'`.
 */
export interface RespuestaCascadaRechazada {
    registrado: true;
}
