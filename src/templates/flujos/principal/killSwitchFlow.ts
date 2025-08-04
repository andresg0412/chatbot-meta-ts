import { addKeyword } from '@builderbot/bot';
import { 
  DISABLE_KEY, 
  ENABLE_KEY, 
  STATUS_KEY,
  isNumberValid 
} from '../../../constants/killSwichConstants';
import { 
  actualizarEstadoBot, 
  obtenerEstadoBot 
} from '../../../services/citasService';

const killSwitchFlow = addKeyword([DISABLE_KEY, ENABLE_KEY, STATUS_KEY])
  .addAction(async (ctx, ctxFn) => {
    const numeroRemitente = ctx.from;
    const mensaje = ctx.body.toLowerCase();

    if (!isNumberValid(numeroRemitente)) {
      await ctxFn.flowDynamic('No entiendo que has dicho.');
      return ctxFn.endFlow();
    }

    if (mensaje.includes(DISABLE_KEY.toLowerCase())) {
      const exito = actualizarEstadoBot(false);
      if (exito) {
        await ctxFn.flowDynamic('🔴 Bot DESHABILITADO exitosamente');
        await ctxFn.flowDynamic('El bot ya no responderá a usuarios hasta nuevo aviso.');
      } else {
        await ctxFn.flowDynamic('❌ Error al deshabilitar el bot');
      }
    } 
    else if (mensaje.includes(ENABLE_KEY.toLowerCase())) {
      const exito = actualizarEstadoBot(true);
      if (exito) {
        await ctxFn.flowDynamic('🟢 Bot HABILITADO exitosamente');
        await ctxFn.flowDynamic('El bot volverá a responder normalmente a los usuarios.');
      } else {
        await ctxFn.flowDynamic('❌ Error al habilitar el bot');
      }
    }
    else if (mensaje.includes(STATUS_KEY.toLowerCase())) {
      const estado = obtenerEstadoBot();
      const emoji = estado.habilitado ? '🟢' : '🔴';
      const estatus = estado.habilitado ? 'HABILITADO' : 'DESHABILITADO';
      
      await ctxFn.flowDynamic(
        `${emoji} Estado del Bot: *${estatus}*\n` +
        `📅 Última modificación: ${estado.ultimaModificacion || 'N/A'}`
      );
    }

    return ctxFn.endFlow();
  });

export { killSwitchFlow };