import { addKeyword, EVENTS } from '@builderbot/bot';


import {
  obtenerCitasProgramadas,
  guardarCitasDB,
  leerCitasDB,
  buscarCitaPorCelular,
  confirmarCitaPorCedula,
  Cita
} from '../../../services/citasService';

const ejecutarPlantillaDiariaFlow = addKeyword(['ejecutarplantilladiaria'])
  .addAction(async (ctx, ctxFn) => {
    // 1. Obtener citas programadas (simulado)
    const citas = await obtenerCitasProgramadas();
    // 2. Guardar en la base de datos interna (json)
    await guardarCitasDB(citas);
    // 3. Enviar plantilla a cada paciente
    for (const cita of citas) {
        console.log(`Enviando plantilla a ${cita.nombre} (${cita.celular})`);
      // Simulación de envío de plantilla a Meta
      /*await ctxFn.provider.sendTemplate(
        cita.celular,
        {
          name: 'plantilla_confirmacion_cita', // nombre de la plantilla en Meta
          language: { code: 'es' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: cita.nombre },
                { type: 'text', text: cita.fecha },
                { type: 'text', text: cita.hora },
                { type: 'text', text: cita.lugar },
              ],
            },
            {
              type: 'button',
              sub_type: 'quick_reply',
              index: '0',
              parameters: [{ type: 'payload', payload: 'CONFIRMAR_CITA' }],
            },
            {
              type: 'button',
              sub_type: 'quick_reply',
              index: '1',
              parameters: [{ type: 'payload', payload: 'CANCELAR_CITA' }],
            },
          ],
        }
      );*/
    }
    await ctxFn.flowDynamic('Plantillas enviadas a todos los pacientes con cita programada.');
  });

const confirmarCitaFlow = addKeyword(['CONFIRMAR_CITA'])
  .addAction(async (ctx, ctxFn) => {
    const celular = ctx.from;
    const cita = buscarCitaPorCelular(celular);
    if (!cita) {
      await ctxFn.flowDynamic('No se encontró una cita asociada a tu número.');
      return;
    }
    // Simula llamada a API para confirmar cita
    const ok = await confirmarCitaPorCedula(cita.cedula);
    if (ok) {
      await ctxFn.flowDynamic('¡Tu cita ha sido confirmada exitosamente!');
    } else {
      await ctxFn.flowDynamic('No fue posible confirmar tu cita.');
    }
  });

export { ejecutarPlantillaDiariaFlow, confirmarCitaFlow };