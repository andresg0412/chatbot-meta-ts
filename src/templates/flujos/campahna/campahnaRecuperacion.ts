import { addKeyword, EVENTS } from '@builderbot/bot';

import {
  //marcarCitaComoEnviada,
  buscarCitaPorCelular,
  confirmarCitaPorCedula,
  Cita
} from '../../../services/citasService';
import {
  obtenerCitasCanceladasAbandonadas,
  enviarPlantillaRecuperar,
  confirmarCitaCampahna
} from '../../../services/apiService';

import { esNumeroAutorizado } from '../../../constants/authConstants';
import { extraerFechaDelComando } from '../../../utils/dateValidator';
import { isNumberValid } from '../../../constants/killSwichConstants';
import { esBotHabilitado } from '../../../services/citasService';
import { registrarActividadBot } from '../../../services/apiService';

/**
 * Función core que ejecuta la campaña de recuperación de pacientes sin asistencia.
 * Puede ser llamada desde el flujo de WhatsApp o desde un endpoint HTTP.
 * @param origen - Origen de la ejecución ('whatsapp' o 'endpoint')
 * @returns Objeto con resultados de la ejecución
 */
export const ejecutarCampahnaRecuperacionCore = async (
  origen: 'whatsapp' | 'endpoint' = 'whatsapp'
) => {
  const fechaFormateada = new Date().toISOString().split('T')[0];

  try {
    console.log(`🔄 Ejecutando campaña de recuperación sin asistencia (origen: ${origen})`);

    const citasPendientes = await obtenerCitasCanceladasAbandonadas();

    if (citasPendientes.length === 0) {
      console.log('ℹ️ No se encontraron pacientes para recuperar de hace 15 días');
      return {
        success: true,
        fecha: fechaFormateada,
        total_procesados: 0,
        exitosos: 0,
        errores: 0,
        mensaje: 'No se encontraron pacientes para recuperar de hace 15 días'
      };
    }

    console.log(`📋 Se encontraron ${citasPendientes.length} pacientes por recuperar. Iniciando envío...`);

    let exitosos = 0;
    let errores = 0;
    const resultadosDetalle = [];

    for (const cita of citasPendientes) {
      try {
        const response = await enviarPlantillaRecuperar(cita);
        const resultado = {
          paciente: cita.nombre_paciente,
          telefono: cita.telefono_paciente,
          estado: 'error'
        };

        if (response.exito) {
          await registrarActividadBot('campahna_recuperacion_sin_asistencia', cita.telefono_paciente, {
            estado: 'enviado',
            resultado: 'exitoso',
            campahna: 'meta-usuarios-sin-asistencia-' + fechaFormateada,
            fecha_campahna: fechaFormateada,
            origen
          });
          exitosos++;
          resultado.estado = 'exitoso';
        } else {
          await registrarActividadBot('campahna_recuperacion_sin_asistencia', cita.telefono_paciente, {
            estado: 'no_enviado',
            resultado: 'error',
            campahna: 'meta-usuarios-sin-asistencia-' + fechaFormateada,
            fecha_campahna: fechaFormateada,
            origen
          });
          errores++;
        }
        resultadosDetalle.push(resultado);
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ Error procesando cita de ${cita.nombre_paciente}:`, error);
        errores++;
        try {
          await registrarActividadBot('campahna_recuperacion_sin_asistencia', cita.telefono_paciente, {
            estado: 'error_excepcion',
            resultado: 'error',
            error_detalle: error instanceof Error ? error.message : String(error),
            campahna: 'meta-usuarios-sin-asistencia-' + fechaFormateada,
            fecha_campahna: fechaFormateada,
            origen
          });
        } catch (e) { console.error('Error registrando error en DB', e); }
        resultadosDetalle.push({
          paciente: cita.nombre_paciente,
          telefono: cita.telefono_paciente,
          estado: 'error_excepcion',
          error: String(error)
        });
      }
    }

    await registrarActividadBot('campahna_recuperacion_sin_asistencia', 'EJECUCION_CAMPAHNA', {
      estado: 'finalizado',
      campahna: 'meta-usuarios-sin-asistencia-' + fechaFormateada,
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
    console.error('Error ejecutando campaña:', error);
    return {
      success: false,
      error: 'Error interno al procesar la campaña',
      detalle: error instanceof Error ? error.message : String(error)
    };
  }
};

const ejecutarPlantillaRecuperacionFlow = addKeyword(['sinasistencia'])
  .addAction(async (ctx, ctxFn) => {
    const numeroRemitente = ctx.from;

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

    await ctxFn.flowDynamic(`🔄 Procesando campaña para recuperar pacientes sin asistencia...`);

    const resultado = await ejecutarCampahnaRecuperacionCore('whatsapp');

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

    const mensaje = `
📊 *Campaña Para Recuperar Pacientes Sin Asistencia Completado*
📅 Fecha: ${resultado.fecha}
✅ Exitosos: ${resultado.exitosos}
❌ Errores: ${resultado.errores}
📱 Total procesados: ${resultado.total_procesados}
    `.trim();

    await ctxFn.flowDynamic(mensaje);
  });

const respuestaCampahnaEnOtroMomento = addKeyword(['En otro momento'])
  .addAction(async (ctx, ctxFn) => {
    const fechaFormateada = new Date().toISOString().split('T')[0];
    const telefono = ctx.from;
    await registrarActividadBot('recuperacion_sin_asistencia_otro_momento', telefono, {
      campahna: 'meta-usuarios-sin-asistencia-' + fechaFormateada,
      fecha_campahna: fechaFormateada,
    });
    await ctxFn.flowDynamic('Entendido, estaremos atentos a tu nueva disponibilidad.');
    return ctxFn.endFlow();
  });


export { ejecutarPlantillaRecuperacionFlow, respuestaCampahnaEnOtroMomento };