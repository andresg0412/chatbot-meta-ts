import { addKeyword, EVENTS } from '@builderbot/bot';

import {
  //marcarCitaComoEnviada,
  buscarCitaPorCelular,
  confirmarCitaPorCedula,
  Cita
} from '../../../services/citasService';
import {
  obtenerCitasPendientesPorFecha,
  enviarPlantillaConfirmacion,
  confirmarCitaCampahna
} from '../../../services/apiService';

import { esNumeroAutorizado } from '../../../constants/authConstants';
import { extraerFechaDelComando } from '../../../utils/dateValidator';
import { isNumberValid } from '../../../constants/killSwichConstants';
import { esBotHabilitado } from '../../../services/citasService';
import { registrarActividadBot } from '../../../services/apiService';
import { sanitizeString, isValidDocumentNumber } from '../../../utils/sanitize';


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

    // 2. Extraer y validar la fecha del comando
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

    try {
      // 3. Consultar citas pendientes para la fecha especificada
      const citasPendientes = await obtenerCitasPendientesPorFecha(fechaFormateada);

      if (citasPendientes.length === 0) {
        await ctxFn.flowDynamic(`ℹ️ No se encontraron citas pendientes para la fecha ${fechaFormateada}`);
        return;
      }

      await ctxFn.flowDynamic(`📋 Se encontraron ${citasPendientes.length} citas pendientes. Iniciando envío...`);

      // 4. Procesar cada cita
      let exitosos = 0;
      let errores = 0;

      for (const cita of citasPendientes) {
        try {
          //enviar plantilla con metodo POST
          const response = await enviarPlantillaConfirmacion(cita);
          if (response.exito) {
            await registrarActividadBot('campahna_envio', cita.telefono_paciente, {
              estado: 'enviado',
              resultado: 'exitoso',
              campahna: 'meta-' + fechaFormateada,
              fecha_campahna: fechaFormateada,
            });
            exitosos++;
          } else {
            await registrarActividadBot('campahna_envio', cita.telefono_paciente, {
              estado: 'no_enviado',
              resultado: 'error',
              campahna: 'meta-' + fechaFormateada,
              fecha_campahna: fechaFormateada,
            });
            errores++;
          }
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
            });
          } catch (e) { console.error('Error registrando error en DB', e) }
        }
      }

      // 5. Reporte final
      const mensaje = `
📊 *Reporte de Campaña Completado*
📅 Fecha: ${fechaFormateada}
✅ Exitosos: ${exitosos}
❌ Errores: ${errores}
📱 Total procesados: ${citasPendientes.length}
      `.trim();

      await ctxFn.flowDynamic(mensaje);
      await registrarActividadBot('campahna_envio', 'EJECUCION_CAMPAHNA', {
        estado: 'finalizado',
        campahna: 'meta-' + fechaFormateada,
        fecha_campahna: fechaFormateada,
        envios_exitosos: exitosos,
        envios_errores: errores,
        total_procesados: citasPendientes.length
      });

    } catch (error) {
      console.error('Error ejecutando campaña:', error);
      await ctxFn.flowDynamic(
        '❌ Error interno al procesar la campaña. ' +
        'Revisa los logs para más detalles.'
      );
    }
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