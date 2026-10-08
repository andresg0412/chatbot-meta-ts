// Runbook B3/B6/B7/B9 en el poller de la cascada (apiService y avisoAsesor simulados: no hay envíos reales).
jest.mock('../../services/apiService', () => ({
    tickCascadaListaEspera: jest.fn(),
    enviarPlantillaOfertaCupo: jest.fn(async () => ({ exito: true, mensajeWaId: 'wamid.1' })),
    confirmarEnvioOfertaCupo: jest.fn(async () => true),
    marcarFalloOfertaCupo: jest.fn(async () => true),
    confirmarEscalamientoListaEspera: jest.fn(async () => true),
}));
jest.mock('../avisoAsesor', () => ({
    enviarAvisoAsesor: jest.fn(async () => true),
}));

import * as api from '../../services/apiService';
import * as aviso from '../avisoAsesor';
import {
    _runCascadaTickParaPruebas,
    _resetPollerParaPruebas,
    _setSendRawParaPruebas,
    _ejecutarTickSerializadoParaPruebas,
    construirMensajeEscalamiento,
    triggerCascadaTickNow,
    obtenerRetrasoTickRapidoMs,
    programarTickCascadaRetrasado,
    DEFAULT_RETRASO_OFERTA_SEG,
    MARGEN_RETRASO_OFERTA_MS,
} from '../listaEsperaCascadaPoller';
import { AccionCascada, AccionEscalar } from '../../interfaces/ICascadaListaEspera';

const mockedApi = api as jest.Mocked<typeof api>;
const mockedAviso = aviso as jest.Mocked<typeof aviso>;

const ENV_ORIGINAL = { ...process.env };

const ofertar = (telefono: string | null, ventana: any = 600): AccionCascada => ({
    tipo: 'ofertar',
    cupo_liberado_id: 'CUPO0001',
    lista_espera_id: 'LE000001',
    oferta_id: 'OFERTA01',
    paciente_id: 'PAC00001',
    nombre_paciente: 'Nombre Paciente Real',
    telefono_paciente: telefono,
    especialidad: 'NoDebeSalir',
    profesional: 'Profesional X',
    fecha_cita: '2026-10-05',
    hora_cita: '14:00:00',
    nivel_cascada_origen: 1,
    ventana_respuesta_segundos: ventana,
});

const escalar: AccionEscalar = {
    tipo: 'escalar',
    cupo_liberado_id: 'CUPO0002',
    profesional: 'Profesional X',
    fecha_cita: '2099-10-05',
    hora_cita: '14:00:00',
    motivo: 'fila_agotada',
    candidatos_contactados: 1,
    resumen_respuestas: { aceptaron: 0, rechazaron: 1, sin_respuesta: 0 },
};

const pausa: AccionCascada = {
    tipo: 'notificar_pausa',
    lista_espera_id: 'LE000009',
    paciente_id: 'PAC00009',
    nombre_paciente: 'Nombre Paciente Real',
    telefono_paciente: '3001234567',
};

let sendRaw: jest.Mock;
let logs: string[];

beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ENV_ORIGINAL };
    delete process.env.LISTA_ESPERA_TELEFONOS_PILOTO;
    process.env.CANAL_ESCALAMIENTO_LISTA_ESPERA = '573158070460';
    sendRaw = jest.fn(async () => undefined);
    logs = [];
    for (const metodo of ['log', 'warn', 'error'] as const) {
        jest.spyOn(console, metodo).mockImplementation((...args: any[]) => {
            logs.push(args.map(String).join(' '));
        });
    }
});

afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...ENV_ORIGINAL };
});

async function tick(acciones: AccionCascada[]) {
    mockedApi.tickCascadaListaEspera.mockResolvedValueOnce(acciones);
    await _runCascadaTickParaPruebas(sendRaw);
}

describe('modo observación (LISTA_ESPERA_CASCADA_ENABLED != true) — B3', () => {
    beforeEach(() => {
        process.env.LISTA_ESPERA_CASCADA_ENABLED = 'false';
    });

    it('no envía oferta, ni aviso al asesor, ni aviso de pausa; y no confirma nada al backend', async () => {
        await tick([ofertar('3001234567'), escalar, pausa]);
        expect(mockedApi.enviarPlantillaOfertaCupo).not.toHaveBeenCalled();
        expect(mockedApi.confirmarEnvioOfertaCupo).not.toHaveBeenCalled();
        expect(mockedApi.marcarFalloOfertaCupo).not.toHaveBeenCalled();
        expect(mockedAviso.enviarAvisoAsesor).not.toHaveBeenCalled();
        expect(mockedApi.confirmarEscalamientoListaEspera).not.toHaveBeenCalled();
        expect(sendRaw).not.toHaveBeenCalled();
        expect(logs.some((l) => l.includes('modo observación') && l.includes("'escalar'"))).toBe(true);
    });

    it('los logs no contienen nombre ni teléfono completo (B9)', async () => {
        await tick([ofertar('573001234567'), pausa]);
        const todo = logs.join('\n');
        expect(todo).not.toContain('Nombre Paciente Real');
        expect(todo).not.toContain('3001234567');
        expect(todo).toContain('4567');
    });
});

describe('cascada encendida', () => {
    beforeEach(() => {
        process.env.LISTA_ESPERA_CASCADA_ENABLED = 'true';
    });

    it.each([
        ['3001234567', '573001234567'],
        ['573001234567', '573001234567'],
        ['+57 300 123 4567', '573001234567'],
    ])('oferta a %s se envía normalizada a %s y se confirma', async (entrada, esperado) => {
        await tick([ofertar(entrada)]);
        expect(mockedApi.enviarPlantillaOfertaCupo).toHaveBeenCalledWith(
            'Nombre Paciente Real', esperado, 'Profesional X', '2026-10-05', '14:00:00', 10, 'OFERTA01'
        );
        expect(mockedApi.confirmarEnvioOfertaCupo).toHaveBeenCalledWith('CUPO0001', 'LE000001', 'wamid.1', 600);
    });

    it.each([[null], [''], ['123']])('teléfono %p no contactable → no envía, marca fallo telefono_no_contactable', async (tel) => {
        await tick([ofertar(tel)]);
        expect(mockedApi.enviarPlantillaOfertaCupo).not.toHaveBeenCalled();
        expect(mockedApi.confirmarEnvioOfertaCupo).not.toHaveBeenCalled();
        expect(mockedApi.marcarFalloOfertaCupo).toHaveBeenCalledWith('CUPO0001', 'LE000001', 'telefono_no_contactable');
    });

    it('envío fallido en Meta → marca fallo envio_meta_fallido, no confirma', async () => {
        mockedApi.enviarPlantillaOfertaCupo.mockResolvedValueOnce({ exito: false });
        await tick([ofertar('3001234567')]);
        expect(mockedApi.confirmarEnvioOfertaCupo).not.toHaveBeenCalled();
        expect(mockedApi.marcarFalloOfertaCupo).toHaveBeenCalledWith('CUPO0001', 'LE000001', 'envio_meta_fallido');
    });

    it('confirmar-envio devuelve false (409) → no reintenta ni marca fallo; el log no promete reintento', async () => {
        mockedApi.confirmarEnvioOfertaCupo.mockResolvedValueOnce(false);
        await tick([ofertar('3001234567')]);
        expect(mockedApi.enviarPlantillaOfertaCupo).toHaveBeenCalledTimes(1);
        expect(mockedApi.confirmarEnvioOfertaCupo).toHaveBeenCalledTimes(1);
        expect(mockedApi.marcarFalloOfertaCupo).not.toHaveBeenCalled();
        const todo = logs.join('\n');
        expect(todo).not.toContain('Se reevaluará');
        expect(todo).toContain('No se reintenta ni se marca fallo');
        expect(todo).not.toContain('Nombre Paciente Real');
        expect(todo).not.toContain('3001234567');
    });

    it('ventana de 900 s → la plantilla recibe 15 minutos y confirmar-envio recibe 900 (eco)', async () => {
        await tick([ofertar('3001234567', 900)]);
        expect(mockedApi.enviarPlantillaOfertaCupo).toHaveBeenCalledWith(
            'Nombre Paciente Real', '573001234567', 'Profesional X', '2026-10-05', '14:00:00', 15, 'OFERTA01'
        );
        expect(mockedApi.confirmarEnvioOfertaCupo).toHaveBeenCalledWith('CUPO0001', 'LE000001', 'wamid.1', 900);
    });

    it('ventana de 420 s → 7 minutos', async () => {
        await tick([ofertar('3001234567', 420)]);
        expect(mockedApi.enviarPlantillaOfertaCupo.mock.calls[0][5]).toBe(7);
        expect(mockedApi.confirmarEnvioOfertaCupo).toHaveBeenCalledWith('CUPO0001', 'LE000001', 'wamid.1', 420);
    });

    it.each([[undefined], [0], [-60], [600.5], [Number.NaN], [Number.POSITIVE_INFINITY], ['600']])(
        'ventana %p inválida → no envía la plantilla y marca fallo ventana_invalida',
        async (ventana) => {
            // Se sobreescribe el campo directamente (el default del helper reemplazaría un undefined).
            await tick([{ ...(ofertar('3001234567') as any), ventana_respuesta_segundos: ventana }]);
            expect(mockedApi.enviarPlantillaOfertaCupo).not.toHaveBeenCalled();
            expect(mockedApi.confirmarEnvioOfertaCupo).not.toHaveBeenCalled();
            expect(mockedApi.marcarFalloOfertaCupo).toHaveBeenCalledWith('CUPO0001', 'LE000001', 'ventana_invalida');
            const todo = logs.join('\n');
            expect(todo).not.toContain('Nombre Paciente Real');
            expect(todo).not.toContain('3001234567');
            expect(todo).toContain(`ventana ${ventana}s`);
        }
    );

    it('escalar → aviso al asesor y confirmación', async () => {
        await tick([escalar]);
        expect(mockedAviso.enviarAvisoAsesor).toHaveBeenCalledWith(
            expect.objectContaining({ tipo: 'escalamiento_lista_espera', canal: '573158070460', referencia: 'cupo:CUPO0002' })
        );
        expect(mockedApi.confirmarEscalamientoListaEspera).toHaveBeenCalledWith('CUPO0002');
    });

    it('notificar_pausa → aviso al paciente con teléfono normalizado', async () => {
        await tick([pausa]);
        expect(sendRaw).toHaveBeenCalledWith('573001234567', expect.stringContaining('saliste de la lista de espera'));
    });

    it('notificar_pausa con reactivación automática → el aviso dice que se reactiva solo, sin pedir reinscribirse', async () => {
        await tick([{ ...pausa, reactivacion_dias: 7 } as AccionCascada]);
        const texto = sendRaw.mock.calls[0][1] as string;
        expect(texto).toContain('7 días');
        expect(texto).toContain('automáticamente');
        expect(texto).not.toContain('volver a inscribirte');
        expect(texto).not.toContain('saliste de la lista');
    });

    describe('lista piloto (B7)', () => {
        beforeEach(() => {
            process.env.LISTA_ESPERA_TELEFONOS_PILOTO = '573110000000';
        });

        it('número fuera del piloto → no envía, marca fallo fuera_de_piloto (la cascada avanza)', async () => {
            await tick([ofertar('3001234567')]);
            expect(mockedApi.enviarPlantillaOfertaCupo).not.toHaveBeenCalled();
            expect(mockedApi.confirmarEnvioOfertaCupo).not.toHaveBeenCalled();
            expect(mockedApi.marcarFalloOfertaCupo).toHaveBeenCalledWith('CUPO0001', 'LE000001', 'fuera_de_piloto');
        });

        it('número piloto (10 dígitos vs 57...) → sí envía', async () => {
            await tick([ofertar('3110000000')]);
            expect(mockedApi.enviarPlantillaOfertaCupo).toHaveBeenCalledWith(
                expect.any(String), '573110000000', expect.any(String), expect.any(String), expect.any(String), expect.any(Number), 'OFERTA01'
            );
        });

        it('aviso de pausa a un número fuera del piloto no se envía', async () => {
            await tick([pausa]);
            expect(sendRaw).not.toHaveBeenCalled();
        });
    });
});

describe('mensaje de escalamiento', () => {
    it('hora HH:MM y fecha larga; marca como informativo si el cupo ya pasó', () => {
        const futuro = construirMensajeEscalamiento(escalar);
        expect(futuro).toContain('5 de octubre de 2099 14:00');
        expect(futuro).not.toContain('14:00:00');
        expect(futuro).not.toContain('Informativo');
        const pasado = construirMensajeEscalamiento({ ...escalar, fecha_cita: '2020-01-01' });
        expect(pasado).toContain('Informativo');
        expect(pasado).not.toContain('URGENTE');
    });

    it('fila_agotada con cupo lejano → etiqueta legible + código, sin URGENTE', () => {
        const m = construirMensajeEscalamiento(escalar);
        expect(m).toContain('Motivo: Ningún candidato de la lista de espera aceptó el cupo. (fila_agotada)');
        expect(m).not.toContain('URGENTE');
    });

    it('antelacion_critica con cupo en ~1h → etiqueta, código y línea URGENTE', () => {
        // Fecha/hora de Bogotá (UTC-5 fijo) dentro de ~1h.
        const bogota = new Date(Date.now() + 60 * 60 * 1000 - 5 * 60 * 60 * 1000);
        const fecha = bogota.toISOString().slice(0, 10);
        const hora = bogota.toISOString().slice(11, 16) + ':00';
        const m = construirMensajeEscalamiento({
            ...escalar,
            fecha_cita: fecha,
            hora_cita: hora,
            motivo: 'antelacion_critica',
            candidatos_contactados: 0,
            resumen_respuestas: { aceptaron: 0, rechazaron: 0, sin_respuesta: 0 },
        });
        expect(m).toContain('🚨 URGENTE: el cupo es en menos de 2 horas');
        expect(m).toContain('Faltan 2 horas o menos para el cupo; no se ofreció automáticamente. Gestionar por llamada.');
        expect(m).toContain('(antelacion_critica)');
        expect(m).toContain('Candidatos contactados: 0');
        expect(m).not.toContain('Informativo');
    });

    it('motivo desconocido → se muestra el código tal cual', () => {
        const m = construirMensajeEscalamiento({ ...escalar, motivo: 'motivo_nuevo_xyz' });
        expect(m).toContain('Motivo: motivo_nuevo_xyz\n');
    });

    it('no menciona la especialidad ni términos clínicos', () => {
        const m = construirMensajeEscalamiento({ ...escalar, motivo: 'antelacion_critica' }).toLowerCase();
        for (const t of ['especialidad', 'sesión', 'terapia', 'psicólog', 'proceso']) expect(m).not.toContain(t);
    });
});

describe('guarda de ejecución única (corrección R2, 1.13)', () => {
    // Deja correr las microtareas/macrotareas pendientes (los triggers son fire-and-forget).
    const flush = () => new Promise<void>((r) => setImmediate(r));

    let enCurso: number;
    let maxConcurrencia: number;
    let liberadores: Array<() => void>;

    beforeEach(() => {
        _resetPollerParaPruebas();
        _setSendRawParaPruebas(sendRaw);
        enCurso = 0;
        maxConcurrencia = 0;
        liberadores = [];
        // Cada tick queda bloqueado hasta que el test lo libera; se mide la concurrencia.
        mockedApi.tickCascadaListaEspera.mockImplementation(() => {
            enCurso++;
            maxConcurrencia = Math.max(maxConcurrencia, enCurso);
            return new Promise<AccionCascada[]>((resolve) => {
                liberadores.push(() => {
                    enCurso--;
                    resolve([]);
                });
            });
        });
    });

    afterEach(() => {
        _resetPollerParaPruebas();
    });

    async function liberarSiguiente() {
        const liberar = liberadores.shift();
        expect(liberar).toBeDefined();
        liberar!();
        await flush();
    }

    it('dos triggers seguidos durante un tick bloqueado → exactamente 2 ticks, nunca en paralelo', async () => {
        triggerCascadaTickNow();
        await flush();
        expect(mockedApi.tickCascadaListaEspera).toHaveBeenCalledTimes(1);

        triggerCascadaTickNow();
        await flush();
        expect(mockedApi.tickCascadaListaEspera).toHaveBeenCalledTimes(1);

        await liberarSiguiente();
        expect(mockedApi.tickCascadaListaEspera).toHaveBeenCalledTimes(2);
        await liberarSiguiente();

        await flush();
        expect(mockedApi.tickCascadaListaEspera).toHaveBeenCalledTimes(2);
        expect(maxConcurrencia).toBe(1);
        expect(liberadores).toHaveLength(0);
    });

    it('tres triggers durante el tick en curso → se agrupan en un solo tick extra', async () => {
        triggerCascadaTickNow();
        await flush();
        triggerCascadaTickNow();
        triggerCascadaTickNow();
        triggerCascadaTickNow();
        await flush();
        expect(mockedApi.tickCascadaListaEspera).toHaveBeenCalledTimes(1);

        await liberarSiguiente();
        await liberarSiguiente();
        await flush();
        expect(mockedApi.tickCascadaListaEspera).toHaveBeenCalledTimes(2);
        expect(maxConcurrencia).toBe(1);
    });

    it('el camino del setInterval comparte la guarda con triggerCascadaTickNow', async () => {
        const programado = _ejecutarTickSerializadoParaPruebas(sendRaw); // equivalente al callback del setInterval
        await flush();
        triggerCascadaTickNow();
        await flush();
        expect(mockedApi.tickCascadaListaEspera).toHaveBeenCalledTimes(1);

        await liberarSiguiente();
        await liberarSiguiente();
        await programado;
        expect(mockedApi.tickCascadaListaEspera).toHaveBeenCalledTimes(2);
        expect(maxConcurrencia).toBe(1);
    });

    it('si el tick lanza, la guarda se libera y el siguiente trigger ejecuta', async () => {
        mockedApi.tickCascadaListaEspera.mockImplementationOnce(async () => {
            throw new Error('backend caído');
        });
        triggerCascadaTickNow();
        await flush();
        expect(mockedApi.tickCascadaListaEspera).toHaveBeenCalledTimes(1);

        triggerCascadaTickNow();
        await flush();
        expect(mockedApi.tickCascadaListaEspera).toHaveBeenCalledTimes(2);
        await liberarSiguiente();
        expect(maxConcurrencia).toBe(1);
    });

    it('si runCascadaTick lanzara de todos modos (error fuera de su try), el finally libera la guarda', async () => {
        // Se simula un fallo que escapa del try/catch de runCascadaTick haciendo que el propio
        // console.error (usado en su catch) lance una vez.
        mockedApi.tickCascadaListaEspera.mockImplementationOnce(async () => {
            throw new Error('boom');
        });
        (console.error as jest.Mock).mockImplementationOnce(() => {
            throw new Error('fallo en el catch');
        });
        await expect(_ejecutarTickSerializadoParaPruebas(sendRaw)).rejects.toThrow('fallo en el catch');

        triggerCascadaTickNow();
        await flush();
        expect(mockedApi.tickCascadaListaEspera).toHaveBeenCalledTimes(2);
        await liberarSiguiente();
    });

    it('triggerCascadaTickNow sin sendRaw cacheado no ejecuta ni lanza', () => {
        _setSendRawParaPruebas(null);
        expect(() => triggerCascadaTickNow()).not.toThrow();
        expect(mockedApi.tickCascadaListaEspera).not.toHaveBeenCalled();
    });
});

describe('tick rápido retrasado tras confirmar cancelar/reprogramar (revisión 2026-10-01, B1/B5-2)', () => {
    afterEach(() => {
        jest.useRealTimers();
        _resetPollerParaPruebas();
    });

    it('default: 20 s + margen de 5 s', () => {
        delete process.env.LISTA_ESPERA_RETRASO_OFERTA_SEG;
        expect(DEFAULT_RETRASO_OFERTA_SEG).toBe(20);
        expect(MARGEN_RETRASO_OFERTA_MS).toBe(5000);
        expect(obtenerRetrasoTickRapidoMs()).toBe(25000);
    });

    it.each([
        ['30', 35000],
        ['0', 5000],
        ['7.5', 12500],
        ['', 25000],
        ['  ', 25000],
        ['abc', 25000],
        ['-3', 25000],
    ])('LISTA_ESPERA_RETRASO_OFERTA_SEG=%p → %d ms', (valor, esperado) => {
        process.env.LISTA_ESPERA_RETRASO_OFERTA_SEG = valor;
        expect(obtenerRetrasoTickRapidoMs()).toBe(esperado);
    });

    it('no hace el tick antes del retraso y sí al cumplirse', async () => {
        jest.useFakeTimers();
        delete process.env.LISTA_ESPERA_RETRASO_OFERTA_SEG;
        mockedApi.tickCascadaListaEspera.mockResolvedValue([]);
        _setSendRawParaPruebas(sendRaw);

        programarTickCascadaRetrasado();
        expect(mockedApi.tickCascadaListaEspera).not.toHaveBeenCalled();

        jest.advanceTimersByTime(24999);
        expect(mockedApi.tickCascadaListaEspera).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
        expect(mockedApi.tickCascadaListaEspera).toHaveBeenCalledTimes(1);
    });

    it('sin sendRaw cacheado (poller no arrancado) no lanza al vencer el timer', () => {
        jest.useFakeTimers();
        _setSendRawParaPruebas(null);
        expect(() => programarTickCascadaRetrasado()).not.toThrow();
        expect(() => jest.advanceTimersByTime(60000)).not.toThrow();
        expect(mockedApi.tickCascadaListaEspera).not.toHaveBeenCalled();
    });
});
