// Runbook B1 (proyecto-ips/docs/features/2026-09-26-lista-espera-runbook-produccion.md): verifica, con
// el algoritmo REAL de @builderbot (FlowClass.find de node_modules/@builderbot/bot/dist/index.cjs) y
// la lista REAL de flujos registrada en templates/index.ts, a qué flujo va cada texto de botón nuevo y
// viejo, y que todo texto que no sea exactamente un botón nuevo se enruta igual que si los flujos
// nuevos no existieran (regresión).

// proactiveSessionManager arranca un setInterval al importarse (mantendría vivo el proceso de jest).
jest.mock('../../utils/proactiveSessionManager', () => ({
    setBotInstance: jest.fn(),
    updateUserActivity: jest.fn(),
    isSessionExpired: jest.fn(() => false),
    closeUserSession: jest.fn(),
    getRemainingSessionTime: jest.fn(() => 60 * 60 * 1000),
    restoreActiveTimers: jest.fn(),
    cleanupExpiredSessions: jest.fn(),
    cleanupOldSessionsWithoutNotification: jest.fn(),
    getActiveSessionsCount: jest.fn(() => 0),
}));

import { createFlow } from '@builderbot/bot';
import { flujosRegistrados } from '../index';
import { exitFlow, welcomeFlow } from '../welcomeFlow';
import { killSwitchFlow } from '../flujos/principal/killSwitchFlow';
import { DISABLE_KEY } from '../../constants/killSwichConstants';
import {
    confirmarCitaDocumentoFlow,
    confirmarCitaDocumentoCampahna48Flow,
    respuestaCampahnaEnOtroMomento,
    respuestaCampahnaFinalizado,
} from '../flujos/campahna';
import { step1CencelarCita } from '../flujos/cancelarCita';
import { step1Reprogramar } from '../flujos/reprogramarCita';
import { step1AgendarCita } from '../flujos/agendarCita';
import { pasoAgenteFlow } from '../flujos/pasoAgente';
import { pqrsFlow } from '../flujos/pasoAgente/enviarpqrs';
import { ofertaCupoAceptaDocumentoFlow, ofertaCupoRechazaDocumentoFlow, retiroListaEsperaFlow } from '../flujos/listaEspera';
import { confirmoAsistenciaFlow, necesitoCancelarFlow, noPodreAsistirFlow } from '../flujos/recordatorios';

type FlowLike = { toJson: () => any[] };

const keyRef = (flow: FlowLike): string => flow.toJson()[0].ref;

const nombres = new Map<string, string>([
    [keyRef(killSwitchFlow), 'killSwitchFlow'],
    [keyRef(welcomeFlow), 'welcomeFlow'],
    [keyRef(exitFlow), 'exitFlow'],
    [keyRef(confirmarCitaDocumentoFlow), 'confirmarCitaDocumentoFlow'],
    [keyRef(confirmarCitaDocumentoCampahna48Flow), 'confirmarCitaDocumentoCampahna48Flow'],
    [keyRef(respuestaCampahnaEnOtroMomento), 'respuestaCampahnaEnOtroMomento'],
    [keyRef(respuestaCampahnaFinalizado), 'respuestaCampahnaFinalizado'],
    [keyRef(step1CencelarCita), 'step1CencelarCita'],
    [keyRef(step1Reprogramar), 'step1Reprogramar'],
    [keyRef(step1AgendarCita), 'step1AgendarCita'],
    [keyRef(pasoAgenteFlow), 'pasoAgenteFlow'],
    [keyRef(pqrsFlow), 'pqrsFlow'],
    [keyRef(ofertaCupoAceptaDocumentoFlow), 'ofertaCupoAceptaDocumentoFlow'],
    [keyRef(ofertaCupoRechazaDocumentoFlow), 'ofertaCupoRechazaDocumentoFlow'],
    [keyRef(retiroListaEsperaFlow), 'retiroListaEsperaFlow'],
    [keyRef(confirmoAsistenciaFlow), 'confirmoAsistenciaFlow'],
    [keyRef(necesitoCancelarFlow), 'necesitoCancelarFlow'],
    [keyRef(noPodreAsistirFlow), 'noPodreAsistirFlow'],
]);

const flujosNuevosExactos: FlowLike[] = [
    retiroListaEsperaFlow,
    confirmoAsistenciaFlow,
    necesitoCancelarFlow,
    noPodreAsistirFlow,
    ofertaCupoAceptaDocumentoFlow,
    ofertaCupoRechazaDocumentoFlow,
];

const registroReal = createFlow(flujosRegistrados as any);
const registroSinNuevos = createFlow((flujosRegistrados as FlowLike[]).filter((f) => !flujosNuevosExactos.includes(f)) as any);

/** Mismo llamado que hace CoreClass.handleMsg: `this.flowClass.find(body)`. */
function refDestino(registro: any, texto: string): string | null {
    const mensajes = registro.find(texto) as Array<{ keyword: string }>;
    return mensajes.length ? mensajes[0].keyword : null;
}

function destino(texto: string): string | null {
    const ref = refDestino(registroReal, texto);
    if (ref === null) return null;
    return nombres.get(ref) ?? `otro:${ref}`;
}

describe('Enrutamiento de keywords con el algoritmo real de @builderbot (runbook B1)', () => {
    describe('botones nuevos → flujo nuevo (coincidencia exacta)', () => {
        it.each([
            ['Confirmo asistencia', 'confirmoAsistenciaFlow'],
            ['Necesito cancelar', 'necesitoCancelarFlow'],
            ['No podré asistir', 'noPodreAsistirFlow'],
            ['Sí, lo tomo', 'ofertaCupoAceptaDocumentoFlow'],
            ['No puedo', 'ofertaCupoRechazaDocumentoFlow'],
            [' Confirmo asistencia ', 'confirmoAsistenciaFlow'],
        ])('"%s" → %s', (texto, esperado) => {
            expect(destino(texto)).toBe(esperado);
        });
    });

    describe('comando de retiro de lista de espera (B5)', () => {
        it.each([
            'Retirar lista de espera',
            'retirar lista de espera',
            'RETIRAR LISTA DE ESPERA.',
            'Retirarme de la lista de espera',
            'retirar de la lista de espera!',
            'Salir de la lista de espera',
            'salir lista de espera',
        ])('"%s" → retiroListaEsperaFlow', (texto) => {
            expect(destino(texto)).toBe('retiroListaEsperaFlow');
        });

        it('"Salir" a secas sigue cerrando la conversación (exitFlow)', () => {
            expect(destino('Salir')).toBe('exitFlow');
            expect(destino('salir')).toBe('exitFlow');
            expect(destino('Exit')).toBe('exitFlow');
        });

        it('una frase más larga que incluye "salir" sigue yendo a exitFlow', () => {
            expect(destino('quiero salir de la lista de espera ya mismo por favor')).toBe('exitFlow');
        });
    });

    describe('botones y keywords viejos → mismo flujo de siempre', () => {
        it.each([
            ['Confirmo', 'confirmarCitaDocumentoCampahna48Flow'],
            ['Confirmar', 'confirmarCitaDocumentoFlow'],
            ['Confirmar cita', 'confirmarCitaDocumentoFlow'],
            ['confirmar', 'confirmarCitaDocumentoFlow'],
            ['Cancelar', 'step1CencelarCita'],
            ['cancelar', 'step1CencelarCita'],
            ['Cancelo', 'step1CencelarCita'],
            ['280525004', 'step1CencelarCita'],
            ['En otro momento', 'respuestaCampahnaEnOtroMomento'],
            ['Ya finalicé mi proceso', 'respuestaCampahnaFinalizado'],
            ['Agendar cita', 'step1AgendarCita'],
            ['280525002', 'step1AgendarCita'],
            ['Reprogramar', 'step1Reprogramar'],
            ['280525003', 'step1Reprogramar'],
            ['280525005', 'pasoAgenteFlow'],
            ['PQRS', 'pqrsFlow'],
            [DISABLE_KEY, 'killSwitchFlow'],
        ])('"%s" → %s', (texto, esperado) => {
            expect(destino(texto)).toBe(esperado);
        });
    });

    describe('textos libres parecidos a los botones NO caen en los flujos nuevos', () => {
        it.each([
            ['hoy no puedo ir', null],
            ['no puedo', null],
            ['No puedo ir mañana', null],
            ['confirmo asistencia', 'confirmarCitaDocumentoCampahna48Flow'],
            ['Confirmo asistencia a mi cita', 'confirmarCitaDocumentoCampahna48Flow'],
            ['necesito cancelar mi cita', 'step1CencelarCita'],
            ['necesito cancelar', 'step1CencelarCita'],
            ['si, lo tomo', null],
            ['Sí, lo tomo por favor', null],
            ['no podré asistir mañana', null],
        ])('"%s" → %s', (texto, esperado) => {
            expect(destino(texto)).toBe(esperado);
        });
    });

    describe('regresión: sin contar los botones nuevos exactos, el enrutamiento es idéntico al registro sin flujos nuevos', () => {
        const corpus = [
            'Confirmo', 'Confirmar', 'Confirmar cita', 'confirmar', 'confirmo asistencia', 'Cancelar', 'cancelar',
            'Cancelo', 'cancelo', 'quiero cancelar mi cita', 'necesito cancelar', '4', '3', '5', '6', '280525001',
            '280525002', '280525003', '280525004', '280525005', '280525006', '280525011', '280525017',
            'Agendar cita', 'agendar', 'Reprogramar', 'reprogramar cita', 'PQRS', 'quejas', 'chatear con agente',
            'Hablar con asistente', 'Salir', 'salir', 'Exit', 'exit', 'En otro momento', 'Ya finalicé mi proceso',
            'Servicios', 'Convenios', 'Tarifas', 'Formas de pago', 'Ubicación', 'Horarios', 'Canales de atención',
            'Sí, avísame', 'No, gracias', 'Acepto', 'No acepto', 'hola', 'buenas tardes', 'hoy no puedo ir',
            'no puedo', 'si lo tomo', 'No podré', 'podré asistir', '1234567890', 'doc_cc', 'control_tipo_cedula',
            'psicologia_adulto', 'conv_poliza_sura', 'agindarcita_tipo_cd', 'recordatorio', 'ejecutar',
            'sinasistencia', 'conasistencia', DISABLE_KEY,
        ];
        it.each(corpus)('"%s"', (texto) => {
            expect(refDestino(registroReal, texto)).toBe(refDestino(registroSinNuevos, texto));
        });
    });

    it('los flujos nuevos exactos están registrados antes que exitFlow y que los flujos viejos', () => {
        const orden = (flujosRegistrados as FlowLike[]).map((f) => keyRef(f));
        const posExit = orden.indexOf(keyRef(exitFlow));
        for (const flow of flujosNuevosExactos) {
            const pos = orden.indexOf(keyRef(flow));
            expect(pos).toBeGreaterThanOrEqual(0);
            expect(pos).toBeLessThan(posExit);
        }
    });
});
