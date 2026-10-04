// Ejecutor de las campañas de invitación a la lista de espera (regularización y continua):
// proyecto-ips/docs/features/2026-10-04-campanas-invitacion-lista-espera-implementacion.md, sección 6.5.
//
// Se ejecuta en segundo plano (el endpoint responde 202 antes, C9). Pasos:
//   1. Kill switch (`esBotHabilitado`) o `NOMBRE_PLANTILLA_LE_INVITACION` vacío → termina sin llamar a
//      `reservar` (solo deja la traza de la ejecución).
//   2. `campana_ejecucion{inicio}` de trazabilidad.
//   3. `finalizar-sin-respuesta` (E4), idempotente; si falla se sigue.
//   4. Bucle de lotes: antes de cada lote se vuelve a leer el interruptor y el kill switch; `reservar` (E2)
//      con `lote = LISTA_ESPERA_INVITACION_LOTE` y la lista piloto en `solo_telefonos`; por cada invitación,
//      filtro de crisis → `registrar-envio {exito:false, motivo:'bloqueado_crisis'}`, o envío de la
//      plantilla → `registrar-envio` con el resultado; pausa `LISTA_ESPERA_INVITACION_PAUSA_MS`.
//   5. `ejecuciones/finalizar` (E8) + `campana_ejecucion{fin}`.
// El candado en memoria por campaña se suelta en `finally`. El bot corre en PM2 `fork` (una sola
// instancia), así que el candado en memoria basta; el backend además serializa `reservar` con un
// advisory lock y sus índices únicos impiden duplicados.
//
// Logs: sin teléfono completo ni nombre (solo ids internos y conteos).

import {
    finalizarEjecucionInvitacion,
    finalizarSinRespuestaInvitaciones,
    registrarEnvioInvitacion,
    reservarInvitaciones,
    enviarPlantillaInvitacionListaEspera,
} from '../../../services/apiService';
import type {
    CampanaTipoInvitacion,
    InvitacionReservada,
    MotivoFinEjecucionInvitacion,
    OrigenEjecucionInvitacion,
} from '../../../services/apiService';
import { esBotHabilitado } from '../../../services/citasService';
import { isInvitacionListaEsperaEnabled, obtenerTelefonosPiloto } from '../../../utils/listaEsperaFlags';
import { obtenerBloqueadosPorCrisis } from '../../../utils/crisisBlacklistStore';
import { claveComparacionTelefono } from '../../../utils/telefono';
import { iniciarEjecucionCampana, finalizarEjecucionCampana } from '../../../utils/trazabilidad';
import type { CampanaTraza } from '../../../utils/trazabilidad';
import { anotarCampanaDeInvitacion } from '../../../utils/invitacionPayload';

// ---------------------------------------------------------------------------
// Configuración (process.env leído en cada llamada; ver sección 6.2)
// ---------------------------------------------------------------------------

export const LIMITE_MAXIMO_INVITACION = 300;
export const LIMITE_DEFAULT_REGULARIZACION = 50;
const LIMITE_DEFAULT_CONTINUA = 200;
const LOTE_DEFAULT = 10;
const LOTE_MAXIMO = 50;
const PAUSA_DEFAULT_MS = 3000;

function enteroEnv(nombre: string, porDefecto: number, minimo: number, maximo: number): number {
    const crudo = (process.env[nombre] ?? '').trim();
    if (crudo === '') return porDefecto;
    const valor = Number(crudo);
    if (!Number.isInteger(valor)) return porDefecto;
    return Math.min(Math.max(valor, minimo), maximo);
}

export function nombrePlantillaInvitacion(): string {
    return (process.env.NOMBRE_PLANTILLA_LE_INVITACION ?? '').trim();
}

/** `LISTA_ESPERA_INVITACION_LIMITE_CONTINUA` (default 200, 1..300). */
export function limiteContinua(): number {
    return enteroEnv('LISTA_ESPERA_INVITACION_LIMITE_CONTINUA', LIMITE_DEFAULT_CONTINUA, 1, LIMITE_MAXIMO_INVITACION);
}

/** `LISTA_ESPERA_INVITACION_LOTE` (default 10, 1..50 como acepta `reservar`). */
export function loteInvitacion(): number {
    return enteroEnv('LISTA_ESPERA_INVITACION_LOTE', LOTE_DEFAULT, 1, LOTE_MAXIMO);
}

/** `LISTA_ESPERA_INVITACION_PAUSA_MS` (default 3000; 0 permitido). */
export function pausaInvitacionMs(): number {
    return enteroEnv('LISTA_ESPERA_INVITACION_PAUSA_MS', PAUSA_DEFAULT_MS, 0, 10 * 60 * 1000);
}

/** Lista piloto en formato de envío `57XXXXXXXXXX` (vacía = sin restricción). */
export function telefonosPilotoFormato57(): string[] {
    return obtenerTelefonosPiloto().map((clave) => `57${clave}`);
}

export function codigoCampanaTraza(tipo: CampanaTipoInvitacion): CampanaTraza {
    return tipo === 'regularizacion' ? 'le_invit_reg' : 'le_invit_cont';
}

// ---------------------------------------------------------------------------
// Candado en memoria por campaña
// ---------------------------------------------------------------------------

const enCurso = new Set<CampanaTipoInvitacion>();

export function campanaInvitacionEnCurso(tipo: CampanaTipoInvitacion): boolean {
    return enCurso.has(tipo);
}

/** Solo para pruebas. */
export function _liberarCandadosParaPruebas(): void {
    enCurso.clear();
}

// ---------------------------------------------------------------------------
// Ejecutor
// ---------------------------------------------------------------------------

export interface ParametrosEjecucionInvitacion {
    limite: number;
    origen: OrigenEjecucionInvitacion;
    fecha_desde?: string | null;
    fecha_hasta?: string | null;
}

export interface ResumenEjecucionInvitacion {
    campana: CampanaTipoInvitacion;
    estado: 'en_curso' | 'no_iniciada' | 'finalizada' | 'abortada';
    motivo_fin: MotivoFinEjecucionInvitacion | null;
    ejecucion_id: string | null;
    reservadas: number;
    enviadas: number;
    errores: number;
    bloqueadas_crisis: number;
}

const dormir = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

/**
 * Ejecuta una campaña completa. Toma el candado de forma SÍNCRONA (antes del primer `await`), así que el
 * llamador puede comprobar `campanaInvitacionEnCurso` y llamar a esta función sin carrera. Nunca lanza.
 */
export async function ejecutarCampanaInvitacion(
    tipo: CampanaTipoInvitacion,
    params: ParametrosEjecucionInvitacion
): Promise<ResumenEjecucionInvitacion> {
    const resumen: ResumenEjecucionInvitacion = {
        campana: tipo,
        estado: 'en_curso',
        motivo_fin: null,
        ejecucion_id: null,
        reservadas: 0,
        enviadas: 0,
        errores: 0,
        bloqueadas_crisis: 0,
    };
    if (enCurso.has(tipo)) return resumen;
    enCurso.add(tipo);

    const inicio = Date.now();
    const campana = codigoCampanaTraza(tipo);
    let campanaEjecucionId: string | undefined;
    try {
        // Paso 1: kill switch y plantilla, sin llamar a reservar.
        const nombrePlantilla = nombrePlantillaInvitacion();
        if (!esBotHabilitado() || !nombrePlantilla) {
            resumen.estado = 'no_iniciada';
            resumen.motivo_fin = !nombrePlantilla ? 'config_incompleta' : 'deshabilitada';
            campanaEjecucionId = iniciarEjecucionCampana(campana, params.origen);
            console.warn(`[invitaciones] Campaña ${tipo} no iniciada (${resumen.motivo_fin}).`);
            return resumen;
        }

        // Paso 2.
        campanaEjecucionId = iniciarEjecucionCampana(campana, params.origen);
        console.log(`[invitaciones] Inicia campaña ${tipo} (origen ${params.origen}, límite ${params.limite}).`);

        // Paso 3 (best-effort).
        const cierre = await finalizarSinRespuestaInvitaciones();
        if (cierre.ok === true) {
            console.log('[invitaciones] finalizar-sin-respuesta:', cierre.data);
        }

        // Paso 4.
        const lote = loteInvitacion();
        const pausaMs = pausaInvitacionMs();
        const soloTelefonos = telefonosPilotoFormato57();
        // Tope de vueltas por si el backend no cerrara nunca con motivo_fin (defensa contra un bucle infinito).
        const maxVueltas = Math.ceil(params.limite / lote) + 2;
        let vueltas = 0;
        let estadoFin: 'finalizada' | 'abortada' = 'finalizada';
        let motivoFin: MotivoFinEjecucionInvitacion | null = null;

        while (motivoFin === null) {
            if (!isInvitacionListaEsperaEnabled() || !esBotHabilitado()) {
                estadoFin = 'abortada';
                motivoFin = 'deshabilitada';
                break;
            }
            if (vueltas >= maxVueltas) {
                motivoFin = 'limite_alcanzado';
                break;
            }
            vueltas += 1;

            const reserva = await reservarInvitaciones({
                campana_tipo: tipo,
                origen: params.origen,
                ejecucion_id: resumen.ejecucion_id,
                campana_ejecucion_id: campanaEjecucionId ?? null,
                lote,
                limite: params.limite,
                fecha_desde: tipo === 'regularizacion' ? params.fecha_desde ?? null : null,
                fecha_hasta: tipo === 'regularizacion' ? params.fecha_hasta ?? null : null,
                solo_telefonos: soloTelefonos,
            });

            if (reserva.ok === false) {
                if (reserva.code === 409 && reserva.cause === 'FUERA_DE_HORARIO_CONTACTO') {
                    motivoFin = 'fuera_de_horario';
                } else {
                    estadoFin = 'abortada';
                    motivoFin = 'error';
                }
                console.warn(`[invitaciones] reservar terminó la campaña ${tipo} (status=${reserva.code}, cause=${reserva.cause}).`);
                break;
            }

            const data = reserva.data;
            if (data?.ejecucion_id) resumen.ejecucion_id = data.ejecucion_id;
            const invitaciones: InvitacionReservada[] = Array.isArray(data?.invitaciones) ? data.invitaciones : [];
            resumen.reservadas += invitaciones.length;

            // Crisis: se lee una vez por lote (archivo JSON de runtime), comparando por los últimos 10 dígitos.
            const bloqueados = new Set(
                obtenerBloqueadosPorCrisis()
                    .map((numero) => claveComparacionTelefono(numero))
                    .filter((clave): clave is string => !!clave)
            );

            for (const inv of invitaciones) {
                await procesarInvitacion(inv, bloqueados, campana, campanaEjecucionId, nombrePlantilla, resumen, pausaMs);
            }

            if (data?.motivo_fin) {
                motivoFin = data.motivo_fin;
            } else if (invitaciones.length === 0) {
                // Sin invitaciones y sin motivo_fin: no se insiste (evita un bucle sin avance).
                motivoFin = 'sin_candidatas';
            }
        }

        resumen.estado = estadoFin;
        resumen.motivo_fin = motivoFin;
        return resumen;
    } catch (error) {
        console.error(`[invitaciones] Error inesperado en la campaña ${tipo}:`, (error as any)?.message ?? error);
        resumen.estado = 'abortada';
        resumen.motivo_fin = 'error';
        return resumen;
    } finally {
        try {
            // Paso 5.
            if (resumen.ejecucion_id && (resumen.estado === 'finalizada' || resumen.estado === 'abortada')) {
                const fin = await finalizarEjecucionInvitacion({
                    ejecucion_id: resumen.ejecucion_id,
                    estado: resumen.estado,
                    motivo_fin: resumen.motivo_fin ?? 'error',
                    duracion_ms: Date.now() - inicio,
                });
                if (fin.ok === false) {
                    console.error(`[invitaciones] No se pudo cerrar la ejecución ${resumen.ejecucion_id} (cause=${fin.cause}).`);
                }
            }
            if (campanaEjecucionId) {
                finalizarEjecucionCampana(campana, campanaEjecucionId, {
                    total: resumen.reservadas,
                    exitosos: resumen.enviadas,
                    errores: resumen.errores,
                    origen: params.origen,
                });
            }
            console.log(
                `[invitaciones] Fin campaña ${tipo}: estado=${resumen.estado}, motivo=${resumen.motivo_fin}, ` +
                `ejecucion=${resumen.ejecucion_id ?? '-'}, reservadas=${resumen.reservadas}, enviadas=${resumen.enviadas}, ` +
                `errores=${resumen.errores}, crisis=${resumen.bloqueadas_crisis}`
            );
        } catch (error) {
            console.error('[invitaciones] Error cerrando la campaña:', (error as any)?.message ?? error);
        } finally {
            enCurso.delete(tipo);
        }
    }
}

async function procesarInvitacion(
    inv: InvitacionReservada,
    bloqueados: Set<string>,
    campana: CampanaTraza,
    campanaEjecucionId: string | undefined,
    nombrePlantilla: string,
    resumen: ResumenEjecucionInvitacion,
    pausaMs: number
): Promise<void> {
    if (!inv?.invitacion_id) return;
    const clave = claveComparacionTelefono(inv.telefono);
    if (clave && bloqueados.has(clave)) {
        resumen.bloqueadas_crisis += 1;
        const registro = await registrarEnvioInvitacion({ invitacion_id: inv.invitacion_id, exito: false, motivo: 'bloqueado_crisis' });
        if (registro.ok === false) {
            console.error(`[invitaciones] registrar-envio (crisis) falló para ${inv.invitacion_id} (cause=${registro.cause}).`);
        }
        return;
    }

    anotarCampanaDeInvitacion(inv.invitacion_id, campana);
    const envio = await enviarPlantillaInvitacionListaEspera(inv, campanaEjecucionId, campana);
    if (envio.exito) resumen.enviadas += 1;
    else resumen.errores += 1;

    const registro = await registrarEnvioInvitacion(
        envio.exito
            ? {
                invitacion_id: inv.invitacion_id,
                exito: true,
                plantilla: nombrePlantilla,
                ...(envio.mensajeWaId ? { mensaje_wa_id: envio.mensajeWaId } : {}),
            }
            : {
                invitacion_id: inv.invitacion_id,
                exito: false,
                plantilla: nombrePlantilla,
                ...(envio.errorCode ? { error_code: envio.errorCode } : {}),
                ...(envio.errorTitulo ? { error_titulo: envio.errorTitulo } : {}),
            }
    );
    if (registro.ok === false) {
        // La fila queda 'pendiente'; la siguiente ejecución la resuelve con finalizar-sin-respuesta (H3).
        console.error(`[invitaciones] registrar-envio falló para ${inv.invitacion_id} (cause=${registro.cause}).`);
    }
    await dormir(pausaMs);
}
