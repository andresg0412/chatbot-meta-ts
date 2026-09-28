import { instanteBogota } from './fechaHora';

/**
 * Devuelve las citas cuya fecha y hora (interpretadas en hora de Colombia, UTC-5, sin depender de la
 * zona horaria del proceso) todavía no han pasado respecto a `ahora`. Las citas con fecha/hora vacía o
 * malformada se descartan; nunca lanza.
 */
export async function obtenerCitasValidas(citas: any, ahora: Date) {
    if (!Array.isArray(citas)) return [];
    const ahoraMs = ahora.getTime();
    return citas.filter((cita: any) => {
        if (!cita) return false;
        const instante = instanteBogota(cita.fecha_cita, cita.hora_cita);
        return instante !== null && instante > ahoraMs;
    });
}
