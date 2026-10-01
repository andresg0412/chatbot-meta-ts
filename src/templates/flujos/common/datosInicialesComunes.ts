import { addKeyword, EVENTS } from '@builderbot/bot';
import { datosinicialesComunes2 } from './datosinicialesComunes2';
import { checkSessionTimeout } from '../../../utils/proactiveSessionTimeout';
import { trackNoEntendido, trackPaso, trackErrorBackend, trackFin, trackIdentificacion, flujoDesdeSeleccionMenu } from '../../../utils/trazabilidad';

const datosinicialesComunes = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { provider, state }) => {
        trackPaso(ctx.from, 'comun.c01_tipo_documento', 'mostrado', { flujo: flujoDesdeSeleccionMenu(state.getMyState()?.flujoSeleccionadoMenu) });
        const list = {
            header: { type: 'text', text: 'Tipo de documento' },
            body: { text: 'Selecciona tu tipo de documento:' },
            footer: { text: '' },
            action: {
                button: 'Seleccionar',
                sections: [
                    {
                        title: 'Tipos',
                        rows: [
                            { id: 'doc_cc', title: 'Cédula de ciudadanía' },
                            { id: 'doc_ce', title: 'Cédula de extranjería' },
                            { id: 'doc_ti', title: 'Tarjeta de identidad' },
                            { id: 'doc_rc', title: 'Registro civil' },
                            { id: 'doc_pas', title: 'Pasaporte' },
                            { id: 'doc_otro', title: 'Otro' },
                        ]
                    }
                ]
            }
        };
        await provider.sendList(ctx.from, list);
    });

export { datosinicialesComunes };