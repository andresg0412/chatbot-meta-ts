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
import { _runCascadaTickParaPruebas, construirMensajeEscalamiento } from '../listaEsperaCascadaPoller';
import { AccionCascada, AccionEscalar } from '../../interfaces/ICascadaListaEspera';

const mockedApi = api as jest.Mocked<typeof api>;
const mockedAviso = aviso as jest.Mocked<typeof aviso>;

const ENV_ORIGINAL = { ...process.env };

const ofertar = (telefono: string | null): AccionCascada => ({
    tipo: 'ofertar',
    cupo_liberado_id: 'CUPO0001',
    lista_espera_id: 'LE000001',
    paciente_id: 'PAC00001',
    nombre_paciente: 'Nombre Paciente Real',
    telefono_paciente: telefono,
    especialidad: 'NoDebeSalir',
    profesional: 'Profesional X',
    fecha_cita: '2026-10-05',
    hora_cita: '14:00:00',
    nivel_cascada_origen: 1,
    ventana_respuesta_segundos: 600,
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
            'Nombre Paciente Real', esperado, 'Profesional X', '2026-10-05', '14:00:00'
        );
        expect(mockedApi.confirmarEnvioOfertaCupo).toHaveBeenCalledWith('CUPO0001', 'LE000001', 'wamid.1');
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
                expect.any(String), '573110000000', expect.any(String), expect.any(String), expect.any(String)
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
    });
});
