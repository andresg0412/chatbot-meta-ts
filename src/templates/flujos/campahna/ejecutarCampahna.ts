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
import type { ResultadoConfirmacion, FalloConfirmacion } from '../../../services/apiService';
import {
  construirRespuestaConfirmacion,
  metricaConfirmacionCampahna,
  MENSAJE_ERROR_CONFIRMACION
} from '../../../utils/mensajesConfirmacion';
import { iniciarEjecucionCampana, finalizarEjecucionCampana, trackRespuestaCampana, trackPaso, trackNoEntendido, trackIdentificacion, trackErrorBackend, trackFin, cerrarSesionTraza } from '../../../utils/trazabilidad';
import { aplicarFiltroCaptura } from '../filtroCaptura';

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
  // Trazabilidad: campana_ejecucion{inicio|fin} y campana_ejecucion_id en cada wa_envio de la corrida.
  const campanaEjecucionId = iniciarEjecucionCampana('execute', origen);
  try {
    console.log(`🔄 Ejecutando campaña de confirmación para fecha: ${fechaFormateada} (origen: ${origen})`);

    // 1. Consultar citas pendientes para la fecha especificada
    const citasProgramadas = await obtenerCitasProgramadas(fechaFormateada);

    if (citasProgramadas.length === 0) {
      console.log(`ℹ️ No se encontraron citas programadas para la fecha ${fechaFormateada}`);
      finalizarEjecucionCampana('execute', campanaEjecucionId, { total: 0, exitosos: 0, errores: 0, origen });
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
          response = await enviarPlantillaRecordatorio24h(cita, campanaEjecucionId);
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
          response = await enviarPlantillaConfirmacion(cita, campanaEjecucionId);
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
        } else {
          // Estado ausente o desconocido (p. ej. el backend dejó de enviar estado_agenda): no se envía
          // nada, pero se cuenta como error para que la corrida no termine "0 exitosos, 0 errores".
          console.error(`❌ Cita ${cita.cita_id} sin estado_agenda válido (${String(cita.estado_agenda)}); no se envía plantilla`);
          errores++;
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

    finalizarEjecucionCampana('execute', campanaEjecucionId, { total: citasProgramadas.length, exitosos, errores, origen });
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
    finalizarEjecucionCampana('execute', campanaEjecucionId, { total: 0, exitosos: 0, errores: 1, origen });
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

// ---------------------------------------------------------------------------
// Respuesta a "Confirmar" (plantilla de confirmación 24h) y "Confirmo" (recordatorio 48h).
// proyecto-ips/docs/features/2026-09-27-confirmar-cita-ya-confirmada.md, sección 4.6.
//
// State usado:
// - numeroDoc: documento capturado.
// - intentosConfirmacion: reintentos de documento ya consumidos (máximo 1, decisión 9.4). Se reinicia
//   en todo cierre y cada vez que el paciente entra de nuevo por la keyword.
// - reintentoConfirmacionEnCurso: true solo mientras se vuelve a pedir el documento por gotoFlow, para
//   distinguir ese reingreso (conserva el contador) de una entrada nueva por keyword (lo reinicia). Sin
//   esto, un paciente que abandonó tras el primer reintento quedaría con el contador consumido.
// ---------------------------------------------------------------------------

type TipoEventoConfirmacion = 'campahna_envio' | 'campahna_recordatorio';

const MENSAJE_PEDIR_DOCUMENTO_CONFIRMAR = 'Para confirmar por favor digita el número de documento del paciente 🔢:';
const MENSAJE_DOCUMENTO_NO_VALIDO = 'El número de documento ingresado no es válido. Intenta nuevamente.';

/**
 * Primer paso de los flujos de documento: reinicia el contador salvo que sea un reintento en curso.
 * Trazabilidad: una entrada NUEVA (no un reintento) es la respuesta esperada a la campaña →
 * `campana_respuesta` (una sola vez, antes de pedir el documento; tabla 11.2).
 */
async function prepararIntentosConfirmacion(ctx: any, state: any, campana: 'execute' | 'reminder'): Promise<void> {
  if (state.getMyState()?.reintentoConfirmacionEnCurso) {
    await state.update({ reintentoConfirmacionEnCurso: false });
  } else {
    await state.update({ intentosConfirmacion: 0 });
    trackRespuestaCampana(ctx.from, campana, 'confirmo', 'campana.confirmar_documento');
  }
}

/** Identificación a partir del resultado del backend (sin registrar nada si fue un error técnico). */
function trazarResultadoConfirmacion(ctx: any, numeroDoc: unknown, resultado: ResultadoConfirmacion): void {
  if (resultado.ok) {
    trackIdentificacion(ctx.from, numeroDoc, 'encontrado', 'campana.confirmar_documento');
    // El backend confirmó de verdad ('confirmada') o la cita ya estaba confirmada ('ya_confirmada').
    trackFin(ctx.from, 'campana_respuesta', 'cita_confirmada', {
      paso: 'campana.confirmar_documento',
      metadata: { estado_resultado: resultado.estado },
    });
    return;
  }
  const causa: string = (resultado as FalloConfirmacion).causa;
  if (causa === 'CITA_NOT_FOUND' || causa === 'DOCUMENTO_INVALIDO') {
    trackIdentificacion(ctx.from, numeroDoc, 'no_encontrado', 'campana.confirmar_documento');
  } else if (causa === 'ERROR' || causa === 'GLOBHO_ERROR') {
    trackErrorBackend(ctx.from, 'campana.confirmar_documento', '/chatbot/confirmarcitameta', { siempre: true, cause: causa });
  } else {
    trackIdentificacion(ctx.from, numeroDoc, 'encontrado', 'campana.confirmar_documento');
  }
}

/**
 * Helper común de `confirmarCitaFlow` y `confirmarCitaCampahna48Flow`: envía los mensajes de 4.6,
 * registra la métrica y decide entre reintentar (flujo de documento del mismo tipo) o cerrar.
 */
async function manejarResultadoConfirmacion(
  resultado: ResultadoConfirmacion,
  ctx: any,
  ctxFn: any,
  tipoEvento: TipoEventoConfirmacion,
  flujoDocumento: any
) {
  const celular = ctx.from;
  const fechaFormateada = new Date().toISOString().split('T')[0];
  trazarResultadoConfirmacion(ctx, ctxFn.state.getMyState()?.numeroDoc, resultado);
  const intentosPrevios = Number(ctxFn.state.getMyState()?.intentosConfirmacion) || 0;
  const respuesta = construirRespuestaConfirmacion(resultado, 'campahna', intentosPrevios);

  for (const mensaje of respuesta.mensajes) {
    await ctxFn.flowDynamic(mensaje);
  }
  await registrarActividadBot(tipoEvento, celular, {
    ...metricaConfirmacionCampahna(resultado),
    campahna: 'meta-' + fechaFormateada,
    fecha_campahna: fechaFormateada,
  });

  if (respuesta.siguiente === 'reintentar') {
    await ctxFn.state.update({ intentosConfirmacion: intentosPrevios + 1, reintentoConfirmacionEnCurso: true });
    return ctxFn.gotoFlow(flujoDocumento);
  }
  await ctxFn.state.update({ intentosConfirmacion: 0, reintentoConfirmacionEnCurso: false });
  cerrarSesionTraza(ctx.from, 'completado');
  return ctxFn.endFlow();
}

async function confirmarYResponder(
  ctx: any,
  ctxFn: any,
  tipoEvento: TipoEventoConfirmacion,
  flujoDocumento: any
) {
  try {
    const numeroDoc = ctxFn.state.getMyState()?.numeroDoc;
    const resultado = await confirmarCitaCampahna(ctx.from, numeroDoc);
    return await manejarResultadoConfirmacion(resultado, ctx, ctxFn, tipoEvento, flujoDocumento);
  } catch (error) {
    console.error('Error confirmando cita:', (error as any)?.message ?? error);
    await ctxFn.state.update({ intentosConfirmacion: 0, reintentoConfirmacionEnCurso: false });
    trackPaso(ctx.from, 'campana.confirmar_documento', 'error');
    cerrarSesionTraza(ctx.from, 'completado');
    await ctxFn.flowDynamic(MENSAJE_ERROR_CONFIRMACION);
    return ctxFn.endFlow();
  }
}

/**
 * Flow para confirmar citas (respuesta a la plantilla de confirmación 24h)
 */
const confirmarCitaFlow = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, ctxFn) => confirmarYResponder(ctx, ctxFn, 'campahna_envio', confirmarCitaDocumentoFlow));

const confirmarCitaDocumentoFlow = addKeyword(['Confirmar cita', 'Confirmar', 'confirmar'])
  .addAction(async (ctx, { state }) => {
    await prepararIntentosConfirmacion(ctx, state, 'execute');
  })
  .addAnswer(MENSAJE_PEDIR_DOCUMENTO_CONFIRMAR,
    { capture: true },
    async (ctx, fns) => {
      const { state, gotoFlow, flowDynamic, endFlow } = fns;
      const filtro = await aplicarFiltroCaptura(ctx, { flowDynamic, endFlow }, {
        paso: 'campana.confirmar_documento', reintentar: () => gotoFlow(confirmarCitaDocumentoFlow),
      });
      if (filtro) return filtro.salida;
      const numeroDoc = sanitizeString(ctx.body, 20);
      if (!isValidDocumentNumber(numeroDoc)) {
        trackNoEntendido(ctx.from, 'campana.confirmar_documento');
        await flowDynamic(MENSAJE_DOCUMENTO_NO_VALIDO);
        await state.update({ reintentoConfirmacionEnCurso: true });
        return gotoFlow(confirmarCitaDocumentoFlow);
      }
      trackPaso(ctx.from, 'campana.confirmar_documento', 'ok');
      await state.update({ numeroDoc });
      return gotoFlow(confirmarCitaFlow);
    }
  );


/**
 * Flow para confirmar citas (respuesta a la plantilla de recordatorio 48h)
 */
const confirmarCitaCampahna48Flow = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, ctxFn) => confirmarYResponder(ctx, ctxFn, 'campahna_recordatorio', confirmarCitaDocumentoCampahna48Flow));

const confirmarCitaDocumentoCampahna48Flow = addKeyword(['Confirmo'])
  .addAction(async (ctx, { state }) => {
    await prepararIntentosConfirmacion(ctx, state, 'reminder');
  })
  .addAnswer(MENSAJE_PEDIR_DOCUMENTO_CONFIRMAR,
    { capture: true },
    async (ctx, fns) => {
      const { state, gotoFlow, flowDynamic, endFlow } = fns;
      const filtro = await aplicarFiltroCaptura(ctx, { flowDynamic, endFlow }, {
        paso: 'campana.confirmar_documento', reintentar: () => gotoFlow(confirmarCitaDocumentoCampahna48Flow),
      });
      if (filtro) return filtro.salida;
      const numeroDoc = sanitizeString(ctx.body, 20);
      if (!isValidDocumentNumber(numeroDoc)) {
        trackNoEntendido(ctx.from, 'campana.confirmar_documento');
        await flowDynamic(MENSAJE_DOCUMENTO_NO_VALIDO);
        await state.update({ reintentoConfirmacionEnCurso: true });
        return gotoFlow(confirmarCitaDocumentoCampahna48Flow);
      }
      trackPaso(ctx.from, 'campana.confirmar_documento', 'ok');
      await state.update({ numeroDoc });
      return gotoFlow(confirmarCitaCampahna48Flow);
    }
  );

export { ejecutarPlantillaDiariaFlow, confirmarCitaFlow, confirmarCitaDocumentoFlow, confirmarCitaDocumentoCampahna48Flow, confirmarCitaCampahna48Flow };
