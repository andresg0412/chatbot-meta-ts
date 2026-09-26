// Runbook B2/B7/B9 en el armado de las plantillas (axios simulado: no se llama a Meta ni al backend).
// Verifica que: la plantilla sin botones sale EXACTAMENTE igual que antes; la variante con botones solo
// se usa para números piloto; la hora va como HH:MM y la fecha sin desfase en las plantillas nuevas y
// en la oferta; y que el número y orden de variables no cambia.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

import axios from 'axios';
import {
    enviarPlantillaConfirmacion,
    enviarPlantillaRecordatorio24h,
    enviarPlantillaDiaria,
    enviarPlantillaRecordatorio,
    enviarPlantillaOfertaCupo,
    retirarListaEspera,
    consultarListaEsperaPorDocumento,
    enviarMensajeTextoMeta,
} from '../apiService';

const post = (axios as any).post as jest.Mock;
const get = (axios as any).get as jest.Mock;
const ENV_ORIGINAL = { ...process.env };

const cita: any = {
    cita_id: '123',
    nombre_paciente: 'Paciente',
    especialidad: 'Especialidad',
    fecha_cita: '2026-10-05T05:00:00.000Z',
    hora_cita: '14:00:00',
    profesional: 'Profesional',
    tipo_cita: 1,
    administradora: null,
    telefono_paciente: '573001234567',
};

beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
        ...ENV_ORIGINAL,
        numberId: 'NUM',
        jwtToken: 'TOKEN',
        NOMBRE_PLANTILLA_META: 'vieja_24h',
        NOMBRE_PLANTILLA_META_BOTONES: 'nueva_24h_botones',
        NOMBRE_PLANTILLA_META_CONFIRMADO_24H: 'vieja_24h_conf',
        NOMBRE_PLANTILLA_META_CONFIRMADO_24H_BOTONES: 'nueva_24h_conf_botones',
        NOMBRE_PLANTILLA_META_DIARIA: 'vieja_2h',
        NOMBRE_PLANTILLA_META_DIARIA_BOTONES: 'nueva_2h_botones',
        NOMBRE_PLANTILLA_RECORDATORIO_META: 'vieja_48h',
        NOMBRE_PLANTILLA_RECORDATORIO_META_BOTONES: 'nueva_48h_botones',
        NOMBRE_PLANTILLA_OFERTA_CUPO: 'oferta_cupo_disponible',
    };
    delete process.env.LISTA_ESPERA_TELEFONOS_PILOTO;
    post.mockImplementation(async (url: string) => {
        if (url.includes('graph.facebook.com')) {
            return { status: 200, data: { messages: [{ id: 'wamid.1', message_status: 'accepted' }] } };
        }
        return { status: 200, data: { isError: false, code: 200 } };
    });
    for (const m of ['log', 'error', 'warn'] as const) jest.spyOn(console, m).mockImplementation(() => undefined);
});
afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...ENV_ORIGINAL };
});

function llamadaMeta() {
    const call = post.mock.calls.find((c) => String(c[0]).includes('graph.facebook.com'));
    return call?.[1];
}
const params = (body: any) => body.template.components[0].parameters.map((p: any) => p.text);

describe.each([
    ['enviarPlantillaConfirmacion', enviarPlantillaConfirmacion, 'vieja_24h', 'nueva_24h_botones', 7],
    ['enviarPlantillaRecordatorio24h', enviarPlantillaRecordatorio24h, 'vieja_24h_conf', 'nueva_24h_conf_botones', 3],
    ['enviarPlantillaDiaria', enviarPlantillaDiaria, 'vieja_2h', 'nueva_2h_botones', 4],
    ['enviarPlantillaRecordatorio', enviarPlantillaRecordatorio, 'vieja_48h', 'nueva_48h_botones', 7],
])('%s', (_nombre, fn: any, vieja, nueva, cantidad) => {
    it('interruptor apagado → plantilla vieja, hora sin cambios (HH:MM:SS), sin registrar envío', async () => {
        process.env.RECORDATORIOS_BOTONES_ENABLED = 'false';
        await fn(cita);
        const body = llamadaMeta();
        expect(body.template.name).toBe(vieja);
        expect(params(body)).toHaveLength(cantidad);
        expect(params(body)).toContain('14:00:00');
        expect(post.mock.calls.some((c) => String(c[0]).includes('registrar-envio'))).toBe(false);
    });

    it('interruptor encendido sin piloto → plantilla con botones, misma cantidad de variables, hora HH:MM', async () => {
        process.env.RECORDATORIOS_BOTONES_ENABLED = 'true';
        await fn(cita);
        const body = llamadaMeta();
        expect(body.template.name).toBe(nueva);
        expect(params(body)).toHaveLength(cantidad);
        expect(params(body)).toContain('14:00');
        expect(params(body)).not.toContain('14:00:00');
    });

    it('encendido con lista piloto → solo el número piloto recibe la variante con botones', async () => {
        process.env.RECORDATORIOS_BOTONES_ENABLED = 'true';
        process.env.LISTA_ESPERA_TELEFONOS_PILOTO = '3001234567';
        await fn(cita);
        expect(llamadaMeta().template.name).toBe(nueva);

        post.mockClear();
        await fn({ ...cita, telefono_paciente: '573009999999' });
        expect(llamadaMeta().template.name).toBe(vieja);
        expect(params(llamadaMeta())).toContain('14:00:00');
    });
});

it('variante con botones: fecha "5 de octubre de 2026" (sin desfase) en la plantilla de 48h', async () => {
    process.env.RECORDATORIOS_BOTONES_ENABLED = 'true';
    await enviarPlantillaRecordatorio(cita);
    expect(params(llamadaMeta())[2]).toBe('5 de octubre de 2026');
});

it('oferta de cupo: 4 variables en el mismo orden, fecha correcta y hora HH:MM', async () => {
    const r = await enviarPlantillaOfertaCupo('Paciente', '573001234567', 'Profesional', '2026-10-05', '14:00:00');
    expect(r).toEqual({ exito: true, mensajeWaId: 'wamid.1' });
    const body = llamadaMeta();
    expect(body.to).toBe('573001234567');
    expect(body.template.name).toBe('oferta_cupo_disponible');
    expect(params(body)).toEqual(['Paciente', 'Profesional', '5 de octubre de 2026', '14:00']);
});

it('retirarListaEspera usa el contrato POST /chatbot/listaespera/retirar', async () => {
    const ok = await retirarListaEspera({ lista_espera_id: 'LE1' });
    expect(ok).toBe(true);
    expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/chatbot\/listaespera\/retirar$/), { lista_espera_id: 'LE1' });
});

it('consultarListaEsperaPorDocumento: 200 → inscripciones; 400 (documento desconocido) → no encontrado; 500 → error', async () => {
    get.mockResolvedValueOnce({ data: { data: [{ lista_espera_id: 'LE1', estado: 'activa' }] } });
    expect(await consultarListaEsperaPorDocumento('123')).toEqual({ ok: true, encontrado: true, inscripciones: [{ lista_espera_id: 'LE1', estado: 'activa' }] });
    expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/chatbot\/listaespera$/), { params: { documento: '123' } });

    get.mockRejectedValueOnce({ response: { status: 400 } });
    expect(await consultarListaEsperaPorDocumento('999')).toEqual({ ok: true, encontrado: false, inscripciones: [] });

    get.mockRejectedValueOnce({ response: { status: 500 }, message: 'boom' });
    expect((await consultarListaEsperaPorDocumento('999')).ok).toBe(false);
});

it('enviarMensajeTextoMeta devuelve el error resumido de Meta sin lanzar', async () => {
    post.mockRejectedValueOnce({
        message: 'Request failed with status code 400',
        response: { status: 400, data: { error: { code: 131047, message: 'Re-engagement message', error_data: { details: 'more than 24 hours' } } } },
        config: { data: '{"to":"573158070460","text":{"body":"SENSIBLE"}}' },
    });
    const r = await enviarMensajeTextoMeta('573158070460', 'x');
    expect(r).toEqual({ exito: false, error: { http_status: 400, code: 131047, mensaje: 'more than 24 hours' } });
    expect(JSON.stringify(r)).not.toContain('SENSIBLE');
});
