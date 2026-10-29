// Único punto de salida hacia la Graph API (`/{numberId}/messages`) por fuera de la cola del provider.
// Historial de mensajes del panel (proyecto-ips/docs/features/2026-10-29-historial-mensajes-panel.md, 5.4):
// en vez de un interceptor global de axios (el provider importa su propio axios y se capturaría doble o según
// cómo esté instalado el paquete), cada envío de apiService.ts pasa por esta función, que:
//   - hace exactamente el mismo `axios.post(url, body, config)` de siempre y devuelve la MISMA respuesta;
//   - si falla, relanza el MISMO error (el contrato de las `enviarPlantilla*` no cambia);
//   - registra el mensaje en el historial de forma síncrona y sin lanzar (con la bandera apagada no hace nada).
import axios, { AxiosRequestConfig } from 'axios';
import { codigoErrorGraph, ContextoSaliente, registrarSalienteDesdeBody } from '../utils/historialMensajes';

/**
 * @param ctx origen (`campana` para las plantillas de campañas y recordatorios; `sistema` para avisos internos),
 *            código corto de campaña (CampanaTraza) y nombre de plantilla si se conoce.
 */
export async function postGraph(url: string, body: any, config?: AxiosRequestConfig, ctx: ContextoSaliente = {}) {
    const inicio = new Date().toISOString();
    try {
        const response = await axios.post(url, body, config);
        registrarSalienteDesdeBody(body, { waMessageId: response?.data?.messages?.[0]?.id ?? null, estado: 'aceptado', ocurridoAt: inicio }, ctx);
        return response;
    } catch (error) {
        registrarSalienteDesdeBody(body, { waMessageId: null, estado: 'error_api', errorCode: codigoErrorGraph(error), ocurridoAt: inicio }, ctx);
        throw error;
    }
}
