// Keywords de la invitación a la lista de espera ("Sí, quiero recibir avisos" / "No, gracias"), con el
// algoritmo REAL de @builderbot (FlowClass.find) y el orden REAL de createFlow (templates/index.ts):
// proyecto-ips/docs/features/2026-10-04-campanas-invitacion-lista-espera-implementacion.md, 6.6 / T8.

jest.mock('../../../utils/proactiveSessionManager', () => ({
    setBotInstance: jest.fn(),
    updateUserActivity: jest.fn(),
    renovarActividadSesion: jest.fn(() => 'activa'),
    isSessionExpired: jest.fn(() => false),
    closeUserSession: jest.fn(),
    getRemainingSessionTime: jest.fn(() => 60 * 60 * 1000),
    restoreActiveTimers: jest.fn(),
    cleanupExpiredSessions: jest.fn(),
    cleanupOldSessionsWithoutNotification: jest.fn(),
    getActiveSessionsCount: jest.fn(() => 0),
}));

import { createFlow } from '@builderbot/bot';
import { construirFlujosRegistrados } from '../../index';
import { exitFlow } from '../../welcomeFlow';
import { invitacionAceptaFlow, invitacionRechazaFlow } from '../listaEspera';
import { esBotonDeOtraPlantilla } from '../palabrasGlobales';
import {
    KW_SI_QUIERO_AVISOS,
    KW_NO_GRACIAS_INVITACION,
    TEXTO_BOTON_SI_QUIERO_AVISOS,
    TEXTO_BOTON_NO_GRACIAS_INVITACION,
} from '../keywordsBotones';

type FlowLike = { toJson: () => any[] };
const keyRef = (flow: FlowLike): string => flow.toJson()[0].ref;

const nuevos: FlowLike[] = [invitacionAceptaFlow, invitacionRechazaFlow];

function refDestino(registro: any, texto: string): string | null {
    const mensajes = registro.find(texto) as Array<{ keyword: string }>;
    return mensajes.length ? mensajes[0].keyword : null;
}

describe.each([true, false])('keywords de la invitación (RECORDATORIOS_BOTONES_ENABLED=%s)', (recordatoriosBotones) => {
    const flujos = construirFlujosRegistrados(recordatoriosBotones) as FlowLike[];
    const registroReal = createFlow(flujos as any);
    const registroSinInvitacion = createFlow(flujos.filter((f) => !nuevos.includes(f)) as any);

    it('los textos de los botones caben en el límite de Meta (25) y coinciden con las keywords', () => {
        expect(TEXTO_BOTON_SI_QUIERO_AVISOS).toBe('Sí, quiero recibir avisos');
        expect(TEXTO_BOTON_SI_QUIERO_AVISOS.length).toBeLessThanOrEqual(25);
        expect(TEXTO_BOTON_NO_GRACIAS_INVITACION).toBe('No, gracias');
        expect(KW_SI_QUIERO_AVISOS).toBe('/^\\s*Sí, quiero recibir avisos\\s*$/');
        expect(KW_NO_GRACIAS_INVITACION).toBe('/^\\s*No, gracias\\s*$/');
    });

    it.each(['Sí, quiero recibir avisos', ' Sí, quiero recibir avisos ', 'Sí, quiero recibir avisos\n'])(
        '"%s" → invitacionAceptaFlow', (texto) => {
            expect(refDestino(registroReal, texto)).toBe(keyRef(invitacionAceptaFlow));
        });

    it.each(['No, gracias', '  No, gracias  '])('"%s" → invitacionRechazaFlow', (texto) => {
        expect(refDestino(registroReal, texto)).toBe(keyRef(invitacionRechazaFlow));
    });

    describe('textos parecidos NO caen en los flujos nuevos (van a donde iban antes)', () => {
        it.each([
            'sí, quiero recibir avisos',
            'Si, quiero recibir avisos',
            'Sí quiero recibir avisos',
            'Sí, quiero recibir avisos por favor',
            'quiero recibir avisos',
            'no, gracias',
            'No gracias',
            'No, gracias!',
            'No, gracias por todo',
            'no gracias, ya agendé',
            'Sí, avísame',
            'Sí, lo tomo',
            'No puedo',
            'Salir',
            'hola',
        ])('"%s"', (texto) => {
            const destino = refDestino(registroReal, texto);
            for (const flujo of nuevos) expect(destino).not.toBe(keyRef(flujo));
            expect(destino).toBe(refDestino(registroSinInvitacion, texto));
        });
    });

    it('los dos flujos están registrados antes que exitFlow (orden de createFlow)', () => {
        const orden = flujos.map((f) => keyRef(f));
        const posExit = orden.indexOf(keyRef(exitFlow));
        for (const flujo of nuevos) {
            const pos = orden.indexOf(keyRef(flujo));
            expect(pos).toBeGreaterThanOrEqual(0);
            expect(pos).toBeLessThan(posExit);
        }
    });
});

describe('palabras globales (BOTONES_ANCLADOS)', () => {
    it('los dos botones de la invitación se reconocen como botón de otra plantilla dentro de una captura', () => {
        expect(esBotonDeOtraPlantilla('Sí, quiero recibir avisos')).toBe(true);
        expect(esBotonDeOtraPlantilla('No, gracias')).toBe(true);
        expect(esBotonDeOtraPlantilla('no, gracias')).toBe(false);
        expect(esBotonDeOtraPlantilla('No, gracias por todo')).toBe(false);
    });
});
