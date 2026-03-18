import { addKeyword } from '@builderbot/bot';
import {
    obtenerCitasPendientesPorFecha,
    enviarPlantillaRecordatorio,
    registrarActividadBot
} from '../../../services/apiService';

import { esNumeroAutorizado } from '../../../constants/authConstants';
import { extraerFechaDelComando } from '../../../utils/dateValidator';
import { isNumberValid } from '../../../constants/killSwichConstants';
import { esBotHabilitado } from '../../../services/citasService';

/**
 * Función core que ejecuta la campaña de recordatorio para una fecha específica.
 * Puede ser llamada desde el flujo de WhatsApp o desde un endpoint HTTP.
 * @param fechaFormateada - Fecha en formato DD/MM/YYYY
 * @param origen - Origen de la ejecución ('whatsapp' o 'endpoint')
 * @returns Objeto con resultados de la ejecución
 */
export const ejecutarCampahnaRecordatorioPorFecha = async (
    fechaFormateada: string,
    origen: 'whatsapp' | 'endpoint' = 'whatsapp'
) => {
    try {
        console.log(`🔄 Ejecutando campaña de recordatorio para fecha: ${fechaFormateada} (origen: ${origen})`);

        // 1. Consultar citas pendientes para la fecha especificada
        const citasPendientes = await obtenerCitasPendientesPorFecha(fechaFormateada);

        if (citasPendientes.length === 0) {
            console.log(`ℹ️ No se encontraron citas pendientes para la fecha ${fechaFormateada}`);
            return {
                success: true,
                fecha: fechaFormateada,
                total_procesados: 0,
                exitosos: 0,
                errores: 0,
                mensaje: `No se encontraron citas pendientes para la fecha ${fechaFormateada}`
            };
        }

        console.log(`📋 Se encontraron ${citasPendientes.length} citas pendientes. Iniciando envío de recordatorios...`);

        // 2. Procesar cada cita
        let exitosos = 0;
        let errores = 0;
        const resultadosDetalle = [];

        for (const cita of citasPendientes) {
            try {
                const response = await enviarPlantillaRecordatorio(cita);
                const resultado = {
                    paciente: cita.nombre_paciente,
                    telefono: cita.telefono_paciente,
                    estado: 'error'
                };

                if (response.exito) {
                    await registrarActividadBot('campahna_recordatorio', cita.telefono_paciente, {
                        estado: 'enviado',
                        resultado: 'exitoso',
                        campahna: 'meta-recordatorio-' + fechaFormateada,
                        fecha_campahna: fechaFormateada,
                        origen
                    });
                    exitosos++;
                    resultado.estado = 'exitoso';
                } else {
                    await registrarActividadBot('campahna_recordatorio', cita.telefono_paciente, {
                        estado: 'no_enviado',
                        resultado: 'error',
                        campahna: 'meta-recordatorio-' + fechaFormateada,
                        fecha_campahna: fechaFormateada,
                        origen
                    });
                    errores++;
                }
                resultadosDetalle.push(resultado);

                // Pausa entre envíos
                await new Promise(resolve => setTimeout(resolve, 10000));

            } catch (error) {
                console.error(`❌ Error procesando cita de ${cita.nombre_paciente}:`, error);
                errores++;
                try {
                    await registrarActividadBot('campahna_recordatorio', cita.telefono_paciente, {
                        estado: 'error_excepcion',
                        resultado: 'error',
                        error_detalle: error instanceof Error ? error.message : String(error),
                        campahna: 'meta-recordatorio-' + fechaFormateada,
                        fecha_campahna: fechaFormateada,
                        origen
                    });
                } catch (e) {
                    console.error('Error registrando error en DB', e);
                }
                resultadosDetalle.push({
                    paciente: cita.nombre_paciente,
                    telefono: cita.telefono_paciente,
                    estado: 'error_excepcion',
                    error: String(error)
                });
            }
        }

        // 3. Registrar resumen final
        await registrarActividadBot('campahna_recordatorio', 'EJECUCION_CAMPAHNA', {
            estado: 'finalizado',
            campahna: 'meta-recordatorio-' + fechaFormateada,
            fecha_campahna: fechaFormateada,
            envios_exitosos: exitosos,
            envios_errores: errores,
            total_procesados: citasPendientes.length,
            origen
        });

        return {
            success: true,
            fecha: fechaFormateada,
            total_procesados: citasPendientes.length,
            exitosos,
            errores,
            detalles: resultadosDetalle
        };

    } catch (error) {
        console.error('Error ejecutando campaña recordatorio:', error);
        return {
            success: false,
            error: 'Error interno al procesar la campaña',
            detalle: error instanceof Error ? error.message : String(error)
        };
    }
};

const ejecutarCampahnaRecordatorioFlow = addKeyword(['recordatorio'])
    .addAction(async (ctx, ctxFn) => {
        const numeroRemitente = ctx.from;
        const mensajeCompleto = ctx.body;

        if (!esNumeroAutorizado(numeroRemitente)) {
            await ctxFn.flowDynamic('No entiendo que has dicho.');
            return ctxFn.endFlow();
        }

        if (!isNumberValid(numeroRemitente) && !esBotHabilitado()) {
            await ctxFn.flowDynamic(
                'El servicio no está disponible temporalmente.' +
                'Intenta más tarde.'
            );
            return ctxFn.endFlow();
        }

        // Extraer y validar la fecha del comando
        const fechaFormateada = extraerFechaDelComando(mensajeCompleto, 'recordatorio');
        console.log(`Fecha extraída: ${fechaFormateada}`);

        if (!fechaFormateada) {
            await ctxFn.flowDynamic(
                '❌ Formato incorrecto. Usa: *Recordatorio DD/MM/YYYY*\n' +
                'Ejemplo: recordatorio 2/8/2025'
            );
            return;
        }

        await ctxFn.flowDynamic(`🔄 Procesando campaña de recordatorio para la fecha: ${fechaFormateada}`);

        // Ejecutar la campaña usando la función extraída
        const resultado = await ejecutarCampahnaRecordatorioPorFecha(fechaFormateada, 'whatsapp');

        if (!resultado.success) {
            await ctxFn.flowDynamic(
                '❌ Error interno al procesar la campaña. ' +
                'Revisa los logs para más detalles.'
            );
            return;
        }

        if (resultado.total_procesados === 0) {
            await ctxFn.flowDynamic(`ℹ️ ${resultado.mensaje}`);
            return;
        }

        // Reporte final
        const mensaje = `
📊 *Reporte de Campaña Recordatorio Completado*
📅 Fecha: ${resultado.fecha}
✅ Exitosos: ${resultado.exitosos}
❌ Errores: ${resultado.errores}
📱 Total procesados: ${resultado.total_procesados}
        `.trim();

        await ctxFn.flowDynamic(mensaje);
    });

export { ejecutarCampahnaRecordatorioFlow };
