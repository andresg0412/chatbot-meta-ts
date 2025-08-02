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

const ejecutarPlantillaDiariaFlow = addKeyword(['ejecutar'])
  .addAction(async (ctx, ctxFn) => {
    const numeroRemitente = ctx.from;
    const mensajeCompleto = ctx.body;

    if (!esNumeroAutorizado(numeroRemitente)) {
      await ctxFn.flowDynamic('No entiendo que has dicho.');
      return;
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
            exitosos++;
          } else {
            errores++;
          }
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          console.error(`❌ Error procesando cita de ${cita.nombre_paciente}:`, error);
          errores++;
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
const confirmarCitaFlow = addKeyword(['Confirmar cita', 'Confirmar', 'confirmar'])
  .addAction(async (ctx, ctxFn) => {
    const celular = ctx.from;
    
    try {
      const response = await confirmarCitaCampahna(celular);
      
      if (response) {
        await ctxFn.flowDynamic('✅ ¡Tu cita ha sido confirmada exitosamente!');
        await ctxFn.flowDynamic('Gracias por confirmar tu cita. Si necesitas más ayuda, no dudes en preguntar. ¡Feliz día!');
        return ctxFn.endFlow();
      } else {
        await ctxFn.flowDynamic('❌ No fue posible confirmar tu cita. Intenta nuevamente o contacta soporte.');
        return ctxFn.endFlow();
      }

    } catch (error) {
      console.error('Error confirmando cita:', error);
      await ctxFn.flowDynamic('❌ Error interno. Intenta nuevamente.');
      return ctxFn.endFlow();
    }
  });

export { ejecutarPlantillaDiariaFlow, confirmarCitaFlow };