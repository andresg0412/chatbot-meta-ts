// Sesión con identificador y motivos de cierre (docs/features/2026-09-29-trazabilidad-usuarios.md, 4.3.2
// y 11.2): sesion_inicio/sesion_fin, corrección de la doble emisión de `chat_abandonado`, final de negocio
// y compatibilidad con el userSessionsDB.json viejo. No se toca el archivo real de sesiones (fs simulado
// para esa ruta) ni la red (apiService simulado).
jest.mock('fs', () => {
    const real = jest.requireActual('fs');
    const esSesiones = (p: unknown) => String(p).endsWith('userSessionsDB.json');
    return {
        ...real,
        existsSync: jest.fn((p: any) => (esSesiones(p) ? !!(global as any).__sesionesJson : real.existsSync(p))),
        readFileSync: jest.fn((p: any, ...a: any[]) => (esSesiones(p) ? (global as any).__sesionesJson : real.readFileSync(p, ...a))),
        writeFileSync: jest.fn((p: any, ...a: any[]) => (esSesiones(p) ? undefined : real.writeFileSync(p, ...a))),
    };
});
// Sin red: axios simulado y sin API_BACKEND_URL (el flush no envía nada; los eventos se leen de la cola).
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));
jest.mock('../../services/apiService', () => ({
    registrarActividadBot: jest.fn(async () => true),
}));

const ENV_ORIGINAL = { ...process.env };
const TEL = '573001234567';
const UNA_HORA = 60 * 60 * 1000;

function cargar(sesionesJson?: string) {
    (global as any).__sesionesJson = sesionesJson;
    let modulos: any;
    jest.isolateModules(() => {
        modulos = {
            mgr: require('../proactiveSessionManager'),
            timeout: require('../proactiveSessionTimeout'),
            traza: require('../trazabilidad'),
            api: require('../../services/apiService'),
        };
    });
    return modulos as {
        mgr: typeof import('../proactiveSessionManager');
        timeout: typeof import('../proactiveSessionTimeout');
        traza: typeof import('../trazabilidad');
        api: { registrarActividadBot: jest.Mock };
    };
}

const eventos = (traza: any, tipo: string) => traza._estadoParaPruebas().cola.filter((e: any) => e.tipo_evento === tipo);

beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-29T15:00:00.000Z'));
    process.env = { ...ENV_ORIGINAL, TRAZABILIDAD_V2_ENABLED: 'true' };
    delete process.env.API_BACKEND_URL;
    for (const m of ['log', 'error', 'warn'] as const) jest.spyOn(console, m).mockImplementation(() => undefined);
});
afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    process.env = { ...ENV_ORIGINAL };
    delete (global as any).__sesionesJson;
});

it('abrir sesión emite sesion_inicio con disparador; cerrar emite sesion_fin con motivo, último flujo/paso, duración y mensajes (una sola vez)', () => {
    const { mgr, traza } = cargar();
    mgr.updateUserActivity(TEL, 'welcome');
    const [inicio] = eventos(traza, 'sesion_inicio');
    expect(inicio).toEqual(expect.objectContaining({ telefono: TEL, sesion_id: expect.any(String), metadata: { disparador: 'welcome' } }));

    traza.trackPaso(TEL, 'agendar.s08_fechas');
    traza.registrarMensajeSesionTraza(TEL);
    traza.trackIdentificacion(TEL, '12345678', 'encontrado', 'agendar.s15_documento');
    jest.advanceTimersByTime(90 * 1000);
    mgr.closeUserSession(TEL, 'salir');
    mgr.closeUserSession(TEL, 'salir');

    const fines = eventos(traza, 'sesion_fin');
    expect(fines).toHaveLength(1);
    expect(fines[0]).toEqual(expect.objectContaining({
        sesion_id: inicio.sesion_id,
        resultado: 'salir',
        flujo: 'agendar',
        paso: 'agendar.s08_fechas',
        documento: '12345678',
        duracion_ms: 90 * 1000,
        metadata: { mensajes: 2 },
    }));
    // Los eventos intermedios heredan sesión y documento.
    expect(eventos(traza, 'flujo_paso')[0].sesion_id).toBe(inicio.sesion_id);
});

it('timeout: chat_abandonado se registra UNA sola vez (timer) y el siguiente mensaje no lo duplica', async () => {
    const { mgr, timeout, traza, api } = cargar();
    mgr.updateUserActivity(TEL, 'welcome');
    traza.trackPaso(TEL, 'agendar.s10_selecciona_hora');
    jest.advanceTimersByTime(UNA_HORA + 1);

    const abandonos = () => api.registrarActividadBot.mock.calls.filter((c: any[]) => c[0] === 'chat_abandonado');
    expect(abandonos()).toHaveLength(1);
    expect(abandonos()[0][3]).toEqual(expect.objectContaining({ flujo: 'agendar', paso: 'agendar.s10_selecciona_hora' }));
    expect(eventos(traza, 'sesion_fin').map((e: any) => e.resultado)).toEqual(['timeout']);

    await expect(timeout.checkSessionTimeout(TEL)).resolves.toBe(false);
    expect(abandonos()).toHaveLength(1);
    expect(eventos(traza, 'sesion_fin')).toHaveLength(1);
});

it('sin sesión previa (entrada por keyword), checkSessionTimeout no registra un abandono falso', async () => {
    const { timeout, api } = cargar();
    await expect(timeout.checkSessionTimeout('573009999999')).resolves.toBe(false);
    expect(api.registrarActividadBot).not.toHaveBeenCalled();
});

it('checkSessionTimeout con traza emite flujo_paso y actualiza el último paso', async () => {
    const { mgr, timeout, traza } = cargar();
    mgr.updateUserActivity(TEL, 'welcome');
    await expect(timeout.checkSessionTimeout(TEL, undefined, undefined, { paso: 'menu.principal' })).resolves.toBe(true);
    expect(eventos(traza, 'flujo_paso')[0]).toEqual(expect.objectContaining({ flujo: 'menu', paso: 'menu.principal' }));
    expect(mgr.getSesionInfo(TEL)?.ultimoPaso).toBe('menu.principal');
});

it('con un final de negocio (p. ej. Conocer la IPS) el timeout posterior es "completado"; al entrar a otro flujo vuelve a ser abandono', () => {
    const { mgr, traza } = cargar();
    mgr.updateUserActivity(TEL, 'welcome');
    traza.trackPaso(TEL, 'conocer_ips.servicios');
    traza.trackFin(TEL, 'conocer_ips', 'informativo');
    traza.trackPaso(TEL, 'comun.volver_menu');
    jest.advanceTimersByTime(UNA_HORA + 1);
    expect(eventos(traza, 'sesion_fin').map((e: any) => e.resultado)).toEqual(['completado']);

    mgr.updateUserActivity(TEL, 'welcome');
    traza.trackFin(TEL, 'conocer_ips', 'informativo');
    traza.trackPaso(TEL, 'agendar.s01_tipo_cita');
    jest.advanceTimersByTime(UNA_HORA + 1);
    expect(eventos(traza, 'sesion_fin').map((e: any) => e.resultado)).toEqual(['completado', 'timeout']);
});

it('cierres nuevos (crisis, respuestas a campaña) solo con el interruptor encendido', () => {
    const { mgr, traza } = cargar();
    mgr.updateUserActivity(TEL, 'welcome');
    process.env.TRAZABILIDAD_V2_ENABLED = 'false';
    traza.cerrarSesionTraza(TEL, 'crisis');
    expect(mgr.getSesionInfo(TEL)).not.toBeNull();
    process.env.TRAZABILIDAD_V2_ENABLED = 'true';
    traza.cerrarSesionTraza(TEL, 'crisis');
    expect(mgr.getSesionInfo(TEL)).toBeNull();
    expect(eventos(traza, 'sesion_fin').map((e: any) => e.resultado)).toEqual(['crisis']);
});

it('asegurarSesionTraza abre sesión "respuesta_plantilla" solo si no hay una activa', () => {
    const { mgr, traza } = cargar();
    traza.asegurarSesionTraza(TEL, 'respuesta_plantilla');
    const id = mgr.getSesionInfo(TEL)?.sesionId;
    traza.asegurarSesionTraza(TEL, 'respuesta_plantilla');
    expect(mgr.getSesionInfo(TEL)?.sesionId).toBe(id);
    expect(eventos(traza, 'sesion_inicio').map((e: any) => e.metadata.disparador)).toEqual(['respuesta_plantilla']);
});

it('compatibilidad: userSessionsDB.json viejo ({lastActivity,isActive}) se lee y la sesión activa recibe un sesionId', () => {
    const ahora = Date.now();
    const { mgr, traza } = cargar(JSON.stringify({ [TEL]: { lastActivity: ahora - 1000, isActive: true }, '573000000000': { lastActivity: ahora, isActive: false } }));
    const info = mgr.getSesionInfo(TEL);
    expect(info?.sesionId).toEqual(expect.any(String));
    expect(mgr.getSesionInfo('573000000000')).toBeNull();
    mgr.closeUserSession(TEL);
    expect(eventos(traza, 'sesion_fin')[0]).toEqual(expect.objectContaining({ sesion_id: info?.sesionId, resultado: 'completado' }));
});

it('al reiniciar: sesión vencida hace <12h → reinicio_bot; >12h → timeout_12h', () => {
    const ahora = Date.now();
    const { mgr, traza } = cargar(JSON.stringify({
        '573000000001': { lastActivity: ahora - 2 * UNA_HORA, isActive: true, sesionId: 'S1', inicioAt: ahora - 3 * UNA_HORA },
        '573000000002': { lastActivity: ahora - 13 * UNA_HORA, isActive: true, sesionId: 'S2', inicioAt: ahora - 14 * UNA_HORA },
    }));
    mgr.cleanupOldSessionsWithoutNotification();
    mgr.restoreActiveTimers();
    const fines = eventos(traza, 'sesion_fin').map((e: any) => [e.sesion_id, e.resultado]);
    expect(fines).toEqual(expect.arrayContaining([['S2', 'timeout_12h'], ['S1', 'reinicio_bot']]));
    expect(fines).toHaveLength(2);
});

it('con el interruptor apagado no se emite ningún evento nuevo', () => {
    process.env.TRAZABILIDAD_V2_ENABLED = 'false';
    const { mgr, traza } = cargar();
    mgr.updateUserActivity(TEL, 'welcome');
    mgr.closeUserSession(TEL, 'salir');
    expect(traza._estadoParaPruebas().cola).toHaveLength(0);
});
