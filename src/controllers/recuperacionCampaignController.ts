import { ejecutarCampahnaRecuperacionCore } from '../templates/flujos/campahna/campahnaRecuperacion';

/**
 * Ejecuta la campaña de recuperación de pacientes sin asistencia.
 * Este endpoint puede ser llamado manualmente o por un cron job.
 *
 * POST /v1/campaigns/recuperacion
 * Body: (vacío, no requiere parámetros)
 */
export const executeRecuperacionCampaign = async (req, res) => {
    try {
        console.log('🔄 Ejecutando campaña de recuperación vía endpoint...');

        const resultado = await ejecutarCampahnaRecuperacionCore('endpoint');

        if (!resultado.success) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                error: resultado.error,
                detalle: resultado.detalle
            }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            message: 'Campaña de recuperación ejecutada',
            fecha: resultado.fecha,
            total_procesados: resultado.total_procesados,
            exitosos: resultado.exitosos,
            errores: resultado.errores,
            detalles: resultado.detalles ?? []
        }));

    } catch (error) {
        console.error('Error crítico ejecutando campaña de recuperación:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            error: 'Error interno ejecutando campaña',
            detalle: String(error)
        }));
    }
};
