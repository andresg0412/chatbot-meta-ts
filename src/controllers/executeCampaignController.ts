import { ejecutarCampahnaConfirmacionPorFecha } from '../templates/flujos/campahna/ejecutarCampahna';

/**
 * Ejecuta la campaña de confirmación para una fecha específica.
 * Este endpoint puede ser llamado manualmente o por un cron job.
 * 
 * @param req - Request con body opcional: { fecha?: string }
 *              - Si no se proporciona fecha, se usa la fecha actual + 1 día
 *              - Formato aceptado: DD/MM/YYYY o YYYY-MM-DD
 * @param res - Response con resultado de la ejecución
 */
export const executeConfirmationCampaign = async (req, res) => {
    try {
        let fechaFormateada: string;

        // Si se proporciona fecha en el body, usarla
        if (req.body && req.body.fecha) {
            const fechaInput = req.body.fecha;

            // Validar y convertir formato si es necesario
            // Aceptar DD/MM/YYYY o YYYY-MM-DD
            if (fechaInput.includes('/')) {
                // Convertir de DD/MM/YYYY a YYYY-MM-DD
                const [day, month, year] = fechaInput.split('/');
                fechaFormateada = `${year}-${month}-${day}`;
            } else if (fechaInput.includes('-')) {
                // Ya está en formato YYYY-MM-DD
                fechaFormateada = fechaInput;
            } else {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                    error: 'Formato de fecha inválido. Use DD/MM/YYYY o YYYY-MM-DD'
                }));
            }
        } else {
            // Si no se proporciona fecha, usar fecha actual + 1 día
            const now = new Date();
            const optionsDate: Intl.DateTimeFormatOptions = {
                timeZone: 'America/Bogota',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            };

            // Sumar 1 día a la fecha actual
            const fechaObjetivo = new Date(now);
            fechaObjetivo.setDate(fechaObjetivo.getDate() + 1);

            // Formatear en YYYY-MM-DD usando Intl para respetar la zona horaria
            const formatter = new Intl.DateTimeFormat('es-CO', optionsDate);
            const parts = formatter.formatToParts(fechaObjetivo);
            const year = parts.find(p => p.type === 'year')?.value;
            const month = parts.find(p => p.type === 'month')?.value;
            const day = parts.find(p => p.type === 'day')?.value;
            fechaFormateada = `${year}-${month}-${day}`;

            console.log(`📅 No se proporcionó fecha. Usando fecha actual + 1 día: ${fechaFormateada}`);
        }

        console.log(`🔄 Ejecutando campaña de confirmación vía endpoint para fecha: ${fechaFormateada}`);

        // Ejecutar la campaña usando la función compartida
        const resultado = await ejecutarCampahnaConfirmacionPorFecha(fechaFormateada, 'endpoint');

        if (!resultado.success) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                error: resultado.error,
                detalle: resultado.detalle
            }));
        }

        // Respuesta exitosa
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            message: 'Campaña de confirmación ejecutada',
            fecha: resultado.fecha,
            total_procesados: resultado.total_procesados,
            exitosos: resultado.exitosos,
            errores: resultado.errores,
            detalles: resultado.detalles
        }));

    } catch (error) {
        console.error('Error crítico ejecutando campaña de confirmación:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            error: 'Error interno ejecutando campaña',
            detalle: String(error)
        }));
    }
};
