// Avisos de texto libre al asesor humano (canales CANAL_ESCALAMIENTO_CRISIS /
// CANAL_ESCALAMIENTO_LISTA_ESPERA) con registro de fallos — runbook B6,
// proyecto-ips/docs/features/2026-09-26-lista-espera-runbook-produccion.md.
//
// Contexto: WhatsApp Cloud API solo entrega texto libre dentro de la ventana de 24h desde el último
// mensaje de ese número. Decisión de German: NO se crea una plantilla de alerta interna; en su lugar,
// cada aviso que falle queda registrado en chat_stats (`tipo_evento = 'aviso_asesor_fallido'`) para
// que se pueda detectar y gestionar.
//
// Un fallo puede llegar por dos caminos:
// 1. Síncrono: Graph API responde con error HTTP (token, número inválido, rate limit...). Se captura
//    porque el envío se hace directo con axios (`enviarMensajeTextoMeta`), no con el provider (el
//    provider de Meta no propaga errores al llamador).
// 2. Asíncrono: Graph API acepta el mensaje (HTTP 200) y después llega un webhook de estado `failed`
//    (caso típico: 131047, ventana de 24h cerrada). `@builderbot/provider-meta` convierte ese webhook
//    en un evento 'notice' del provider con `instructions[0] = "Number(<recipient_id>): <detalle>"`
//    — sin id de mensaje. Se correlaciona por número de destino contra los avisos enviados en los
//    últimos AVISO_PENDIENTE_TTL_MS. Si ese mismo número tuviera otro mensaje fallido en esa ventana,
//    se atribuiría a este aviso (aceptable: el canal es un número interno del equipo).
//
// Metadata registrada: tipo de aviso, referencia (teléfono del paciente enmascarado o id del cupo),
// error resumido. Nunca el texto del aviso ni contenido del paciente.

import { enviarMensajeTextoMeta, registrarActividadBot } from '../services/apiService';
import { claveComparacionTelefono, enmascararTelefono } from './telefono';

export type TipoAvisoAsesor = 'crisis' | 'escalamiento_lista_espera';

const AVISO_PENDIENTE_TTL_MS = 30 * 60 * 1000;

interface AvisoPendiente {
    tipo: TipoAvisoAsesor;
    referencia: string;
    canalEnmascarado: string;
    canal: string;
    mensajeWaId?: string;
    enviadoAt: number;
}

/** Avisos aceptados por Meta a la espera de un posible webhook de fallo, por clave de teléfono. */
const avisosPendientes = new Map<string, AvisoPendiente[]>();

function limpiarPendientesVencidos(ahora: number = Date.now()): void {
    for (const [clave, lista] of avisosPendientes.entries()) {
        const vigentes = lista.filter((a) => ahora - a.enviadoAt <= AVISO_PENDIENTE_TTL_MS);
        if (vigentes.length) avisosPendientes.set(clave, vigentes);
        else avisosPendientes.delete(clave);
    }
}

async function registrarFallo(
    aviso: { tipo: TipoAvisoAsesor; referencia: string; canal: string },
    fase: 'envio' | 'estado_webhook' | 'canal_no_configurado',
    error: { http_status?: number | null; code?: number | string | null; mensaje?: string }
): Promise<void> {
    console.error(
        `[avisoAsesor] Aviso '${aviso.tipo}' al asesor NO entregado (fase: ${fase}, ref: ${aviso.referencia}, ` +
        `código: ${error.code ?? 'n/a'}): ${error.mensaje ?? ''}`
    );
    await registrarActividadBot('aviso_asesor_fallido', aviso.canal ? enmascararTelefono(aviso.canal) : 'sin_canal', {
        tipo_aviso: aviso.tipo,
        referencia: aviso.referencia,
        fase,
        http_status: error.http_status ?? null,
        error_code: error.code ?? null,
        error_resumen: (error.mensaje ?? '').slice(0, 200)
    }).catch(() => false);
}

/**
 * Envía un aviso de texto libre al asesor. Nunca lanza. Devuelve true si Meta aceptó el envío (un
 * fallo asíncrono posterior se registra igual vía `procesarNoticeProvider`).
 *
 * `referencia` NO debe contener datos clínicos ni el teléfono completo del paciente: usar el teléfono
 * enmascarado (`enmascararTelefono`) o un id interno (p. ej. `cupo:<id>`).
 */
export async function enviarAvisoAsesor(params: {
    tipo: TipoAvisoAsesor;
    canal: string | undefined | null;
    mensaje: string;
    referencia: string;
}): Promise<boolean> {
    const canal = (params.canal ?? '').trim();
    if (!canal) {
        await registrarFallo({ tipo: params.tipo, referencia: params.referencia, canal: '' }, 'canal_no_configurado', {
            mensaje: 'variable de entorno del canal de escalamiento vacía'
        });
        return false;
    }

    const resultado = await enviarMensajeTextoMeta(canal, params.mensaje);
    if (!resultado.exito) {
        await registrarFallo({ tipo: params.tipo, referencia: params.referencia, canal }, 'envio', resultado.error ?? {});
        return false;
    }

    const clave = claveComparacionTelefono(canal);
    if (clave) {
        limpiarPendientesVencidos();
        const lista = avisosPendientes.get(clave) ?? [];
        lista.push({
            tipo: params.tipo,
            referencia: params.referencia,
            canal,
            canalEnmascarado: enmascararTelefono(canal),
            mensajeWaId: resultado.mensajeWaId,
            enviadoAt: Date.now()
        });
        avisosPendientes.set(clave, lista);
    }
    return true;
}

/**
 * Listener para `adapterProvider.on('notice', ...)`. `@builderbot/provider-meta` emite 'notice' con
 * `{ title, instructions: ["Number(<recipient_id>): <detalle>"] }` cuando llega un webhook de estado
 * `failed`. Si el número coincide con un aviso al asesor reciente, se registra el fallo.
 */
export function procesarNoticeProvider(payload: any): void {
    try {
        const instrucciones: unknown[] = Array.isArray(payload?.instructions) ? payload.instructions : [];
        for (const instruccion of instrucciones) {
            const match = /Number\(([^)]*)\):\s*(.*)$/s.exec(String(instruccion ?? ''));
            if (!match) continue;
            const clave = claveComparacionTelefono(match[1]);
            if (!clave) continue;
            limpiarPendientesVencidos();
            const pendientes = avisosPendientes.get(clave);
            if (!pendientes || pendientes.length === 0) continue;
            avisosPendientes.delete(clave);
            for (const aviso of pendientes) {
                registrarFallo(aviso, 'estado_webhook', { code: 'status_failed', mensaje: match[2] }).catch(() => undefined);
            }
        }
    } catch (error) {
        console.error('[avisoAsesor] Error procesando notice del provider:', error);
    }
}

/** Solo para pruebas. */
export function _resetAvisosPendientesParaPruebas(): void {
    avisosPendientes.clear();
}
