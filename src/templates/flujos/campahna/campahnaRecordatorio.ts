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

        // 2. Extraer y validar la fecha del comando
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

        try {
            // 3. Consultar citas pendientes para la fecha especificada
            const citasPendientes = await obtenerCitasPendientesPorFecha(fechaFormateada);

            if (citasPendientes.length === 0) {
                await ctxFn.flowDynamic(`ℹ️ No se encontraron citas pendientes para la fecha ${fechaFormateada}`);
                return;
            }

            await ctxFn.flowDynamic(`📋 Se encontraron ${citasPendientes.length} citas pendientes. Iniciando envío de recordatorios...`);

            // 4. Procesar cada cita
            let exitosos = 0;
            let errores = 0;

            for (const cita of citasPendientes) {
                try {
                    //enviar plantilla con metodo POST
                    const response = await enviarPlantillaRecordatorio(cita);
                    if (response.exito) {
                        await registrarActividadBot('campahna_recordatorio', cita.telefono_paciente, {
                            estado: 'enviado',
                            resultado: 'exitoso',
                            campahna: 'meta-recordatorio-' + fechaFormateada,
                            fecha_campahna: fechaFormateada,
                        });
                        exitosos++;
                    } else {
                        await registrarActividadBot('campahna_recordatorio', cita.telefono_paciente, {
                            estado: 'no_enviado',
                            resultado: 'error',
                            campahna: 'meta-recordatorio-' + fechaFormateada,
                            fecha_campahna: fechaFormateada,
                        });
                        errores++;
                    }
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
                        });
                    } catch (e) { console.error('Error registrando error en DB', e) }
                }
            }

            // 5. Reporte final
            const mensaje = `
📊 *Reporte de Campaña Recordatorio Completado*
📅 Fecha: ${fechaFormateada}
✅ Exitosos: ${exitosos}
❌ Errores: ${errores}
📱 Total procesados: ${citasPendientes.length}
            `.trim();

            await ctxFn.flowDynamic(mensaje);
            await registrarActividadBot('campahna_recordatorio', 'EJECUCION_CAMPAHNA', {
                estado: 'finalizado',
                campahna: 'meta-recordatorio-' + fechaFormateada,
                fecha_campahna: fechaFormateada,
                envios_exitosos: exitosos,
                envios_errores: errores,
                total_procesados: citasPendientes.length
            });

        } catch (error) {
            console.error('Error ejecutando campaña recordatorio:', error);
            await ctxFn.flowDynamic(
                '❌ Error interno al procesar la campaña. ' +
                'Revisa los logs para más detalles.'
            );
        }
    });

export { ejecutarCampahnaRecordatorioFlow };
