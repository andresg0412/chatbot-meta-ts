import {
    esErrorGlobhoMovimiento,
    esErrorPostgresTrasGlobho,
    mensajeCitaMovidaPendienteVerificacion,
    mensajeErrorGlobhoMovimiento,
    MENSAJE_MOVIMIENTO_CITA_RESTAURADA,
    numeroAsesorHumano,
} from '../mensajesMovimientoCita';

const ORIGINAL = process.env.NUMERO_ASESOR_HUMANO;

afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.NUMERO_ASESOR_HUMANO;
    else process.env.NUMERO_ASESOR_HUMANO = ORIGINAL;
});

describe('mensajesMovimientoCita', () => {
    it('esErrorGlobhoMovimiento solo con 502 + GLOBHO_ERROR', () => {
        expect(esErrorGlobhoMovimiento(502, 'GLOBHO_ERROR')).toBe(true);
        expect(esErrorGlobhoMovimiento(500, 'GLOBHO_ERROR')).toBe(false);
        expect(esErrorGlobhoMovimiento(502, 'OTRA')).toBe(false);
        expect(esErrorGlobhoMovimiento(502, undefined)).toBe(false);
        expect(esErrorGlobhoMovimiento(undefined, undefined)).toBe(false);
    });

    it('restaurada=true → la cita actual sigue igual', () => {
        expect(mensajeErrorGlobhoMovimiento(true)).toBe(MENSAJE_MOVIMIENTO_CITA_RESTAURADA);
        expect(MENSAJE_MOVIMIENTO_CITA_RESTAURADA).toBe(
            'No pudimos mover tu cita en este momento; tu cita actual sigue igual. Intenta de nuevo en unos minutos.'
        );
    });

    it('restaurada=false o ausente → recepción/asesor con el número por defecto', () => {
        delete process.env.NUMERO_ASESOR_HUMANO;
        for (const v of [false, undefined, null]) {
            const m = mensajeErrorGlobhoMovimiento(v as any);
            expect(m).toContain('recepción');
            expect(m).toContain('https://wa.me/573158070460');
        }
    });

    it('usa NUMERO_ASESOR_HUMANO si está definido', () => {
        process.env.NUMERO_ASESOR_HUMANO = '573000000000';
        expect(numeroAsesorHumano()).toBe('573000000000');
        expect(mensajeErrorGlobhoMovimiento(false)).toContain('https://wa.me/573000000000');
    });

    it('privacidad: ningún texto menciona servicio ni especialidad', () => {
        const textos = [mensajeErrorGlobhoMovimiento(true), mensajeErrorGlobhoMovimiento(false)].join(' ').toLowerCase();
        for (const prohibido of ['psicolog', 'terapia', 'sesión', 'sesion', 'proceso', 'especialidad', 'psiquiatr']) {
            expect(textos).not.toContain(prohibido);
        }
    });

    it('esErrorPostgresTrasGlobho solo con 502 + POSTGRES_DESPUES_DE_GLOBHO', () => {
        expect(esErrorPostgresTrasGlobho(502, 'POSTGRES_DESPUES_DE_GLOBHO')).toBe(true);
        expect(esErrorPostgresTrasGlobho(500, 'POSTGRES_DESPUES_DE_GLOBHO')).toBe(false);
        expect(esErrorPostgresTrasGlobho(502, 'GLOBHO_ERROR')).toBe(false);
        expect(esErrorGlobhoMovimiento(502, 'POSTGRES_DESPUES_DE_GLOBHO')).toBe(false);
    });

    it('cita movida pendiente de verificación: con fecha y hora, sin ellas, y sin invitar a reintentar', () => {
        delete process.env.NUMERO_ASESOR_HUMANO;
        expect(mensajeCitaMovidaPendienteVerificacion('2026-10-10', '07:00:00')).toBe(
            'Tu cita sí quedó movida al nuevo horario (📅 10 de octubre de 2026 🕐 07:00), pero necesitamos verificarla en nuestro sistema. ' +
            'Un asesor la revisará; si quieres, comunícate con él:\n👉 https://wa.me/573158070460'
        );
        expect(mensajeCitaMovidaPendienteVerificacion()).toBe(
            'Tu cita sí quedó movida al nuevo horario, pero necesitamos verificarla en nuestro sistema. ' +
            'Un asesor la revisará; si quieres, comunícate con él:\n👉 https://wa.me/573158070460'
        );
        expect(mensajeCitaMovidaPendienteVerificacion('2026-10-10')).toContain('(📅 10 de octubre de 2026)');
        process.env.NUMERO_ASESOR_HUMANO = '573000000000';
        const m = mensajeCitaMovidaPendienteVerificacion('2026-10-10', '07:00');
        expect(m).toContain('https://wa.me/573000000000');
        expect(m.toLowerCase()).not.toMatch(/intenta|de nuevo|nuevamente/);
        for (const prohibido of ['psicolog', 'terapia', 'sesión', 'sesion', 'proceso', 'especialidad', 'psiquiatr']) {
            expect(m.toLowerCase()).not.toContain(prohibido);
        }
    });
});
