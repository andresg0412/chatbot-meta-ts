// Trazabilidad de lo que llega desde Meta: mensajes entrantes (`msg_entrante`) y estados de entrega
// (`wa_estado`). Contrato: proyecto-ips/docs/features/2026-09-29-trazabilidad-usuarios.md, 4.3.4 y 11.2.
//
// - `crearListenerMensajeEntrante`: se registra con `adapterProvider.on('message', ...)` DESPUÉS del
//   interceptor de crisis (así `en_blacklist` ya refleja un bloqueo por crisis del mismo mensaje) y
//   ANTES de createBot (corre antes que el flujo, por eso `es_respuesta_esperada` no se puede saber aquí:
//   lo marca después el flujo de respuesta con `campana_respuesta`).
//   NUNCA guarda el texto del paciente (P7): solo tipo, longitud y, en botones/listas, la etiqueta
//   (texto definido por la IPS).
// - `crearMiddlewareEstadosMeta`: middleware global de polka (`adapterProvider.server.use`). Polka corre
//   TODOS los middlewares globales antes del handler de la ruta, y el body ya viene parseado porque
//   @builderbot/bot registra `bodyParser.json()` al construir el servidor (buildHTTPServer), antes que
//   cualquier `use` de app.ts. Lee `entry[].changes[].value.statuses[]` del POST /webhook, encola
//   `wa_estado` y llama a `next()` sin tocar la respuesta del provider (que no se parchea, P4). Solo
//   toma id, status, timestamp, recipient_id y errors[0].code/title: NUNCA `pricing` ni `conversation`.

import { isTrazabilidadV2Enabled, registrarMensajeSesionTraza, trackEvento, uuidV5 } from './trazabilidad';

const ESTADOS_META = new Set(['sent', 'delivered', 'read', 'failed']);

type TipoMensajeTraza =
    | 'text'
    | 'button'
    | 'interactive'
    | 'list'
    | 'image'
    | 'audio'
    | 'document'
    | 'location'
    | 'sticker'
    | 'otro';

interface BotConBlacklist {
    dynamicBlacklist?: { checkIf?: (numero: string) => boolean };
}

/** Clasifica el mensaje normalizado por @builderbot/provider-meta y extrae la etiqueta de botón/lista. */
export function clasificarMensajeEntrante(ctx: any): { tipo: TipoMensajeTraza; len: number; etiqueta: string | null } {
    const tipoProvider = typeof ctx?.type === 'string' ? ctx.type : '';
    const texto = typeof ctx?.body === 'string' ? ctx.body : '';
    switch (tipoProvider) {
        case 'text':
            return { tipo: 'text', len: texto.length, etiqueta: null };
        case 'button': {
            // Botón de respuesta rápida de plantilla: el body es el texto del botón aprobado en Meta.
            const etiqueta = texto || (typeof ctx?.payload === 'string' ? ctx.payload : '') || null;
            return { tipo: 'button', len: etiqueta ? etiqueta.length : 0, etiqueta };
        }
        case 'interactive': {
            if (typeof ctx?.title_list_reply === 'string' && ctx.title_list_reply) {
                return { tipo: 'list', len: ctx.title_list_reply.length, etiqueta: ctx.title_list_reply };
            }
            const etiqueta = typeof ctx?.title_button_reply === 'string' && ctx.title_button_reply ? ctx.title_button_reply : null;
            return { tipo: 'interactive', len: etiqueta ? etiqueta.length : 0, etiqueta };
        }
        case 'image':
        case 'audio':
        case 'document':
        case 'location':
        case 'sticker':
            return { tipo: tipoProvider, len: 0, etiqueta: null };
        default:
            return { tipo: 'otro', len: 0, etiqueta: null };
    }
}

/** Listener de `adapterProvider.on('message')`. Nunca lanza. */
export function crearListenerMensajeEntrante(getBot: () => BotConBlacklist | undefined) {
    return function trazarMensajeEntrante(ctx: any): void {
        try {
            const from: string | undefined = ctx?.from;
            if (!from) return;
            // Contador de mensajes de la sesión (vale también con el interruptor apagado: es estado interno).
            registrarMensajeSesionTraza(from);
            if (!isTrazabilidadV2Enabled()) return;
            const { tipo, len, etiqueta } = clasificarMensajeEntrante(ctx);
            let enBlacklist: boolean | null = null;
            try {
                const checkIf = getBot()?.dynamicBlacklist?.checkIf;
                if (typeof checkIf === 'function') enBlacklist = !!checkIf.call(getBot()?.dynamicBlacklist, from);
            } catch {
                enBlacklist = null;
            }
            trackEvento({
                tipo_evento: 'msg_entrante',
                telefono: from,
                wa_message_id: typeof ctx?.message_id === 'string' ? ctx.message_id : null,
                origen: 'usuario',
                metadata: {
                    tipo_msg: tipo,
                    len,
                    etiqueta_boton: etiqueta,
                    en_blacklist: enBlacklist,
                    es_respuesta_esperada: null,
                },
            });
        } catch (error) {
            console.warn('[trazabilidad] Error registrando mensaje entrante:', (error as any)?.message ?? error);
        }
    };
}

export interface EstadoMetaExtraido {
    waMessageId: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    ocurridoAt: string;
    recipientId: string | null;
    errorCode: string | null;
    errorTitulo: string | null;
}

/** Extrae los estados de un webhook de Meta. Ignora todo lo demás (en particular pricing/conversation). */
export function extraerEstadosWebhook(body: any): EstadoMetaExtraido[] {
    const resultado: EstadoMetaExtraido[] = [];
    const entradas = Array.isArray(body?.entry) ? body.entry : [];
    for (const entrada of entradas) {
        const cambios = Array.isArray(entrada?.changes) ? entrada.changes : [];
        for (const cambio of cambios) {
            const estados = Array.isArray(cambio?.value?.statuses) ? cambio.value.statuses : [];
            for (const estado of estados) {
                const id = typeof estado?.id === 'string' ? estado.id : null;
                const status = typeof estado?.status === 'string' ? estado.status : null;
                if (!id || !status || !ESTADOS_META.has(status)) continue;
                const segundos = Number(estado?.timestamp);
                const ocurridoAt = Number.isFinite(segundos) && segundos > 0
                    ? new Date(segundos * 1000).toISOString()
                    : new Date().toISOString();
                const error0 = Array.isArray(estado?.errors) ? estado.errors[0] : undefined;
                resultado.push({
                    waMessageId: id,
                    status: status as EstadoMetaExtraido['status'],
                    ocurridoAt,
                    recipientId: estado?.recipient_id ? String(estado.recipient_id) : null,
                    errorCode: error0?.code !== undefined && error0?.code !== null ? String(error0.code) : null,
                    errorTitulo: typeof error0?.title === 'string' ? error0.title.slice(0, 100) : null,
                });
            }
        }
    }
    return resultado;
}

/** Encola un `wa_estado` por cada estado del webhook (evento_uid = UUIDv5 de `wa_message_id:status`). */
export function registrarEstadosWebhook(body: any): number {
    if (!isTrazabilidadV2Enabled()) return 0;
    const estados = extraerEstadosWebhook(body);
    for (const estado of estados) {
        trackEvento({
            evento_uid: uuidV5(`${estado.waMessageId}:${estado.status}`),
            tipo_evento: 'wa_estado',
            ocurrido_at: estado.ocurridoAt,
            telefono: estado.recipientId,
            sesion_id: null,
            wa_message_id: estado.waMessageId,
            resultado: estado.status,
            origen: 'sistema',
            metadata: { error_code: estado.errorCode, error_titulo: estado.errorTitulo },
        });
    }
    return estados.length;
}

/** Middleware de polka para `adapterProvider.server.use(...)`. Siempre llama a `next()`. */
export function crearMiddlewareEstadosMeta() {
    return function middlewareEstadosMeta(req: any, _res: any, next: (err?: any) => void) {
        try {
            if (req?.method === 'POST' && isTrazabilidadV2Enabled()) {
                const ruta = typeof req?.path === 'string' ? req.path : String(req?.url ?? '').split('?')[0];
                if (ruta === '/webhook' && req?.body && typeof req.body === 'object') {
                    registrarEstadosWebhook(req.body);
                }
            }
        } catch (error) {
            console.warn('[trazabilidad] Error leyendo estados del webhook:', (error as any)?.message ?? error);
        }
        return next();
    };
}
