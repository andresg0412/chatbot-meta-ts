import {
    esErrorGlobhoMovimiento,
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
});
