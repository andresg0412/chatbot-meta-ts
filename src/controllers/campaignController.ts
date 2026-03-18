import {
    obtenerCitasConfirmadas,
    enviarPlantillaDiaria,
    registrarActividadBot
} from '../services/apiService';
import { AgendaPendienteResponse } from '../interfaces/IReagendarCita';

/**
 * Ejecuta la campaña diaria para la fecha actual.
 * Este endpoint es llamado por un cron job.
 */
export const executeDailyCampaign = async (req, res) => {
    try {
        // Obtener fecha actual en formato DD/MM/YYYY
        // Nota: Asegurarse de que ser servidor tenga la zona horaria correcta o ajustar manualmente
        const now = new Date();
        const optionsTime: Intl.DateTimeFormatOptions = {
            timeZone: 'America/Bogota',
            hour: 'numeric',
            hour12: false
        };
        const optionsDate: Intl.DateTimeFormatOptions = {
            timeZone: 'America/Bogota',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        };

        const currentHour = parseInt(new Intl.DateTimeFormat('en-US', optionsTime).format(now));

        // Generar fecha en formato YYYY-MM-DD para el backend
        const dateParts = new Intl.DateTimeFormat('en-CA', optionsDate).format(now);
        const fechaFormateada = dateParts; // en-CA locale genera formato YYYY-MM-DD
        // This usually gives 'd/m/yyyy' or 'dd/mm/yyyy' depending on locale implementation in Node.
        // If Node runs in UTC it might be different date. 
        // PRO TIP: To be safe about timezone "current daily", we should probably use a library or offset.
        // For now I'll assume server local time is correct or UTC is acceptable.

        console.log(`🔄 Ejecutando campaña diaria automática para fecha: ${fechaFormateada}`);
        console.log(`Hora actual: ${currentHour}`);

        //debemos es obtener las citas con estado confirmado

        const citasConfirmadasDia: AgendaPendienteResponse[] = await obtenerCitasConfirmadas(fechaFormateada);
        //de las citas obtenidas debemos obtener solo las que la hora sea 2 horas posterior a la actual, ejemplo si son las 9:10 am, entonces se obtienen solo las citas entre las 11:00 y las 11:59

        const citasFiltradas = citasConfirmadasDia.filter(cita => {
            //la cita trae hora_cita en formato como 11:00:00

            const horaCita = parseInt(cita.hora_cita.split(':')[0]);
            const horaActual = currentHour;
            if (horaActual === 6) {
                return horaCita === horaActual + 1;
            }
            if (horaActual === 7) {
                return horaCita === horaActual + 1 || horaCita === horaActual + 2;
            }
            return horaCita === horaActual + 2;
        });

        if (citasFiltradas.length === 0) {
            console.log(`ℹ️ No se encontraron citas pendientes para la fecha ${fechaFormateada}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                message: 'No existen citas pendientes para hoy',
                fecha: fechaFormateada,
                count: 0
            }));
        }

        console.log(`📋 Se encontraron ${citasFiltradas.length} citas pendientes. Iniciando envío...`);

        let exitosos = 0;
        let errores = 0;
        const resultadosDetalle = [];

        // Procesar citas
        for (const cita of citasFiltradas) {
            try {
                const response = await enviarPlantillaDiaria(cita);
                const resultado = {
                    paciente: cita.nombre_paciente,
                    telefono: cita.telefono_paciente,
                    estado: 'error'
                };

                if (response.exito) {
                    await registrarActividadBot('campahna_envio_cron', cita.telefono_paciente, {
                        estado: 'enviado',
                        resultado: 'exitoso',
                        campahna: 'meta-diaria-' + fechaFormateada,
                        fecha_campahna: fechaFormateada,
                        origen: 'cron'
                    });
                    exitosos++;
                    resultado.estado = 'exitoso';
                } else {
                    await registrarActividadBot('campahna_envio_cron', cita.telefono_paciente, {
                        estado: 'no_enviado',
                        resultado: 'error',
                        campahna: 'meta-diaria-' + fechaFormateada,
                        fecha_campahna: fechaFormateada,
                        origen: 'cron'
                    });
                    errores++;
                }
                resultadosDetalle.push(resultado);

                // Pequeña pausa para no saturar
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                console.error(`❌ Error procesando cita de ${cita.nombre_paciente}:`, error);
                errores++;
                try {
                    await registrarActividadBot('campahna_envio_cron', cita.telefono_paciente, {
                        estado: 'error_excepcion',
                        resultado: 'error',
                        error_detalle: error instanceof Error ? error.message : String(error),
                        campahna: 'meta-diaria-' + fechaFormateada,
                        fecha_campahna: fechaFormateada,
                        origen: 'cron'
                    });
                } catch (e) { console.error('Error registrando error en DB', e) }
                resultadosDetalle.push({
                    paciente: cita.nombre_paciente,
                    telefono: cita.telefono_paciente,
                    estado: 'error_excepcion',
                    error: String(error)
                });
            }
        }

        // Registrar resumen final
        await registrarActividadBot('campahna_envio_cron', 'EJECUCION_CAMPAHNA_DIARIA', {
            estado: 'finalizado',
            campahna: 'meta-diaria-' + fechaFormateada,
            fecha_campahna: fechaFormateada,
            envios_exitosos: exitosos,
            envios_errores: errores,
            total_procesados: citasFiltradas.length
        });

        const resumen = {
            fecha: fechaFormateada,
            total_procesados: citasFiltradas.length,
            exitosos,
            errores,
            detalles: resultadosDetalle
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(resumen));

    } catch (error) {
        console.error('Error crítico ejecutando campaña diaria:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Error interno ejecutando campaña', detalle: String(error) }));
    }
};

