// Runbook B1 (proyecto-ips/docs/features/2026-09-26-lista-espera-runbook-produccion.md): verifica, con
// el algoritmo REAL de @builderbot (FlowClass.find de node_modules/@builderbot/bot/dist/index.cjs) y
// la lista REAL de flujos registrada en templates/index.ts, a qué flujo va cada texto de botón nuevo y
// viejo, y que todo texto que no sea exactamente un botón nuevo se enruta igual que si los flujos
// nuevos no existieran (regresión).

// proactiveSessionManager arranca un setInterval al importarse (mantendría vivo el proceso de jest).
jest.mock('../../utils/proactiveSessionManager', () => ({
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
import { construirFlujosRegistrados, FLUJOS_BOTONES_RECORDATORIO } from '../index';
const flujosRegistrados = construirFlujosRegistrados(true);
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
import { step1AgendarCita, step13AgendarCitaAgente, step14AgendarCita2 } from '../flujos/agendarCita';
import { IDS_TIPO_DOCUMENTO, IDS_TIPO_DOCUMENTO_RETIRADOS } from '../../utils/datosPacienteNuevo';
import { pasoAgenteFlow } from '../flujos/pasoAgente';
import { pqrsFlow } from '../flujos/pasoAgente/enviarpqrs';
import { multimediaFlow } from '../flujos/multimediaFlow';
import { ofertaCupoAceptaDocumentoFlow, ofertaCupoRechazaDocumentoFlow, retiroListaEsperaFlow, invitacionAceptaFlow, invitacionRechazaFlow, invitacionAgenteFlow } from '../flujos/listaEspera';
import { confirmoAsistenciaFlow, necesitoCancelarFlow, noPodreAsistirFlow, botonesConfirmarCancelacionFlow, reprogramarRecordatorioFlow } from '../flujos/recordatorios';
import { ID_FILA_NINGUNA, idFilaCita, MAX_CITAS_EN_LISTA, PREFIJO_ID_FILA_CITA } from '../../utils/mensajesRecordatorio';

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
    [keyRef(step14AgendarCita2), 'step14AgendarCita2'],
    [keyRef(step13AgendarCitaAgente), 'step13AgendarCitaAgente'],
    [keyRef(pasoAgenteFlow), 'pasoAgenteFlow'],
    [keyRef(pqrsFlow), 'pqrsFlow'],
    [keyRef(multimediaFlow), 'multimediaFlow'],
    [keyRef(ofertaCupoAceptaDocumentoFlow), 'ofertaCupoAceptaDocumentoFlow'],
    [keyRef(ofertaCupoRechazaDocumentoFlow), 'ofertaCupoRechazaDocumentoFlow'],
    [keyRef(retiroListaEsperaFlow), 'retiroListaEsperaFlow'],
    [keyRef(confirmoAsistenciaFlow), 'confirmoAsistenciaFlow'],
    [keyRef(necesitoCancelarFlow), 'necesitoCancelarFlow'],
    [keyRef(noPodreAsistirFlow), 'noPodreAsistirFlow'],
    [keyRef(botonesConfirmarCancelacionFlow), 'botonesConfirmarCancelacionFlow'],
    [keyRef(reprogramarRecordatorioFlow), 'reprogramarRecordatorioFlow'],
]);

const flujosNuevosExactos: FlowLike[] = [
    reprogramarRecordatorioFlow,
    retiroListaEsperaFlow,
    confirmoAsistenciaFlow,
    necesitoCancelarFlow,
    noPodreAsistirFlow,
    botonesConfirmarCancelacionFlow,
    ofertaCupoAceptaDocumentoFlow,
    ofertaCupoRechazaDocumentoFlow,
    // Invitación a la lista de espera: "Si, deseo ingresar" / "No, gracias" / "Hablar con agente" exactos.
    invitacionAceptaFlow,
    invitacionRechazaFlow,
    invitacionAgenteFlow,
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
    describe('Fase 1: multimedia y digitos de menu', () => {
        it.each([
            '_event_voice_note__1a2b3c4d-5678',
            '_event_location__1a2b3c4d-5678',
            '_event_media__1a2b3c4d-5678',
        ])('"%s" -> multimediaFlow', (texto) => expect(destino(texto)).toBe('multimediaFlow'));

        it.each([
            ['3', 'step1Reprogramar'], ['280525003', 'step1Reprogramar'], ['Reprogramar cita', 'step1Reprogramar'],
            ['4', 'step1CencelarCita'], ['5', 'pasoAgenteFlow'], ['280525005', 'pasoAgenteFlow'],
            ['6', 'pqrsFlow'], ['quejas', 'pqrsFlow'],
            ['hablar_con_agente', 'step13AgendarCitaAgente'],
        ])('"%s" -> %s', (texto, esperado) => expect(destino(texto)).toBe(esperado));

        it.each(['tengo 3 hijos', 'cita a las 4'])('"%s" no abre flujos numericos', (texto) => {
            expect(['step1Reprogramar', 'step1CencelarCita', 'pasoAgenteFlow', 'pqrsFlow']).not.toContain(destino(texto));
        });
    });

    describe('botones nuevos → flujo nuevo (coincidencia exacta)', () => {
        it.each([
            ['Confirmo asistencia', 'confirmoAsistenciaFlow'],
            ['Reprogramar', 'reprogramarRecordatorioFlow'],
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
            ['reprogramar', 'step1Reprogramar'],
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
            'Agendar cita', 'agendar', 'reprogramar', 'reprogramar cita', 'PQRS', 'quejas', 'chatear con agente',
            'Hablar con asistente', 'Salir', 'salir', 'Exit', 'exit', 'En otro momento', 'Ya finalicé mi proceso',
            'Servicios', 'Convenios', 'Tarifas', 'Formas de pago', 'Ubicación', 'Horarios', 'Canales de atención',
            'Sí, avísame', 'no, gracias', 'No gracias', 'Acepto', 'No acepto', 'hola', 'buenas tardes', 'hoy no puedo ir',
            'no puedo', 'si lo tomo', 'No podré', 'podré asistir', '1234567890', 'doc_cc', 'control_tipo_cedula',
            'psicologia_adulto', 'conv_poliza_sura', 'agindarcita_tipo_cd', 'agindarcita_tipo_pt', 'agindarcita_tipo_ot', 'recordatorio', 'ejecutar',
            'sinasistencia', 'conasistencia', DISABLE_KEY,
        ];
        it.each(corpus)('"%s"', (texto) => {
            expect(refDestino(registroReal, texto)).toBe(refDestino(registroSinNuevos, texto));
        });
    });

    // Registro de paciente nuevo (revisión 2026-10-01, A3): los ids de la lista de tipo de documento
    // deben llegar a step14AgendarCita2. La grafía "agindarcita" es necesaria: con "agendarcita" el
    // keyword 'agendar' de step1AgendarCita se queda con la respuesta y reinicia el flujo.
    describe('ids de la lista de tipo de documento (step14)', () => {
        // Incluye el nuevo `agindarcita_tipo_pt` (PT) y el retirado `agindarcita_tipo_ot` (listas viejas:
        // debe llegar a step14 para que vuelva a mostrar la lista, no a otro flujo por subcadena).
        it.each([...IDS_TIPO_DOCUMENTO, ...IDS_TIPO_DOCUMENTO_RETIRADOS])('"%s" → step14AgendarCita2', (id) => {
            expect(destino(id)).toBe('step14AgendarCita2');
        });
        it('el id de PT está en la lista vigente', () => {
            expect(IDS_TIPO_DOCUMENTO).toContain('agindarcita_tipo_pt');
        });
        it.each(['agendarcita_tipo_cd', 'agendarcita_tipo_pt'])('"%s" (grafía "agendar") NO llega a step14AgendarCita2', (id) => {
            expect(destino(id)).not.toBe('step14AgendarCita2');
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

// TBOT-03 (proyecto-ips/docs/features/2026-10-02-informe-qa-lista-espera.md): con
// RECORDATORIOS_BOTONES_ENABLED apagado, los botones de recordatorio no se registran y la frase escrita a
// mano no puede cancelar una cita sin confirmación.
describe('TBOT-03: botones de recordatorio con RECORDATORIOS_BOTONES_ENABLED apagado', () => {
    const flujosSinBotones = construirFlujosRegistrados(false) as FlowLike[];
    const registroSinBotones = createFlow(flujosSinBotones as any);
    const destinoSinBotones = (texto: string): string | null => {
        const ref = refDestino(registroSinBotones, texto);
        if (ref === null) return null;
        return nombres.get(ref) ?? `otro:${ref}`;
    };

    it('no registra los 3 flujos de botón de recordatorio, pero sí el resto', () => {
        for (const flow of [confirmoAsistenciaFlow, necesitoCancelarFlow, noPodreAsistirFlow]) {
            expect(flujosSinBotones).not.toContain(flow);
        }
        expect(flujosSinBotones).toContain(ofertaCupoAceptaDocumentoFlow);
        expect(flujosSinBotones).toContain(retiroListaEsperaFlow);
        expect(flujosSinBotones).not.toContain(botonesConfirmarCancelacionFlow);
        expect(FLUJOS_BOTONES_RECORDATORIO).toHaveLength(5);
        expect(flujosSinBotones.length).toBe((flujosRegistrados as FlowLike[]).length - FLUJOS_BOTONES_RECORDATORIO.length);
    });

    it('por defecto (flag sin definir) deja fuera los botones de recordatorio', () => {
        const anterior = process.env.RECORDATORIOS_BOTONES_ENABLED;
        delete process.env.RECORDATORIOS_BOTONES_ENABLED;
        try {
            expect(construirFlujosRegistrados()).not.toContain(necesitoCancelarFlow);
        } finally {
            if (anterior !== undefined) process.env.RECORDATORIOS_BOTONES_ENABLED = anterior;
        }
    });

    it('"Necesito cancelar" va al flujo guiado de cancelar cita', () => {
        expect(destinoSinBotones('Necesito cancelar')).toBe('step1CencelarCita');
    });

    it.each(['Confirmo asistencia', 'No podré asistir'])('"%s" no llega a un flujo de recordatorio', (texto) => {
        expect(['confirmoAsistenciaFlow', 'necesitoCancelarFlow', 'noPodreAsistirFlow']).not.toContain(destinoSinBotones(texto));
    });

    it('"Sí, cancelar" sigue yendo al flujo guiado de cancelar, como siempre', () => {
        expect(destinoSinBotones('Sí, cancelar')).toBe('step1CencelarCita');
    });

    it('la oferta de cupo sigue funcionando', () => {
        expect(destinoSinBotones('Sí, lo tomo')).toBe('ofertaCupoAceptaDocumentoFlow');
        expect(destinoSinBotones('No puedo')).toBe('ofertaCupoRechazaDocumentoFlow');
    });
});

// TB-05 / TBOT-03: ids de la lista de citas y botones de confirmar la cancelación.
describe('TB-05: ids de la lista de citas y botones "Sí, cancelar" / "No, mantener"', () => {
    const ids = [...Array.from({ length: MAX_CITAS_EN_LISTA }, (_, i) => idFilaCita(i)), ID_FILA_NINGUNA];
    const registroSinBotones = createFlow(construirFlujosRegistrados(false) as any);

    it('los ids son únicos, sin dígitos y con el prefijo', () => {
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) {
            expect(id.startsWith(PREFIJO_ID_FILA_CITA)).toBe(true);
            expect(id).not.toMatch(/[0-9]/);
        }
    });

    it.each(ids)('"%s" no lo captura ningún flujo por keyword (lo atiende la captura de la lista)', (id) => {
        expect(refDestino(registroReal, id)).toBeNull();
        expect(refDestino(registroSinBotones, id)).toBeNull();
    });

    it.each(['Sí, cancelar', 'No, mantener', ' Sí, cancelar '])('"%s" → botonesConfirmarCancelacionFlow (antes que cancelar)', (texto) => {
        expect(destino(texto)).toBe('botonesConfirmarCancelacionFlow');
    });

    it.each([['si, cancelar', 'step1CencelarCita'], ['Sí, cancelar mi cita', 'step1CencelarCita']])(
        'texto libre "%s" → %s (sin cambios)', (texto, esperado) => {
            expect(destino(texto)).toBe(esperado);
        });
});
