import { addKeyword, EVENTS } from '@builderbot/bot';

import {
  //marcarCitaComoEnviada,
  buscarCitaPorCelular,
  confirmarCitaPorCedula,
  Cita
} from '../../../services/citasService';
import {
  obtenerCitasProgramadas,
  enviarPlantillaConfirmacion,
  confirmarCitaCampahna,
  enviarPlantillaRecordatorio24h
} from '../../../services/apiService';

import { esNumeroAutorizado } from '../../../constants/authConstants';
import { extraerFechaDelComando } from '../../../utils/dateValidator';
import { isNumberValid } from '../../../constants/killSwichConstants';
import { esBotHabilitado } from '../../../services/citasService';
import { registrarActividadBot } from '../../../services/apiService';
import { sanitizeString, isValidDocumentNumber } from '../../../utils/sanitize';

/**
 * Función core que ejecuta la campaña de confirmación para una fecha específica.
 * Puede ser llamada desde el flujo de WhatsApp o desde un endpoint HTTP.
 * @param fechaFormateada - Fecha en formato DD/MM/YYYY
 * @param origen - Origen de la ejecución ('whatsapp' o 'endpoint')
 * @returns Objeto con resultados de la ejecución
 */
export const ejecutarCampahnaConfirmacionPorFecha = async (
  fechaFormateada: string,
  origen: 'whatsapp' | 'endpoint' = 'whatsapp'
) => {
  try {
    console.log(`🔄 Ejecutando campaña de confirmación para fecha: ${fechaFormateada} (origen: ${origen})`);

    // 1. Consultar citas pendientes para la fecha especificada
    const citasProgramadas = await obtenerCitasProgramadas(fechaFormateada);

    if (citasProgramadas.length === 0) {
      console.log(`ℹ️ No se encontraron citas programadas para la fecha ${fechaFormateada}`);
      return {
        success: true,
        fecha: fechaFormateada,
        total_procesados: 0,
        exitosos: 0,
        errores: 0,
        mensaje: `No se encontraron citas programadas para la fecha ${fechaFormateada}`
      };
    }

    console.log(`📋 Se encontraron ${citasProgramadas.length} citas programadas. Iniciando envío...`);

    // 2. Procesar cada cita
    let exitosos = 0;
    let errores = 0;
    const resultadosDetalle = [];

    for (const cita of citasProgramadas) {
      try {
        console.log('Estado Cita: ', cita.estado_agenda);
        let response;
        const resultado = {
          paciente: cita.nombre_paciente,
          telefono: cita.telefono_paciente,
          estado: 'error'
        };
        if (cita.estado_agenda === 'Confirmado') {
          response = await enviarPlantillaRecordatorio24h(cita);
          if (response.exito) {
            await registrarActividadBot('campahna_envio_confirmados_24hrs', cita.telefono_paciente, {
              estado: 'enviado',
              resultado: 'exitoso',
              campahna: 'meta-' + fechaFormateada,
              fecha_campahna: fechaFormateada,
              origen
            });
            exitosos++;
            resultado.estado = 'exitoso';
          } else {
            await registrarActividadBot('campahna_envio_confirmados_24hrs', cita.telefono_paciente, {
              estado: 'no_enviado',
              resultado: 'error',
              campahna: 'meta-' + fechaFormateada,
              fecha_campahna: fechaFormateada,
              origen
            });
            errores++;
          }
        } else if (cita.estado_agenda === 'Pendiente') {
          response = await enviarPlantillaConfirmacion(cita);
          if (response.exito) {
            await registrarActividadBot('campahna_envio', cita.telefono_paciente, {
              estado: 'enviado',
              resultado: 'exitoso',
              campahna: 'meta-' + fechaFormateada,
              fecha_campahna: fechaFormateada,
              origen
            });
            exitosos++;
            resultado.estado = 'exitoso';
          } else {
            await registrarActividadBot('campahna_envio', cita.telefono_paciente, {
              estado: 'no_enviado',
              resultado: 'error',
              campahna: 'meta-' + fechaFormateada,
              fecha_campahna: fechaFormateada,
              origen
            });
            errores++;
          }
        }

        resultadosDetalle.push(resultado);

        // Pausa entre envíos
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ Error procesando cita de ${cita.nombre_paciente}:`, error);
        errores++;
        try {
          await registrarActividadBot('campahna_envio', cita.telefono_paciente, {
            estado: 'error_excepcion',
            resultado: 'error',
            error_detalle: error instanceof Error ? error.message : String(error),
            campahna: 'meta-' + fechaFormateada,
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
    await registrarActividadBot('campahna_envio', 'EJECUCION_CAMPAHNA', {
      estado: 'finalizado',
      campahna: 'meta-' + fechaFormateada,
      fecha_campahna: fechaFormateada,
      envios_exitosos: exitosos,
      envios_errores: errores,
      total_procesados: citasProgramadas.length,
      origen
    });

    return {
      success: true,
      fecha: fechaFormateada,
      total_procesados: citasProgramadas.length,
      exitosos,
      errores,
      detalles: resultadosDetalle
    };

  } catch (error) {
    console.error('Error ejecutando campaña:', error);
    return {
      success: false,
      error: 'Error interno al procesar la campaña',
      detalle: error instanceof Error ? error.message : String(error)
    };
  }
};

const ejecutarPlantillaDiariaFlow = addKeyword(['ejecutar'])
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
    const fechaFormateada = extraerFechaDelComando(mensajeCompleto);
    console.log(`Fecha extraída: ${fechaFormateada}`);

    if (!fechaFormateada) {
      await ctxFn.flowDynamic(
        '❌ Formato incorrecto. Usa: *Ejecutar DD/MM/YYYY*\n' +
        'Ejemplo: ejecutar 2/8/2025'
      );
      return;
    }

    await ctxFn.flowDynamic(`🔄 Procesando campaña para la fecha: ${fechaFormateada}`);

    // Ejecutar la campaña usando la función extraída
    const resultado = await ejecutarCampahnaConfirmacionPorFecha(fechaFormateada, 'whatsapp');

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
📊 *Reporte de Campaña Completado*
📅 Fecha: ${resultado.fecha}
✅ Exitosos: ${resultado.exitosos}
❌ Errores: ${resultado.errores}
📱 Total procesados: ${resultado.total_procesados}
    `.trim();

    await ctxFn.flowDynamic(mensaje);
  });

/**
 * Flow para confirmar citas (respuesta a plantillas)
 */
const confirmarCitaFlow = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, ctxFn) => {
    const celular = ctx.from;
    const fechaFormateada = new Date().toISOString().split('T')[0];
    const numeroDoc = ctxFn.state.getMyState().numeroDoc;
    try {
      const response = await confirmarCitaCampahna(celular, numeroDoc);

      if (response) {
        await ctxFn.flowDynamic('✅ ¡Tu cita ha sido confirmada exitosamente!');
        await ctxFn.flowDynamic('Gracias por confirmar tu cita. Si necesitas más ayuda, no dudes en preguntar. ¡Feliz día!');
        await registrarActividadBot('campahna_envio', celular, {
          estado: 'confirmado',
          resultado: 'exitoso',
          campahna: 'meta-' + fechaFormateada,
          fecha_campahna: fechaFormateada,
        });
        return ctxFn.endFlow();
      } else {
        await ctxFn.flowDynamic('No se han encontrado citas relacionadas a este número de documento. Intentalo nuevamente');
        return ctxFn.gotoFlow(confirmarCitaDocumentoFlow);
      }

    } catch (error) {
      console.error('Error confirmando cita:', error);
      await ctxFn.flowDynamic('❌ Error interno. Intenta nuevamente.');
      return ctxFn.endFlow();
    }
  });

const confirmarCitaDocumentoFlow = addKeyword(['Confirmar cita', 'Confirmar', 'confirmar'])
  .addAnswer('Para confirmar por favor digita el número de documento del paciente 🔢:',
    { capture: true },
    async (ctx, { state, gotoFlow, flowDynamic }) => {
      const numeroDoc = sanitizeString(ctx.body, 20);
      if (!isValidDocumentNumber(numeroDoc)) {
        await flowDynamic('El número de documento ingresado no es válido. Intenta nuevamente.');
        return gotoFlow(confirmarCitaDocumentoFlow);
      }
      await state.update({ numeroDoc });
      return gotoFlow(confirmarCitaFlow);
    }
  );

export { ejecutarPlantillaDiariaFlow, confirmarCitaFlow, confirmarCitaDocumentoFlow };