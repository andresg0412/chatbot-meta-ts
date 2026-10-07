// Keywords de la invitación a la lista de espera ("Si, deseo ingresar" / "No, gracias" / "Hablar con agente"), con el
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
import { invitacionAceptaFlow, invitacionRechazaFlow, invitacionAgenteFlow } from '../listaEspera';
import { esBotonDeOtraPlantilla } from '../palabrasGlobales';
import {
    KW_SI_DESEO_INGRESAR,
    KW_NO_GRACIAS_INVITACION,
    KW_HABLAR_CON_AGENTE_INVITACION,
    TEXTO_BOTON_SI_DESEO_INGRESAR,
    TEXTO_BOTON_NO_GRACIAS_INVITACION,
    TEXTO_BOTON_HABLAR_CON_AGENTE,
} from '../keywordsBotones';

type FlowLike = { toJson: () => any[] };
const keyRef = (flow: FlowLike): string => flow.toJson()[0].ref;

const nuevos: FlowLike[] = [invitacionAceptaFlow, invitacionRechazaFlow, invitacionAgenteFlow];

function refDestino(registro: any, texto: string): string | null {
    const mensajes = registro.find(texto) as Array<{ keyword: string }>;
    return mensajes.length ? mensajes[0].keyword : null;
}

describe.each([true, false])('keywords de la invitación (RECORDATORIOS_BOTONES_ENABLED=%s)', (recordatoriosBotones) => {
    const flujos = construirFlujosRegistrados(recordatoriosBotones) as FlowLike[];
    const registroReal = createFlow(flujos as any);
    const registroSinInvitacion = createFlow(flujos.filter((f) => !nuevos.includes(f)) as any);

    it('los textos de los botones caben en el límite de Meta (25) y coinciden con las keywords', () => {
        expect(TEXTO_BOTON_SI_DESEO_INGRESAR).toBe('Si, deseo ingresar');
        expect(TEXTO_BOTON_NO_GRACIAS_INVITACION).toBe('No, gracias');
        expect(TEXTO_BOTON_HABLAR_CON_AGENTE).toBe('Hablar con agente');
        for (const texto of [TEXTO_BOTON_SI_DESEO_INGRESAR, TEXTO_BOTON_NO_GRACIAS_INVITACION, TEXTO_BOTON_HABLAR_CON_AGENTE]) {
            expect(texto.length).toBeLessThanOrEqual(25);
        }
        expect(KW_SI_DESEO_INGRESAR).toBe('/^\\s*S[ií], deseo ingresar\\s*$/');
        expect(KW_NO_GRACIAS_INVITACION).toBe('/^\\s*No, gracias\\s*$/');
        expect(KW_HABLAR_CON_AGENTE_INVITACION).toBe('/^\\s*Hablar con agente\\s*$/');
    });

    it.each(['Si, deseo ingresar', 'Sí, deseo ingresar', ' Si, deseo ingresar ', 'Si, deseo ingresar\n'])(
        '"%s" → invitacionAceptaFlow', (texto) => {
            expect(refDestino(registroReal, texto)).toBe(keyRef(invitacionAceptaFlow));
        });

    it.each(['No, gracias', '  No, gracias  '])('"%s" → invitacionRechazaFlow', (texto) => {
        expect(refDestino(registroReal, texto)).toBe(keyRef(invitacionRechazaFlow));
    });

    it.each(['Hablar con agente', ' Hablar con agente '])('"%s" → invitacionAgenteFlow', (texto) => {
        expect(refDestino(registroReal, texto)).toBe(keyRef(invitacionAgenteFlow));
    });

    describe('textos parecidos NO caen en los flujos nuevos (van a donde iban antes)', () => {
        it.each([
            'si, deseo ingresar',
            'Si deseo ingresar',
            'Si, deseo ingresar por favor',
            'deseo ingresar',
            'no, gracias',
            'No gracias',
            'No, gracias!',
            'No, gracias por todo',
            'no gracias, ya agendé',
            'hablar con agente',
            'Hablar con un agente',
            'quiero hablar con agente',
            'chatear con agente',
            'Hablar con asistente',
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

    it('los tres flujos están registrados antes que exitFlow (orden de createFlow)', () => {
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
    it('los tres botones de la invitación se reconocen como botón de otra plantilla dentro de una captura', () => {
        expect(esBotonDeOtraPlantilla('Si, deseo ingresar')).toBe(true);
        expect(esBotonDeOtraPlantilla('Sí, deseo ingresar')).toBe(true);
        expect(esBotonDeOtraPlantilla('No, gracias')).toBe(true);
        expect(esBotonDeOtraPlantilla('Hablar con agente')).toBe(true);
        expect(esBotonDeOtraPlantilla('Chatear con agente')).toBe(true);
        expect(esBotonDeOtraPlantilla('no, gracias')).toBe(false);
        expect(esBotonDeOtraPlantilla('No, gracias por todo')).toBe(false);
        expect(esBotonDeOtraPlantilla('hablar con agente ya')).toBe(false);
    });
});
