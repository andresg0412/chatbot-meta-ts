// Ejemplo de cómo implementar timeout en cualquier flujo del bot
import { addKeyword, EVENTS } from '@builderbot/bot';
import { checkSessionTimeout } from '../../../utils/sessionTimeout';

// EJEMPLO 1: Flujo simple con timeout
const ejemploFlujosimple = addKeyword(['ejemplo'])
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        // SIEMPRE agregar esta verificación al inicio de cada flujo
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow);
        if (!sessionValid) {
            return endFlow();
        }
    })
    .addAnswer('Este es un flujo de ejemplo con timeout implementado')
    .addAnswer('Si el usuario lleva más de 1 hora inactivo, la conversación se cerrará automáticamente');

// EJEMPLO 2: Flujo con captura de datos
const ejemploFlujoConCaptura = addKeyword(['datos'])
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        // Verificación de timeout obligatoria
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow);
        if (!sessionValid) {
            return endFlow();
        }
    })
    .addAnswer(
        'Por favor ingresa tu nombre:',
        { capture: true },
        async (ctx, { state, flowDynamic }) => {
            await state.update({ nombre: ctx.body });
            await flowDynamic(`Hola ${ctx.body}, tu sesión permanecerá activa mientras interactúes.`);
        }
    );

// EJEMPLO 3: Flujo con botones
const ejemploFlujoBotones = addKeyword(['botones'])
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        // Verificación de timeout
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow);
        if (!sessionValid) {
            return endFlow();
        }
    })
    .addAnswer(
        '¿Qué opción prefieres?',
        {
            capture: true,
            buttons: [
                { body: 'Opción A' },
                { body: 'Opción B' },
            ],
        },
        async (ctx, { flowDynamic }) => {
            if (ctx.body === 'Opción A') {
                await flowDynamic('Seleccionaste la Opción A');
            } else if (ctx.body === 'Opción B') {
                await flowDynamic('Seleccionaste la Opción B');
            }
        }
    );

// EJEMPLO 4: Flujo que redirige a otro flujo
const ejemploFlujoRedirect = addKeyword(['redirect'])
    .addAction(async (ctx, { flowDynamic, endFlow, gotoFlow }) => {
        // Verificación de timeout
        const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow);
        if (!sessionValid) {
            return endFlow();
        }
        
        // Si la sesión es válida, continuar al siguiente flujo
        return gotoFlow(ejemploFlujosimple);
    });

export { 
    ejemploFlujosimple, 
    ejemploFlujoConCaptura, 
    ejemploFlujoBotones, 
    ejemploFlujoRedirect 
};

/*
PASOS PARA IMPLEMENTAR EN TUS FLUJOS EXISTENTES:

1. Importar el middleware:
   import { checkSessionTimeout } from '../../../utils/sessionTimeout';

2. Agregar verificación al inicio:
   .addAction(async (ctx, { flowDynamic, endFlow }) => {
       const sessionValid = await checkSessionTimeout(ctx.from, flowDynamic, endFlow);
       if (!sessionValid) {
           return endFlow();
       }
   })

3. Continuar con tu lógica normal del flujo

NOTAS IMPORTANTES:
- La verificación debe ser el PRIMER .addAction() en cada flujo
- Usar los parámetros { flowDynamic, endFlow } exactamente como se muestra
- El sistema automáticamente actualiza la actividad del usuario cuando pasa la verificación
- Si la sesión expira, el usuario recibe un mensaje y la conversación se cierra elegantemente
*/
