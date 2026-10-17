// Captura pendiente de @builderbot entre sesiones (bug 2026-10-16, celular 3123778400).
//
// @builderbot decide si un mensaje responde a una pregunta (`capture: true`) leyendo el último mensaje
// del bot guardado en `MemoryDB.listHistory` (`getPrevByNumber`). Ese historial nunca se borra: cuando la
// sesión vence por inactividad, `limpiarEstadoConversacion` borra el `state`, pero la pregunta sigue
// "abierta" y se queda con la siguiente respuesta del paciente aunque lleguen días después.
//
// Caso real: el paciente agendó por el bot y no contestó el opt-in de lista de espera. Dos días después
// tocó "Si, deseo ingresar" en la invitación; la captura del opt-in (de hacía 40 h) recibió el botón y
// respondió "no te inscribiremos".
//
// `descartarCapturaPendiente` quita del historial las entradas del número, así el siguiente mensaje se
// enruta como en una conversación nueva (keyword de su botón o bienvenida). Solo se llama en los cierres
// por inactividad que ocurren FUERA del procesamiento de un mensaje (timer de 1 h, limpiezas periódicas):
// ahí nadie está leyendo el historial de ese número. Como efecto secundario, el historial (que hoy crece
// sin límite) deja de acumular las conversaciones cerradas.

/** Lo mínimo de `MemoryDB` de @builderbot que se usa aquí. */
export interface HistorialBot {
    listHistory: Array<{ from?: string } & Record<string, any>>;
}

let historial: HistorialBot | null = null;

/** Registra la base de datos del bot (el `MemoryDB` pasado a createBot). Se llama una vez en app.ts. */
export function registrarHistorialBot(db: HistorialBot | null | undefined): void {
    historial = db && Array.isArray(db.listHistory) ? db : null;
}

/**
 * Borra del historial de @builderbot todas las entradas del número, incluida la pregunta pendiente.
 * Nunca lanza; sin historial registrado (pruebas que no lo registran) no hace nada.
 * @returns cuántas entradas se borraron.
 */
export function descartarCapturaPendiente(telefono: string | null | undefined): number {
    if (!telefono || !historial) return 0;
    try {
        const antes = historial.listHistory.length;
        historial.listHistory = historial.listHistory.filter((entrada) => entrada?.from !== telefono);
        return antes - historial.listHistory.length;
    } catch (error) {
        console.warn('[capturaPendiente] No se pudo descartar la captura pendiente:', (error as any)?.message ?? error);
        return 0;
    }
}
