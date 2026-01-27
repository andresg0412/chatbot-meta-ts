import { addKeyword, EVENTS } from '@builderbot/bot';

import {
  //marcarCitaComoEnviada,
  buscarCitaPorCelular,
  confirmarCitaPorCedula,
  Cita
} from '../../../services/citasService';
import {
  obtenerCitasUsuariosConAsistencia,
  enviarPlantillaUsuariosConAsistencia,
  confirmarCitaCampahna
} from '../../../services/apiService';

import { esNumeroAutorizado } from '../../../constants/authConstants';
import { extraerFechaDelComando } from '../../../utils/dateValidator';
import { isNumberValid } from '../../../constants/killSwichConstants';
import { esBotHabilitado } from '../../../services/citasService';
import { registrarActividadBot } from '../../../services/apiService';


const ejecutarPlantillaUsuariosConAsistenciaFlow = addKeyword(['conasistencia'])
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

    // 2. Extraer y validar la fecha del comando
    //const fechaFormateada = extraerFechaDelComando(mensajeCompleto);
    //console.log(`Fecha extraída: ${fechaFormateada}`);

    /*if (!fechaFormateada) {
      await ctxFn.flowDynamic(
        '❌ Formato incorrecto. Usa: *Ejecutar DD/MM/YYYY*\n' +
        'Ejemplo: ejecutar 2/8/2025'
      );
      return;
    }*/

    await ctxFn.flowDynamic(`🔄 Procesando campaña para recuperar pacientes con asistencia...`);

    try {
      // 3. Consultar citas pendientes para la fecha especificada
      const citasPendientes = await obtenerCitasUsuariosConAsistencia();

      if (citasPendientes.length === 0) {
        await ctxFn.flowDynamic(`ℹ️ No se encontraron pacientes para recuperar de hace 15 días`);
        return;
      }

      await ctxFn.flowDynamic(`📋 Se encontraron ${citasPendientes.length} pacientes por recuperar. Iniciando envío...`);

      // 4. Procesar cada cita
      let exitosos = 0;
      let errores = 0;
      //obtener fecha en formato YYYY-MM-DD
      const fechaFormateada = new Date().toISOString().split('T')[0];

      for (const cita of citasPendientes) {
        try {
          //enviar plantilla con metodo POST
          const response = await enviarPlantillaUsuariosConAsistencia(cita);
          if (response.exito) {
            await registrarActividadBot('campahna_recuperacion_con_asistencia', cita.telefono_paciente, {
              estado: 'enviado',
              resultado: 'exitoso',
              campahna: 'meta-usuarios-con-asistencia-' + fechaFormateada,
              fecha_campahna: fechaFormateada,
            });
            exitosos++;
          } else {
            await registrarActividadBot('campahna_recuperacion_con_asistencia', cita.telefono_paciente, {
              estado: 'no_enviado',
              resultado: 'error',
              campahna: 'meta-usuarios-con-asistencia-' + fechaFormateada,
              fecha_campahna: fechaFormateada,
            });
            errores++;
          }
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          console.error(`❌ Error procesando cita de ${cita.nombre_paciente}:`, error);
          errores++;
          try {
            await registrarActividadBot('campahna_recuperacion_con_asistencia', cita.telefono_paciente, {
              estado: 'error_excepcion',
              resultado: 'error',
              error_detalle: error instanceof Error ? error.message : String(error),
              campahna: 'meta-usuarios-con-asistencia-' + fechaFormateada,
              fecha_campahna: fechaFormateada,
            });
          } catch (e) { console.error('Error registrando error en DB', e) }
        }
      }

      // 5. Reporte final
      const mensaje = `
📊 *Campaña Para Recuperar Pacientes Con Asistencia Completado*
📅 Fecha: ${fechaFormateada}
✅ Exitosos: ${exitosos}
❌ Errores: ${errores}
📱 Total procesados: ${citasPendientes.length}
      `.trim();

      await ctxFn.flowDynamic(mensaje);
      await registrarActividadBot('campahna_recuperacion_con_asistencia', 'EJECUCION_CAMPAHNA', {
        estado: 'finalizado',
        campahna: 'meta-recuperacion-con-asistencia-' + fechaFormateada,
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

const respuestaCampahnaFinalizado = addKeyword(['Ya finalicé mi proceso'])
  .addAction(async (ctx, ctxFn) => {
    const fechaFormateada = new Date().toISOString().split('T')[0];
    const telefono = ctx.from;
    await registrarActividadBot('recuperacion_con_asistencia_finalizo_proceso', telefono, {
      campahna: 'meta-usuarios-con-asistencia-' + fechaFormateada,
      fecha_campahna: fechaFormateada,
    });
    await ctxFn.flowDynamic('Entendido, estaremos atentos a tu nueva solicitud..');
    return ctxFn.endFlow();
  });

export { ejecutarPlantillaUsuariosConAsistenciaFlow, respuestaCampahnaFinalizado };