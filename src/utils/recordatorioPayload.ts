export type AccionPayloadRecordatorio = 'C' | 'X' | 'N';
export const REGEX_PAYLOAD_RECORDATORIO = /^LEREC:([A-Za-z0-9]{8}):([CXN])$/;

export function construirPayloadRecordatorio(citaId: string, accion: AccionPayloadRecordatorio): string {
    const payload = `LEREC:${citaId}:${accion}`;
    if (!REGEX_PAYLOAD_RECORDATORIO.test(payload)) throw new Error('cita_id inválido para payload de recordatorio');
    return payload;
}

export function parsearPayloadRecordatorio(payload: unknown): { citaId: string; accion: AccionPayloadRecordatorio } | null {
    if (typeof payload !== 'string') return null;
    const match = REGEX_PAYLOAD_RECORDATORIO.exec(payload);
    return match ? { citaId: match[1], accion: match[2] as AccionPayloadRecordatorio } : null;
}
