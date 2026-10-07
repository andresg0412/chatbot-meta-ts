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
    confirmarEnvioOfertaCupo,
    marcarFalloOfertaCupo,
    confirmarEscalamientoListaEspera,
    tickCascadaListaEspera,
    TIMEOUT_BACKEND_CASCADA_MS,
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

it('oferta de cupo: 5 variables en orden (nombre, profesional, fecha, hora HH:MM, minutos)', async () => {
    const r = await enviarPlantillaOfertaCupo('Paciente', '573001234567', 'Profesional', '2026-10-05', '14:00:00', 7);
    expect(r).toEqual({ exito: true, mensajeWaId: 'wamid.1' });
    const body = llamadaMeta();
    expect(body.to).toBe('573001234567');
    expect(body.template.name).toBe('oferta_cupo_disponible');
    expect(params(body)).toEqual(['Paciente', 'Profesional', '5 de octubre de 2026', '14:00', '7']);
});

it('confirmarEnvioOfertaCupo manda ventana_respuesta_segundos en el body (eco de la ventana)', async () => {
    const ok = await confirmarEnvioOfertaCupo('CUPO1', 'LE1', 'wamid.1', 900);
    expect(ok).toBe(true);
    expect(post).toHaveBeenCalledWith(
        expect.stringMatching(/\/chatbot\/listaespera\/cascada\/oferta\/confirmar-envio$/),
        { cupo_liberado_id: 'CUPO1', lista_espera_id: 'LE1', mensaje_wa_id: 'wamid.1', ventana_respuesta_segundos: 900 },
        { timeout: TIMEOUT_BACKEND_CASCADA_MS }
    );
});

describe('timeout en las llamadas al backend dentro del tick de cascada', () => {
    it('la constante es 20000 ms', () => {
        expect(TIMEOUT_BACKEND_CASCADA_MS).toBe(20000);
    });

    it('tickCascadaListaEspera pasa timeout y devuelve las acciones', async () => {
        post.mockResolvedValueOnce({ data: { data: { acciones: [{ tipo: 'escalar' }] } } });
        expect(await tickCascadaListaEspera()).toEqual([{ tipo: 'escalar' }]);
        expect(post).toHaveBeenCalledWith(
            expect.stringMatching(/\/chatbot\/listaespera\/cascada\/tick$/),
            {},
            expect.objectContaining({ timeout: TIMEOUT_BACKEND_CASCADA_MS })
        );
    });

    it('tickCascadaListaEspera: timeout de axios (ECONNABORTED) → [] sin lanzar', async () => {
        post.mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout of 20000ms exceeded' });
        expect(await tickCascadaListaEspera()).toEqual([]);
    });

    it('confirmarEnvioOfertaCupo pasa timeout; timeout de axios → false sin lanzar', async () => {
        await confirmarEnvioOfertaCupo('CUPO1', 'LE1', 'wamid.1', 600);
        expect(post.mock.calls[0][2]).toEqual(expect.objectContaining({ timeout: TIMEOUT_BACKEND_CASCADA_MS }));
        post.mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout of 20000ms exceeded' });
        expect(await confirmarEnvioOfertaCupo('CUPO1', 'LE1', 'wamid.1', 600)).toBe(false);
    });

    it('marcarFalloOfertaCupo y confirmarEscalamientoListaEspera pasan timeout', async () => {
        await marcarFalloOfertaCupo('CUPO1', 'LE1', 'envio_meta_fallido');
        await confirmarEscalamientoListaEspera('CUPO1');
        expect(post.mock.calls[0][0]).toMatch(/marcar-fallo$/);
        expect(post.mock.calls[0][2]).toEqual(expect.objectContaining({ timeout: TIMEOUT_BACKEND_CASCADA_MS }));
        expect(post.mock.calls[1][2]).toEqual(expect.objectContaining({ timeout: TIMEOUT_BACKEND_CASCADA_MS }));
    });

    it('enviarMensajeTextoMeta (aviso al asesor) ya pasa timeout de 15000', async () => {
        await enviarMensajeTextoMeta('573158070460', 'x');
        expect(llamadaMetaConfig()).toEqual(expect.objectContaining({ timeout: 15000 }));
    });
});

function llamadaMetaConfig() {
    const call = post.mock.calls.find((c) => String(c[0]).includes('graph.facebook.com'));
    return call?.[2];
}

it.each([
    ['PACIENTE_CON_OFERTA_ACTIVA'],
    ['CUPO_NO_DISPONIBLE'],
    ['OFERTA_NO_DISPONIBLE'],
    [undefined],
])('confirmarEnvioOfertaCupo con 409 (cause %p) → false, una sola llamada, sin marcar-fallo, cause en el log', async (cause) => {
    const warn = console.warn as jest.Mock;
    post.mockRejectedValueOnce({
        message: 'Request failed with status code 409',
        response: { status: 409, data: { isError: true, code: 409, ...(cause ? { cause } : {}) } },
    });
    const ok = await confirmarEnvioOfertaCupo('CUPO1', 'LE1', 'wamid.1', 900);
    expect(ok).toBe(false);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls.some((c) => String(c[0]).includes('marcar-fallo'))).toBe(false);
    const todo = warn.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(todo).toContain(`cause=${cause ?? 'SIN_CAUSE'}`);
    expect(todo).toContain('CUPO1');
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


it.each([enviarPlantillaConfirmacion,enviarPlantillaRecordatorio24h,enviarPlantillaRecordatorio])(
    'Fase 4: flag de plantillas v2 agrega R al final conservando indices existentes',async enviar=>{
        process.env.RECORDATORIOS_BOTONES_ENABLED='true';
        process.env.RECORDATORIOS_PAYLOAD_ENABLED='true';
        process.env.RECORDATORIOS_REPROGRAMAR_ENABLED='true';
        await enviar({...cita,cita_id:'A1B2C3D4'});
        const botones=llamadaMeta().template.components.filter((c:any)=>c.type==='button');
        expect(botones.map((b:any)=>b.parameters[0].payload)).toEqual(['LEREC:A1B2C3D4:C','LEREC:A1B2C3D4:X','LEREC:A1B2C3D4:N','LEREC:A1B2C3D4:R']);
        expect(botones.map((b:any)=>b.index)).toEqual(['0','1','2','3']);
    }
);
it('Fase 4: recordatorio 2h nunca agrega Reprogramar',async()=>{
    process.env.RECORDATORIOS_BOTONES_ENABLED='true';
    process.env.RECORDATORIOS_PAYLOAD_ENABLED='true';
    process.env.RECORDATORIOS_REPROGRAMAR_ENABLED='true';
    await enviarPlantillaDiaria({...cita,cita_id:'A1B2C3D4'});
    expect(llamadaMeta().template.components.filter((c:any)=>c.type==='button')).toHaveLength(3);
});
