// Tipos del contrato de la cascada de ofertas de cupo (Fase 2 de "lista de espera inteligente").
// Ver proyecto-ips/docs/features/2026-09-07-lista-espera-inteligente.md, sección 13.6 (contrato
// definitivo de POST /api/chatbot/listaespera/cascada/tick y endpoints relacionados).

export interface AccionOfertar {
    tipo: 'ofertar';
    cupo_liberado_id: string;
    lista_espera_id: string;
    paciente_id: string;
    nombre_paciente: string;
    telefono_paciente: string | null; // el backend puede enviar 57XXXXXXXXXX, 10 dígitos, o null si no es contactable
    especialidad: string | null;
    profesional: string;
    fecha_cita: string;
    hora_cita: string;
    nivel_cascada_origen: number;
    // Ventana para responder, variable según la antelación del cupo (Ajuste 1,
    // docs/features/2026-09-28-ajustes-lista-espera.md): 900, 600 o 420 por defecto (configurable en el
    // backend). El bot pone Math.round(valor/60) en {{5}} de la plantilla y hace eco del valor en
    // segundos a confirmar-envio. Si no es un entero > 0, el bot no envía y marca fallo 'ventana_invalida'.
    ventana_respuesta_segundos: number;
}

export interface AccionEscalar {
    tipo: 'escalar';
    cupo_liberado_id: string;
    profesional: string;
    fecha_cita: string;
    hora_cita: string;
    // Valores posibles: 'antelacion_critica' (faltan 2h o menos; al abrir la cascada o a mitad de ella,
    // puede llegar con candidatos_contactados 0), 'fuera_de_horario_antelacion_critica' (cupo detectado
    // fuera del horario de contacto que al abrir tendría 2h o menos; se escala de inmediato, incluso de
    // madrugada), 'fila_agotada', 'sin_candidatos', 'cascada_maxima'. Se deja como string: un motivo
    // desconocido se muestra con su código tal cual en el aviso a recepción.
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
    telefono_paciente: string | null; // el backend puede enviar 57XXXXXXXXXX, 10 dígitos, o null si no es contactable
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
