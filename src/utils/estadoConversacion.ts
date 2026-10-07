// Limpieza del `state` de @builderbot entre sesiones (TBOT-02 / C6 del informe QA,
// proyecto-ips/docs/features/2026-10-02-informe-qa-lista-espera.md).
//
// El `state` de @builderbot vive en memoria por número (`CoreClass.stateHandler`, un `SingleState`) y el
// framework nunca lo borra. Antes de este módulo, una sesión nueva desde el mismo celular heredaba el
// paciente, el documento y el convenio de la anterior: al tocar "Particular" se agendaba a nombre de otra
// persona sin pedir el documento (caso real: un padre agenda para su hijo desde el mismo número).
//
// Mecanismo (dos capas):
// 1. Fronteras de sesión → borrado COMPLETO del state y se restaura solo `celular`. Se usa borrado
//    completo (no una lista de claves) porque cualquier clave nueva que se agregue en el futuro queda
//    cubierta sin acordarse de registrarla aquí; la única clave que se necesita entre sesiones es
//    `celular` (la usa utils/datosPacienteNuevo.ts como teléfono de contacto). Se aplica:
//      - al cerrar la sesión (closeUserSession, timeout, "Salir", fin de flujo, crisis, rate limit…), desde
//        utils/proactiveSessionManager.ts → `limpiarEstadoConversacion` (fuera de un flujo: necesita el
//        almacén registrado en app.ts con `registrarAlmacenEstado`);
//      - al empezar una interacción nueva (EVENTS.WELCOME sin sesión activa), desde welcomeFlow.ts →
//        `reiniciarEstadoEnFlujo` (dentro del flujo: usa el `state` del propio mensaje).
//    Se restaura `celular` (no se deja el state vacío) porque muchos pasos leen `state.getMyState().x`
//    sin `?.`: con la entrada borrada del Map, `getMyState()` devolvería `undefined` y lanzarían.
// 2. Defensa en profundidad → al entrar al step1 de agendar, cancelar y reprogramar se borran solo las
//    claves de esos flujos (`CLAVES_FLUJOS_CITA`). Aquí no se borra todo: dentro de una sesión activa hay
//    marcas de trazabilidad (`traza*`) y de otros flujos que deben sobrevivir.
//
// Nada de esto toca la sesión de trazabilidad (`sesionId` vive en proactiveSessionManager, no en el
// state), el kill switch, el protocolo de crisis ni el rate limit.

/** Lo mínimo del `SingleState` de @builderbot que se usa aquí (CoreClass.stateHandler). */
export interface AlmacenEstadoBot {
    getMyState: (from: string) => () => Record<string, any> | undefined;
    clear: (from: string) => () => boolean;
    updateState: (ctx?: { from: string }) => (keyValue: Record<string, any>) => Promise<void>;
}

/** El `state` que @builderbot entrega a cada callback de flujo. */
export interface EstadoFlujo {
    getMyState: () => Record<string, any> | undefined;
    update: (keyValue: Record<string, any>) => Promise<void>;
    clear: () => void;
}

/** Claves que sobreviven a un reinicio completo del state (todas se recalculan desde el número). */
export const CLAVES_CONSERVADAS_ENTRE_SESIONES = ['celular'] as const;

/**
 * Claves de negocio de agendar, cancelar y reprogramar. Se borran al entrar al step1 de cualquiera de los
 * tres (comparten claves: reprogramar escribe `profesionalId`, `especialidadAgendarCita`,
 * `tipoConsultaPaciente`, `citaSeleccionadaHora`…, que agendar lee después). No incluye `celular` ni las
 * marcas `traza*`/de campañas, recordatorios y lista de espera (esos flujos piden su propio documento).
 */
export const CLAVES_FLUJOS_CITA: readonly string[] = [
    // Selección del flujo y de la cita (agendar)
    'tipoCitaAgendarCita',
    'tipoConsultaPaciente',
    'especialidadAgendarCita',
    'especialidad',
    'atencionPsicologica',
    'edadPacientePsiquiatria',
    'tipoUsuarioAtencion',
    'profesionalId',
    'profesionalNombre',
    'fechasOrdenadas',
    'pasoSeleccionFecha',
    'fechaSeleccionadaAgendar',
    'citasFechaSeleccionada',
    'pasoSeleccionHora',
    'citaSeleccionadaHora',
    // Convenio
    'convenioSeleccionado',
    'nombreServicioConvenio',
    'idConvenio',
    // Identidad del paciente
    'tipoDoc',
    'tipoDocumentoCodigo',
    'numeroDocumentoPaciente',
    'numeroDocumentoAgendarCitaControl',
    'numeroDoc',
    'pacienteId',
    'nombreCompleto',
    'pacienteNombre',
    'numeroContactoPaciente',
    'emailPaciente',
    'fechaNacimientoPaciente',
    'edadPaciente',
    // Formulario de paciente nuevo (step17)
    'nombrePaciente1',
    'nombrePaciente2',
    'apellidoPaciente1',
    'apellidoPaciente2',
    'reintentoPrimerNombre',
    'fechaNacimiento',
    'correoElectronico',
    // Marcas de espera de captura
    'esperaTipoDoc',
    'esperaNumeroDoc',
    'esperaNombrePaciente',
    'esperaFechaNacimiento',
    'esperaCorreoElectronico',
    'esperaSeleccionCita',
    // Cancelar / reprogramar
    'flujoSeleccionadoMenu',
    'citasProgramadas',
    'numeroCita',
    'citaSeleccionadaCancelar',
    'citaSeleccionadaProgramada',
    'citaSeleccionada',
    'citaReprogramada',
    'citas',
    'reprogramarDiasSinHoras',
    'reprogramarErroresSeguidos',
    'agendarDiasSinHoras',
    'agendarErroresSeguidos',
];

let almacen: AlmacenEstadoBot | null = null;

/** Registra el almacén de state del bot (`bot.stateHandler`). Se llama una vez en app.ts tras createBot. */
export function registrarAlmacenEstado(nuevo: AlmacenEstadoBot | null | undefined): void {
    almacen = nuevo ?? null;
}

function estadoMinimo(telefono: string): Record<string, any> {
    return { celular: telefono };
}

/**
 * Borra todo el state del número y deja solo `celular`. Se usa fuera de un flujo (cierre de sesión por
 * timer, cierre explícito). Síncrono: `updateState` escribe en el Map dentro del ejecutor de la promesa.
 * Nunca lanza; sin almacén registrado (pruebas que no lo registran) no hace nada.
 */
export function limpiarEstadoConversacion(telefono: string | null | undefined): void {
    if (!telefono || !almacen) return;
    try {
        almacen.clear(telefono)();
        void almacen.updateState({ from: telefono })(estadoMinimo(telefono));
    } catch (error) {
        console.warn('[estadoConversacion] No se pudo limpiar el estado:', (error as any)?.message ?? error);
    }
}

/** Igual que `limpiarEstadoConversacion`, pero con el `state` de un callback de flujo. */
export async function reiniciarEstadoEnFlujo(state: EstadoFlujo, telefono: string): Promise<void> {
    try {
        state.clear();
        await state.update(estadoMinimo(telefono));
    } catch (error) {
        console.warn('[estadoConversacion] No se pudo reiniciar el estado:', (error as any)?.message ?? error);
    }
}

/** Borra (deja en `undefined`) las claves de agendar/cancelar/reprogramar. Se llama al entrar a cada step1. */
export async function limpiarClavesFlujosCita(state: EstadoFlujo): Promise<void> {
    const vacias: Record<string, undefined> = {};
    for (const clave of CLAVES_FLUJOS_CITA) vacias[clave] = undefined;
    await state.update(vacias);
}

/**
 * ¿Hay un agendamiento en curso? `tipoCitaAgendarCita` lo escribe el step1 de agendar justo después de
 * limpiar. Lo usan los pasos de agendar a los que se entra por keyword (id de una lista o botón): sin esto,
 * tocar una lista de una conversación ya cerrada seguía el flujo sin su contexto.
 */
export function hayAgendamientoEnCurso(state: Pick<EstadoFlujo, 'getMyState'>): boolean {
    return !!state.getMyState()?.tipoCitaAgendarCita;
}

/** ¿Hay una cancelación o reprogramación en curso? (lo escribe el step1 de cancelar/reprogramar). */
export function hayGestionCitaEnCurso(state: Pick<EstadoFlujo, 'getMyState'>): boolean {
    const flujo = state.getMyState()?.flujoSeleccionadoMenu;
    return flujo === 'cancelarCita' || flujo === 'reprogramarCita';
}

/** Mensaje para un botón o lista de una conversación que ya terminó (el state ya no tiene su contexto). */
export const MENSAJE_CONVERSACION_TERMINADA =
    'Esta opción pertenece a una conversación que ya terminó. Escribe *hola* para comenzar de nuevo. 😊';
