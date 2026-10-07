// Respuesta a los botones de los recordatorios ("Confirmo asistencia" / "Necesito cancelar" / "No podré
// asistir"): TB-05 y TBOT-03 (confirmación antes de cancelar), TBOT-05 (doble toque) y TBOT-06 (palabras
// globales durante una captura) del informe QA,
// proyecto-ips/docs/features/2026-10-02-informe-qa-lista-espera.md.
//
// Recorrido (igual para los 3 botones salvo donde se indica):
//   1. Botón → se pide el documento (captura). Mismo patrón de correlación de siempre: provider-meta
//      descarta `context.id`, así que se identifica al paciente por documento + celular.
//   2. `POST /chatbot/recordatorios/citas` → 0 citas: el mensaje de "no encontramos" de siempre
//      ("Confirmo asistencia" conserva su único reintento del documento); 1 cita: esa; 2 o más: lista de
//      Meta para elegir (captura), con la fila "Ninguna de estas".
//   3. "Confirmo asistencia": se confirma directo. "Necesito cancelar" / "No podré asistir": se muestra
//      la cita con los botones "Sí, cancelar" / "No, mantener" (captura) y solo con "Sí" se cancela.
//   4. `POST /chatbot/recordatorios/responder` SIEMPRE con `cita_id`: el backend actúa sobre esa cita y
//      no sobre "la más próxima".
//
// Robustez:
//   - Turno (`recordatorioOcupado`): se toma de forma síncrona (sin `await` entre la lectura y la
//     escritura; el `state` de @builderbot escribe en su Map dentro del ejecutor de la promesa) antes de
//     cualquier llamada al backend y se suelta al volver a esperar una respuesta del paciente. Un segundo
//     mensaje mientras está tomado (doble toque, ráfaga) termina en silencio, sin otra llamada. Caduca a
//     los 2 min por si un callback muriera sin soltarlo.
//   - "Salir" cierra la conversación como exitFlow; el botón de otra plantilla se deja pasar a su flujo
//     (ver ../palabrasGlobales.ts). Por eso las 3 capturas son siempre el ÚLTIMO paso de su flujo.
//   - Una captura abandonada queda pendiente en el historial de @builderbot: si después de 30 min llega
//     algo que no es una respuesta reconocible (p. ej. "hola" al día siguiente), se descarta y se inicia
//     una conversación nueva en vez de volver a preguntar por la cita.
//   - Claves de `state` propias (`CLAVES_RECORDATORIO`), que se borran en todo final. El borrado completo
//     entre sesiones de TBOT-02 (utils/estadoConversacion.ts) también las cubre.
//   - Sesión (T-02 del informe QA): la entrada del botón y cada respuesta capturada (documento, lista y
//     confirmación) renuevan la actividad (`renovarActividadSesion`) ANTES de leer o guardar claves. Antes
//     no la renovaban: si el paciente tenía una sesión abierta (p. ej. del menú) y su timer de 1 h vencía a
//     mitad de la lista, el cierre borraba el state y la fila elegida respondía "esta conversación ya
//     terminó". Todo final cierra la sesión con `closeUserSession` (antes solo con TRAZABILIDAD_V2), para que
//     la sesión abierta aquí no venza después como un abandono.
//
// Privacidad (regla transversal): de la cita solo se muestran fecha, hora y profesional.

import { addKeyword, EVENTS } from '@builderbot/bot';
import {
    consultarCitasRecordatorio,
    responderRecordatorio,
    registrarActividadBot,
} from '../../../services/apiService';
import type { CitaRecordatorio, ResultadoCitasRecordatorio, ResultadoRespuestaRecordatorio } from '../../../services/apiService';
import { sanitizeString, isValidDocumentNumber } from '../../../utils/sanitize';
import { closeUserSession, renovarActividadSesion } from '../../../utils/proactiveSessionManager';
import { isWorkingHours } from '../../../utils/verificarHorario';
import { numeroAsesorHumano } from '../../../utils/mensajesMovimientoCita';
import { MENSAJE_CONVERSACION_TERMINADA } from '../../../utils/estadoConversacion';
import { programarTickCascadaRetrasado } from '../../../utils/listaEsperaCascadaPoller';
import {
    MAX_REINTENTOS_DOCUMENTO,
    MENSAJE_DOCUMENTO_REINTENTO,
    MENSAJE_ERROR_RESPUESTA_RECORDATORIO,
} from '../../../utils/mensajesConfirmacion';
import * as M from '../../../utils/mensajesRecordatorio';
import type { AccionRecordatorio } from '../../../utils/mensajesRecordatorio';
import { esBotonDeOtraPlantilla, esPalabraSalir, MENSAJE_SALIR } from '../palabrasGlobales';
import {
    KW_BOTONES_CONFIRMAR_CANCELACION,
    KW_CONFIRMO_ASISTENCIA,
    KW_NECESITO_CANCELAR,
    KW_NO_PODRE_ASISTIR,
    OPCIONES_REGEX,
    TEXTO_BOTON_SI_CANCELAR,
} from '../keywordsBotones';
import {
    trackRespuestaCampana,
    trackPaso,
    trackNoEntendido,
    trackIdentificacion,
    trackErrorBackend,
    trackFin,
} from '../../../utils/trazabilidad';
import type { ResultadoRespuestaCampana } from '../../../utils/trazabilidad';
import type { PasoId } from '../../../constants/pasosTrazabilidad';
import { parsearPayloadRecordatorio } from '../../../utils/recordatorioPayload';
import { step1CencelarCita } from '../cancelarCita/step1CancelarCita';
import { welcomeFlow } from '../../welcomeFlow';

// ---------------------------------------------------------------------------
// Configuración por botón
// ---------------------------------------------------------------------------

export type BotonRecordatorio = 'confirmo' | 'necesito_cancelar' | 'no_podre_asistir';

interface ConfigBoton {
    boton: BotonRecordatorio;
    accion: AccionRecordatorio;
    /** Paso de trazabilidad del botón (documento, identificación y fin). */
    paso: PasoId;
    promptDocumento: string;
    resultadoCampana: ResultadoRespuestaCampana;
    /** "Confirmo asistencia" conserva su único reintento del documento cuando no hay cita. */
    reintentaDocumento: boolean;
}

const CONFIG: Record<BotonRecordatorio, ConfigBoton> = {
    confirmo: {
        boton: 'confirmo',
        accion: 'confirma',
        paso: 'recordatorio.confirmo',
        promptDocumento: 'Para confirmar tu cita, por favor digita tu número de documento 🔢:',
        resultadoCampana: 'confirmo',
        reintentaDocumento: true,
    },
    necesito_cancelar: {
        boton: 'necesito_cancelar',
        accion: 'no_asistira',
        paso: 'recordatorio.necesito_cancelar',
        promptDocumento: 'Para cancelar tu cita, por favor digita tu número de documento 🔢:',
        resultadoCampana: 'cancelar',
        reintentaDocumento: false,
    },
    no_podre_asistir: {
        boton: 'no_podre_asistir',
        accion: 'no_asistira',
        paso: 'recordatorio.no_podre_asistir',
        promptDocumento: 'Para cancelar tu cita, por favor digita tu número de documento 🔢:',
        resultadoCampana: 'no_asistira',
        reintentaDocumento: false,
    },
};

const PASO_SELECCION: PasoId = 'recordatorio.selecciona_cita';
const PASO_CONFIRMACION: PasoId = 'recordatorio.confirma_cancelar';

/** Reintentos ante una respuesta no reconocida en la lista y en la confirmación. */
export const MAX_REINTENTOS_RESPUESTA = 1;
/** Antigüedad a partir de la cual una captura abandonada se descarta ante un texto no reconocido. */
export const VENTANA_CAPTURA_MS = 30 * 60 * 1000;
/** Caducidad del turno por si un callback muriera sin soltarlo. */
const CADUCIDAD_TURNO_MS = 2 * 60 * 1000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Claves propias de estos flujos. Se borran en todo final. */
export const CLAVES_RECORDATORIO: readonly string[] = [
    'recordatorioBoton',
    'recordatorioViaPayload',
    'numeroDocRecordatorio',
    'recordatorioCitas',
    'recordatorioCita',
    'recordatorioIntentosDoc',
    'recordatorioIntentosSeleccion',
    'recordatorioIntentosConfirmacion',
    'recordatorioAmbiguas',
    'recordatorioReingreso',
    'recordatorioOcupado',
    'recordatorioCapturaDesde',
    // De la versión anterior de estos flujos (por si quedaron en memoria de una conversación vieja).
    'intentosDocRecordatorio',
    'reintentoDocRecordatorioEnCurso',
    'trazaReintentoNecesitoCancelar',
    'trazaReintentoNoPodreAsistir',
];

type Fns = any;

function estado(state: any): Record<string, any> {
    return state?.getMyState?.() ?? {};
}

async function limpiarClavesRecordatorio(state: any): Promise<void> {
    const vacias: Record<string, undefined> = {};
    for (const clave of CLAVES_RECORDATORIO) vacias[clave] = undefined;
    await state.update(vacias);
}

/**
 * Final de la conversación del recordatorio: claves propias fuera y sesión cerrada (closeUserSession emite
 * `sesion_fin` con TRAZABILIDAD_V2 y borra el state; los llamadores ya leyeron lo que necesitan).
 */
async function terminar(ctx: any, state: any): Promise<void> {
    await limpiarClavesRecordatorio(state);
    closeUserSession(ctx.from, 'completado');
}

function turnoTomado(state: any): boolean {
    const desde = Number(estado(state).recordatorioOcupado) || 0;
    return desde > 0 && Date.now() - desde < CADUCIDAD_TURNO_MS;
}

/** Toma el turno de forma SÍNCRONA (el Map del state se escribe dentro del ejecutor de la promesa). */
function tomarTurno(state: any): void {
    void state.update({ recordatorioOcupado: Date.now() });
}

/** Suelta el turno y marca el inicio de la siguiente espera de respuesta. */
async function esperarRespuesta(state: any, extra: Record<string, any> = {}): Promise<void> {
    await state.update({ ...extra, recordatorioOcupado: undefined, recordatorioCapturaDesde: Date.now() });
}

function capturaVencida(state: any): boolean {
    const desde = Number(estado(state).recordatorioCapturaDesde) || 0;
    return desde > 0 && Date.now() - desde > VENTANA_CAPTURA_MS;
}

function configDe(state: any): ConfigBoton | undefined {
    return CONFIG[estado(state).recordatorioBoton as BotonRecordatorio];
}

async function registrarRespuesta(ctx: any, cfg: ConfigBoton, extra: Record<string, unknown>): Promise<void> {
    await registrarActividadBot('recordatorio_respuesta', ctx.from, {
        accion: cfg.accion,
        // Solo es 'payload' si la respuesta se resolvió sin documento (ver crearFlujoEntrada); un payload
        // presente en un botón que igual pide documento (cancelar) cuenta como 'documento'.
        via: ctx?.__viaPayload === true ? 'payload' : 'documento',
        ...(cfg.boton !== 'confirmo' ? { origen_boton: cfg.boton } : {}),
        ...extra,
    });
}

/**
 * Palabras globales y turno, en este orden, al inicio de cada captura. Devuelve `undefined` si el
 * callback debe seguir (y en ese caso ya tomó el turno); si no, lo que el callback debe retornar.
 */
async function filtrarEntrada(ctx: any, fns: Fns): Promise<{ salida: any } | undefined> {
    const { state, endFlow } = fns;
    if (esPalabraSalir(ctx.body)) {
        // Igual que exitFlow (welcomeFlow.ts), que no alcanza a responder: este callback corre primero.
        trackPaso(ctx.from, 'comun.salida');
        if (!turnoTomado(state)) await limpiarClavesRecordatorio(state);
        closeUserSession(ctx.from, 'salir');
        return { salida: endFlow(MENSAJE_SALIR) };
    }
    if (esBotonDeOtraPlantilla(ctx.body)) {
        // Se retorna sin gotoFlow/endFlow/flowDynamic: @builderbot sigue con el flujo de ese botón. Con
        // una llamada en curso no se toca el state (la termina y limpia ese mismo callback).
        if (!turnoTomado(state)) {
            await limpiarClavesRecordatorio(state);
            closeUserSession(ctx.from, 'completado');
        }
        return { salida: undefined };
    }
    // T-02: renovar la sesión ANTES de leer el state. Si había vencido sin que corriera el timer, aquí se
    // cierra y se limpia el state, y el paso lo trata como una conversación que ya terminó (lista y
    // confirmación) o sigue con el documento recién digitado (captura del documento, que no depende del state).
    renovarActividadSesion(ctx.from, 'respuesta_plantilla');
    if (turnoTomado(state)) {
        // Doble toque / ráfaga: ya hay una llamada en curso. endFlow sin mensaje: no se envía nada y se
        // descarta cualquier keyword que el texto hubiera activado (p. ej. 'cancelar' de "Sí, cancelar").
        return { salida: endFlow() };
    }
    tomarTurno(state);
    return undefined;
}

/** Captura abandonada hace más de 30 min + texto no reconocido → conversación nueva. */
async function descartarCapturaVencida(ctx: any, fns: Fns): Promise<any> {
    await terminar(ctx, fns.state);
    return fns.gotoFlow(welcomeFlow);
}

// ---------------------------------------------------------------------------
// Pasos compartidos
// ---------------------------------------------------------------------------

async function mostrarLista(ctx: any, fns: Fns, citas: CitaRecordatorio[], extra: Record<string, any> = {}): Promise<any> {
    const { state, provider, gotoFlow } = fns;
    await esperarRespuesta(state, { recordatorioCitas: citas, recordatorioCita: undefined, ...extra });
    trackPaso(ctx.from, PASO_SELECCION, 'mostrado', { metadata: { citas: citas.length } });
    await provider.sendList(ctx.from, M.construirListaCitasRecordatorio(citas));
    return gotoFlow(seleccionCitaRecordatorioFlow);
}

async function mostrarConfirmacion(ctx: any, fns: Fns, cita: CitaRecordatorio): Promise<any> {
    const { state, flowDynamic, gotoFlow } = fns;
    await esperarRespuesta(state);
    await flowDynamic([{ body: M.mensajeConfirmarCancelacion(cita), buttons: M.BOTONES_CONFIRMAR_CANCELACION }]);
    return gotoFlow(confirmacionCancelarRecordatorioFlow);
}

/** Con la cita ya elegida (turno tomado): confirmar directo, o pedir confirmación antes de cancelar. */
async function elegirCita(ctx: any, fns: Fns, cfg: ConfigBoton, cita: CitaRecordatorio): Promise<any> {
    const { state } = fns;
    await state.update({ recordatorioCita: cita, recordatorioIntentosConfirmacion: 0 });
    if (cfg.accion === 'confirma') return ejecutarRespuesta(ctx, fns, cfg, cita);
    trackPaso(ctx.from, PASO_CONFIRMACION, 'mostrado');
    return mostrarConfirmacion(ctx, fns, cita);
}

async function sinCita(ctx: any, fns: Fns, cfg: ConfigBoton, consulta: ResultadoCitasRecordatorio): Promise<any> {
    const { state, flowDynamic, endFlow, gotoFlow } = fns;
    const causa = consulta.ok === false ? consulta.causa.toLowerCase() : 'sin_citas';
    if (cfg.reintentaDocumento) {
        const intentos = Number(estado(state).recordatorioIntentosDoc) || 0;
        await registrarRespuesta(ctx, cfg, { resultado: causa });
        if (intentos < MAX_REINTENTOS_DOCUMENTO) {
            await flowDynamic(MENSAJE_DOCUMENTO_REINTENTO);
            await esperarRespuesta(state, {
                recordatorioIntentosDoc: intentos + 1,
                recordatorioReingreso: true,
                numeroDocRecordatorio: undefined,
            });
            return gotoFlow(FLUJOS_ENTRADA[cfg.boton]);
        }
        const enHorario = isWorkingHours();
        trackFin(ctx.from, 'recordatorio', enHorario ? 'derivado_agente' : 'fuera_horario', {
            paso: cfg.paso, metadata: { motivo: 'documento_no_encontrado' },
        });
        await registrarRespuesta(ctx, cfg, { resultado: enHorario ? 'derivado_agente' : 'fuera_horario', motivo: 'documento_no_encontrado' });
        await terminar(ctx, state);
        await flowDynamic(enHorario
            ? `No pudimos identificar la cita. Un asesor puede ayudarte directamente:\n👉 https://wa.me/${numeroAsesorHumano()}?text=Hola,%20deseo%20hablar%20con%20una%20asistente.`
            : 'En este momento nuestros asesores no están disponibles. Nuestro horario es de lunes a viernes de 7 am a 7 pm y sábados de 7 am a 1 pm. Escríbenos en ese horario y con gusto te ayudaremos.');
        return endFlow();
    }
    await registrarRespuesta(ctx, cfg, { resultado: 'error_o_sin_cita', causa });
    await terminar(ctx, state);
    await flowDynamic(M.MENSAJE_SIN_CITA_ACTIVA);
    return endFlow();
}

/** `responder` con `cita_id` (turno tomado). Único punto que confirma o cancela. */
async function ejecutarRespuesta(ctx: any, fns: Fns, cfg: ConfigBoton, cita: CitaRecordatorio): Promise<any> {
    const { state, flowDynamic, endFlow } = fns;
    const numeroDoc = estado(state).numeroDocRecordatorio;
    const viaPayload = Boolean(estado(state).recordatorioViaPayload) && cfg.accion === 'confirma';
    if ((!numeroDoc && !viaPayload) || !cita?.cita_id) {
        await terminar(ctx, state);
        await flowDynamic(M.MENSAJE_SIN_IDENTIFICAR);
        return endFlow();
    }

    let resultado: ResultadoRespuestaRecordatorio;
    try {
        resultado = viaPayload
            ? await responderRecordatorio(ctx.from, '', cfg.accion, cita.cita_id, 'payload')
            : await responderRecordatorio(ctx.from, numeroDoc ?? '', cfg.accion, cita.cita_id);
    } catch (error) {
        console.error('Error respondiendo recordatorio:', (error as any)?.message ?? error);
        resultado = { ok: false, causa: 'ERROR' };
    }

    try {
        if (viaPayload && resultado.ok === false) {
            // Payload rechazado o backend temporalmente no disponible: vuelve al camino ya probado
            // con documento. Nunca se usa el payload para cancelar sin confirmación explícita.
            await flowDynamic(MENSAJE_DOCUMENTO_REINTENTO);
            await esperarRespuesta(state, {
                recordatorioViaPayload: false,
                recordatorioReingreso: true,
                recordatorioBoton: cfg.boton,
                recordatorioIntentosDoc: 0,
            });
            return fns.gotoFlow(FLUJOS_ENTRADA[cfg.boton]);
        }
        if (resultado.ok === true) {
            const data = resultado.data;
            const datosCita = M.citaParaMensaje(cita, data);
            const estadoResultado = data.estado_resultado;
            const agendaId = data.agenda_id ?? data.cita_id ?? cita.cita_id;
            const citaIdExterna = data.agenda_id_externa ?? cita.agenda_id_externa;
            if (cfg.accion === 'confirma') {
                trackFin(ctx.from, 'recordatorio', 'cita_confirmada', {
                    paso: cfg.paso,
                    agendaId,
                    citaIdExterna,
                    metadata: { estado_resultado: estadoResultado === 'ya_confirmada' ? 'ya_confirmada' : 'confirmada' },
                });
                await registrarRespuesta(ctx, cfg, {
                    resultado: estadoResultado === 'ya_confirmada' ? 'ya_confirmada' : 'exitoso',
                    persistido: data.persistido,
                });
                await terminar(ctx, state);
                await flowDynamic(M.mensajeCitaConfirmada(datosCita, estadoResultado));
                return endFlow();
            }
            trackFin(ctx.from, 'recordatorio', 'cita_cancelada', { paso: cfg.paso, agendaId, citaIdExterna });
            await registrarRespuesta(ctx, cfg, {
                resultado: 'exitoso',
                persistido: data.persistido,
                ...(estadoResultado ? { estado_resultado: estadoResultado } : {}),
            });
            await terminar(ctx, state);
            await flowDynamic(M.mensajeCitaCancelada(datosCita, estadoResultado));
            // Path rápido de la cascada de lista de espera, igual que el cancelar del menú
            // (stepConfirmaCancelarCita.ts): después de responder y con retraso. Nunca lanza.
            if (estadoResultado !== 'ya_cancelada') programarTickCascadaRetrasado();
            return endFlow();
        }

        if (resultado.ok === false && resultado.causa === 'CITA_AMBIGUA') {
            // No debería pasar (siempre se envía cita_id), pero el contrato lo permite: se vuelve a elegir,
            // una sola vez.
            const ambiguas = Number(estado(state).recordatorioAmbiguas) || 0;
            if (resultado.citas.length > 0 && ambiguas < 1) {
                trackNoEntendido(ctx.from, PASO_SELECCION, 1, { contexto: 'cita_ambigua' });
                return mostrarLista(ctx, fns, resultado.citas, { recordatorioAmbiguas: ambiguas + 1, recordatorioIntentosSeleccion: 0 });
            }
            await registrarRespuesta(ctx, cfg, { resultado: 'cita_ambigua' });
            await terminar(ctx, state);
            await flowDynamic(M.MENSAJE_SIN_IDENTIFICAR);
            return endFlow();
        }

        const causa = resultado.ok === false ? resultado.causa : 'ERROR';
        let mensaje: string;
        if (causa === 'GLOBHO_ERROR' || causa === 'ERROR') {
            trackErrorBackend(ctx.from, cfg.paso, '/chatbot/recordatorios/responder', {
                siempre: true,
                cause: causa,
                ...(causa === 'GLOBHO_ERROR' ? { httpStatus: 502 } : {}),
            });
            trackFin(ctx.from, 'recordatorio', 'error_backend', { paso: cfg.paso });
            mensaje = causa === 'GLOBHO_ERROR'
                ? M.mensajeErrorGlobhoRecordatorio(cfg.accion)
                : M.mensajeErrorTecnicoRecordatorio(cfg.accion);
        } else if (causa === 'RESPUESTA_EN_PROCESO') {
            // No se reintenta solo: la otra respuesta en curso es la que termina la acción.
            mensaje = M.MENSAJE_RESPUESTA_EN_PROCESO;
        } else if (causa === 'DOCUMENTO_INVALIDO') {
            mensaje = M.MENSAJE_SIN_IDENTIFICAR;
        } else {
            // CITA_NO_VALIDA (409, cualquier motivo) y los 404 (CITA_NOT_FOUND, CITA_CANCELADA,
            // CITA_REPROGRAMADA, CITA_PASADA).
            mensaje = M.MENSAJE_CITA_NO_DISPONIBLE;
        }
        const motivo = resultado.ok === false && resultado.causa === 'CITA_NO_VALIDA' && resultado.motivo
            ? { motivo: resultado.motivo.toLowerCase() }
            : {};
        await registrarRespuesta(ctx, cfg, cfg.accion === 'confirma'
            ? { resultado: causa.toLowerCase(), ...motivo }
            : { resultado: 'error_o_sin_cita', causa: causa.toLowerCase(), ...motivo });
        await terminar(ctx, state);
        await flowDynamic(mensaje);
        return endFlow();
    } catch (error) {
        // Falló algo DESPUÉS de llamar a `responder`: no se sabe si la acción se hizo.
        console.error('Error procesando la respuesta del recordatorio:', (error as any)?.message ?? error);
        await terminar(ctx, state);
        try {
            await flowDynamic(M.mensajeErrorTecnicoRecordatorio(cfg.accion));
        } catch {
            // nada más que hacer
        }
        return endFlow();
    }
}

/** Error inesperado ANTES de llamar a `responder` (no se hizo ningún cambio). */
async function errorInesperado(ctx: any, fns: Fns, error: unknown): Promise<any> {
    console.error('Error en el flujo de respuesta al recordatorio:', (error as any)?.message ?? error);
    await terminar(ctx, fns.state);
    try {
        await fns.flowDynamic(MENSAJE_ERROR_RESPUESTA_RECORDATORIO);
    } catch {
        // nada más que hacer
    }
    return fns.endFlow();
}

// ---------------------------------------------------------------------------
// Flujos
// ---------------------------------------------------------------------------

/** Paso 2: consulta de citas (turno tomado por la captura del documento). */
function crearFlujoAccion(cfg: ConfigBoton) {
    return addKeyword(EVENTS.ACTION).addAction(async (ctx, fns) => {
        const { state, flowDynamic, endFlow } = fns;
        try {
            const numeroDoc = estado(state).numeroDocRecordatorio;
            if (!numeroDoc) {
                await terminar(ctx, state);
                await flowDynamic(M.MENSAJE_SIN_IDENTIFICAR);
                return endFlow();
            }

            const consulta = await consultarCitasRecordatorio(numeroDoc, ctx.from);
            if (consulta.ok === false && consulta.causa === 'ERROR') {
                trackErrorBackend(ctx.from, cfg.paso, '/chatbot/recordatorios/citas', { siempre: true, httpStatus: consulta.httpStatus });
                trackFin(ctx.from, 'recordatorio', 'error_backend', { paso: cfg.paso });
                await registrarRespuesta(ctx, cfg, { resultado: 'error_consulta_citas' });
                await terminar(ctx, state);
                await flowDynamic(M.MENSAJE_ERROR_CONSULTA_CITAS);
                return endFlow();
            }
            trackIdentificacion(ctx.from, numeroDoc, consulta.ok ? 'encontrado' : 'no_encontrado', cfg.paso);

            const citas = consulta.ok ? consulta.citas : [];
            if (citas.length === 0) return sinCita(ctx, fns, cfg, consulta);
            if (citas.length === 1) return elegirCita(ctx, fns, cfg, citas[0]);
            return mostrarLista(ctx, fns, citas, { recordatorioIntentosSeleccion: 0 });
        } catch (error) {
            return errorInesperado(ctx, fns, error);
        }
    });
}

/** Paso 1: el botón del recordatorio y la captura del documento. */
function crearFlujoEntrada(cfg: ConfigBoton, keyword: string) {
    return addKeyword(keyword, OPCIONES_REGEX)
        .addAction(async (ctx, fns) => {
            const { state, endFlow, flowDynamic } = fns;
            if (estado(state).recordatorioReingreso) {
                // Reintento del documento (gotoFlow a este mismo flujo): se conservan los contadores. La
                // actividad ya la renovó la captura que hizo el gotoFlow.
                await state.update({ recordatorioReingreso: false });
                return;
            }
            // T-02: abrir o renovar la sesión ANTES de guardar las claves del flujo (si la sesión había
            // vencido, `updateUserActivity` limpia el state; después de esto ya no lo hace).
            renovarActividadSesion(ctx.from, 'respuesta_plantilla');
            if (turnoTomado(state)) {
                return endFlow(M.MENSAJE_SOLICITUD_EN_PROCESO);
            }
            await limpiarClavesRecordatorio(state);
            await state.update({ recordatorioBoton: cfg.boton, recordatorioCapturaDesde: Date.now() });
            // Trazabilidad: respuesta esperada (tabla 11.2), una sola vez (no en el reintento del documento).
            // campana null: el bot no sabe a qué recordatorio responde.
            trackRespuestaCampana(ctx.from, null, cfg.resultadoCampana, cfg.paso);
            const payload = parsearPayloadRecordatorio(ctx?.payload);
            const accionEsperada = cfg.accion === 'confirma' ? 'C' : cfg.boton === 'necesito_cancelar' ? 'X' : 'N';
            if (payload && payload.accion === accionEsperada && cfg.accion === 'confirma') {
                tomarTurno(state);
                ctx.__viaPayload = true;
                await state.update({ recordatorioViaPayload: true, recordatorioCita: { cita_id: payload.citaId } });
                return ejecutarRespuesta(ctx, fns as Fns, cfg, { cita_id: payload.citaId } as CitaRecordatorio);
            }
            if (payload && payload.accion !== accionEsperada) {
                console.warn('[recordatorios] El payload no coincide con el botón; se solicitará documento.');
            }
        })
        .addAnswer(cfg.promptDocumento, { capture: true }, async (ctx, fns) => {
            const filtro = await filtrarEntrada(ctx, fns);
            if (filtro) return filtro.salida;
            const { state, flowDynamic, gotoFlow } = fns;
            try {
                const numeroDoc = sanitizeString(ctx.body, 20);
                if (!isValidDocumentNumber(numeroDoc)) {
                    if (capturaVencida(state)) return descartarCapturaVencida(ctx, fns);
                    trackNoEntendido(ctx.from, cfg.paso);
                    await flowDynamic(M.MENSAJE_DOCUMENTO_NO_VALIDO);
                    await esperarRespuesta(state, { recordatorioReingreso: true, recordatorioBoton: cfg.boton });
                    return gotoFlow(FLUJOS_ENTRADA[cfg.boton]);
                }
                trackPaso(ctx.from, cfg.paso, 'ok');
                await state.update({ numeroDocRecordatorio: numeroDoc, recordatorioBoton: cfg.boton });
                return gotoFlow(FLUJOS_ACCION[cfg.boton]);
            } catch (error) {
                return errorInesperado(ctx, fns, error);
            }
        });
}

/** Paso 3a: elegir la cita de la lista (2 o más citas). Captura sola: último paso de su flujo. */
const seleccionCitaRecordatorioFlow = addKeyword(EVENTS.ACTION).addAction({ capture: true }, async (ctx, fns) => {
    const filtro = await filtrarEntrada(ctx, fns);
    if (filtro) return filtro.salida;
    const { state, flowDynamic, endFlow, gotoFlow, provider } = fns;
    try {
        const cfg = configDe(state);
        const citas: CitaRecordatorio[] = estado(state).recordatorioCitas;
        if (!cfg || !Array.isArray(citas) || citas.length === 0) {
            await terminar(ctx, state);
            return endFlow(MENSAJE_CONVERSACION_TERMINADA);
        }
        if (M.esFilaNinguna(ctx.body)) {
            trackPaso(ctx.from, PASO_SELECCION, 'ok', { metadata: { opcion: 'ninguna' } });
            await registrarRespuesta(ctx, cfg, { resultado: 'ninguna_cita' });
            await terminar(ctx, state);
            await flowDynamic(M.MENSAJE_NINGUNA_CITA);
            return endFlow();
        }
        const indice = M.indiceDesdeIdFila(ctx.body);
        const cita = indice !== null && indice < M.MAX_CITAS_EN_LISTA ? citas[indice] : undefined;
        if (!cita) {
            if (capturaVencida(state)) return descartarCapturaVencida(ctx, fns);
            trackNoEntendido(ctx.from, PASO_SELECCION);
            const intentos = Number(estado(state).recordatorioIntentosSeleccion) || 0;
            if (intentos < MAX_REINTENTOS_RESPUESTA) {
                await esperarRespuesta(state, { recordatorioIntentosSeleccion: intentos + 1 });
                await flowDynamic(M.MENSAJE_SELECCION_REINTENTO);
                await provider.sendList(ctx.from, M.construirListaCitasRecordatorio(citas));
                return gotoFlow(seleccionCitaRecordatorioFlow);
            }
            await registrarRespuesta(ctx, cfg, { resultado: 'seleccion_invalida' });
            await terminar(ctx, state);
            await flowDynamic(M.MENSAJE_SELECCION_FINAL);
            return endFlow();
        }
        trackPaso(ctx.from, PASO_SELECCION, 'ok');
        return elegirCita(ctx, fns, cfg, cita);
    } catch (error) {
        return errorInesperado(ctx, fns, error);
    }
});

/** Normaliza la respuesta a la confirmación: 'si' | 'no' | null. */
function respuestaConfirmacion(texto: unknown): 'si' | 'no' | null {
    if (typeof texto !== 'string') return null;
    const limpio = texto
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (limpio === 'si cancelar' || limpio === 'si') return 'si';
    if (limpio === 'no mantener' || limpio === 'no') return 'no';
    return null;
}

/** Paso 3b: "Sí, cancelar" / "No, mantener". Captura sola: último paso de su flujo. */
const confirmacionCancelarRecordatorioFlow = addKeyword(EVENTS.ACTION).addAction({ capture: true }, async (ctx, fns) => {
    const filtro = await filtrarEntrada(ctx, fns);
    if (filtro) return filtro.salida;
    const { state, flowDynamic, endFlow, gotoFlow } = fns;
    try {
        const cfg = configDe(state);
        const cita: CitaRecordatorio | undefined = estado(state).recordatorioCita;
        if (!cfg || !cita) {
            await terminar(ctx, state);
            return endFlow(MENSAJE_CONVERSACION_TERMINADA);
        }
        const respuesta = respuestaConfirmacion(ctx.body);
        if (respuesta === 'si') {
            trackPaso(ctx.from, PASO_CONFIRMACION, 'ok', { metadata: { confirma: true } });
            return ejecutarRespuesta(ctx, fns, cfg, cita);
        }
        if (respuesta === 'no') {
            trackPaso(ctx.from, PASO_CONFIRMACION, 'ok', { metadata: { confirma: false } });
            await registrarRespuesta(ctx, cfg, { resultado: 'mantiene_cita' });
            await terminar(ctx, state);
            await flowDynamic(M.MENSAJE_CITA_SIGUE_IGUAL);
            return endFlow();
        }
        if (capturaVencida(state)) return descartarCapturaVencida(ctx, fns);
        trackNoEntendido(ctx.from, PASO_CONFIRMACION);
        const intentos = Number(estado(state).recordatorioIntentosConfirmacion) || 0;
        if (intentos < MAX_REINTENTOS_RESPUESTA) {
            await state.update({ recordatorioIntentosConfirmacion: intentos + 1 });
            await flowDynamic(M.MENSAJE_CONFIRMACION_REINTENTO);
            return mostrarConfirmacion(ctx, fns, cita);
        }
        await registrarRespuesta(ctx, cfg, { resultado: 'confirmacion_invalida' });
        await terminar(ctx, state);
        await flowDynamic(M.MENSAJE_CONFIRMACION_FINAL);
        return endFlow();
    } catch (error) {
        return errorInesperado(ctx, fns, error);
    }
});

/**
 * "Sí, cancelar" / "No, mantener" FUERA de la captura que los espera. Dentro de la captura los atiende
 * ella (y este flujo se descarta porque el callback de la captura termina con gotoFlow/endFlow).
 *   - Con una llamada en curso (doble toque que llegó cuando la captura ya se había consumido): nada.
 *   - "Sí, cancelar" sin contexto: el flujo guiado de cancelar, que es a donde iba antes por subcadena
 *     ('cancelar') y que vuelve a mostrar la cita y pedir confirmación.
 *   - "No, mantener" sin contexto: botón de una conversación que ya terminó.
 * Solo se registra con RECORDATORIOS_BOTONES_ENABLED=true (templates/index.ts).
 */
const botonesConfirmarCancelacionFlow = addKeyword(KW_BOTONES_CONFIRMAR_CANCELACION, OPCIONES_REGEX)
    .addAction(async (ctx, { state, endFlow, gotoFlow }) => {
        if (turnoTomado(state)) return endFlow();
        if (typeof ctx.body === 'string' && ctx.body.trim() === TEXTO_BOTON_SI_CANCELAR) {
            return gotoFlow(step1CencelarCita);
        }
        return endFlow(MENSAJE_CONVERSACION_TERMINADA);
    });

const FLUJOS_ACCION: Record<BotonRecordatorio, any> = {
    confirmo: crearFlujoAccion(CONFIG.confirmo),
    necesito_cancelar: crearFlujoAccion(CONFIG.necesito_cancelar),
    no_podre_asistir: crearFlujoAccion(CONFIG.no_podre_asistir),
};

// Coincidencia exacta anclada (runbook B1): ver templates/flujos/keywordsBotones.ts.
const FLUJOS_ENTRADA: Record<BotonRecordatorio, any> = {
    confirmo: crearFlujoEntrada(CONFIG.confirmo, KW_CONFIRMO_ASISTENCIA),
    necesito_cancelar: crearFlujoEntrada(CONFIG.necesito_cancelar, KW_NECESITO_CANCELAR),
    no_podre_asistir: crearFlujoEntrada(CONFIG.no_podre_asistir, KW_NO_PODRE_ASISTIR),
};

export {
    FLUJOS_ENTRADA,
    FLUJOS_ACCION,
    seleccionCitaRecordatorioFlow,
    confirmacionCancelarRecordatorioFlow,
    botonesConfirmarCancelacionFlow,
};
