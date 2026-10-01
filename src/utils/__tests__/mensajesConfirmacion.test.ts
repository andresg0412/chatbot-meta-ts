// Textos de 4.6 de proyecto-ips/docs/features/2026-09-27-confirmar-cita-ya-confirmada.md.
import {
    construirRespuestaConfirmacion,
    fraseFechaHora,
    metricaConfirmacionCampahna,
    metricaConfirmacionRecordatorio,
    resultadoConfirmacionDesdeRecordatorio,
    MENSAJE_AGRADECIMIENTO_CONFIRMACION,
    MENSAJE_DOCUMENTO_FINAL,
    MENSAJE_DOCUMENTO_REINTENTO,
    MENSAJE_ERROR_CONFIRMACION,
    MENSAJE_GLOBHO_ERROR,
} from '../mensajesConfirmacion';
import type { ResultadoConfirmacion } from '../../services/apiService';

const FH = { fecha_cita: '2026-09-28', hora_cita: '10:00:00' };

describe('fraseFechaHora', () => {
    it('con fecha y hora', () => {
        expect(fraseFechaHora('2026-09-28', '10:00:00')).toBe(' del 28 de septiembre de 2026 a las 10:00');
    });
    it('fecha ISO con hora (serialización de columna DATE) sin desfase', () => {
        expect(fraseFechaHora('2026-09-28T05:00:00.000Z', '9:05')).toBe(' del 28 de septiembre de 2026 a las 09:05');
    });
    it('sin fecha, sin hora o sin ninguna → vacío', () => {
        expect(fraseFechaHora(undefined, '10:00:00')).toBe('');
        expect(fraseFechaHora('2026-09-28', undefined)).toBe('');
        expect(fraseFechaHora()).toBe('');
    });
});

describe('construirRespuestaConfirmacion (camino A, campañas)', () => {
    const casos: Array<[string, ResultadoConfirmacion, string[], string[]]> = [
        [
            'confirmada',
            { ok: true, estado: 'confirmada', ...FH },
            ['✅ ¡Tu cita del 28 de septiembre de 2026 a las 10:00 ha sido confirmada exitosamente!', MENSAJE_AGRADECIMIENTO_CONFIRMACION],
            ['✅ ¡Tu cita ha sido confirmada exitosamente!', MENSAJE_AGRADECIMIENTO_CONFIRMACION],
        ],
        [
            'ya_confirmada',
            { ok: true, estado: 'ya_confirmada', ...FH },
            ['😊 Tu cita del 28 de septiembre de 2026 a las 10:00 ya se encuentra confirmada. No necesitas hacer nada más. ¡Te esperamos!'],
            ['😊 Tu cita ya se encuentra confirmada. No necesitas hacer nada más. ¡Te esperamos!'],
        ],
        [
            'CITA_CANCELADA',
            { ok: false, causa: 'CITA_CANCELADA', ...FH },
            ['Tu cita del 28 de septiembre de 2026 a las 10:00 figura como cancelada. Si deseas agendar una nueva, escribe *hola*.'],
            ['Tu cita figura como cancelada. Si deseas agendar una nueva, escribe *hola*.'],
        ],
        [
            'CITA_REPROGRAMADA',
            { ok: false, causa: 'CITA_REPROGRAMADA', ...FH },
            ['Tu cita del 28 de septiembre de 2026 a las 10:00 fue reprogramada. Si tienes dudas sobre tu nueva fecha, escribe *hola* para consultarla.'],
            ['Tu cita fue reprogramada. Si tienes dudas sobre tu nueva fecha, escribe *hola* para consultarla.'],
        ],
        [
            'CITA_PASADA',
            { ok: false, causa: 'CITA_PASADA', ...FH },
            ['La hora de tu cita del 28 de septiembre de 2026 a las 10:00 ya pasó. Si necesitas una nueva cita, escribe *hola*.'],
            ['La hora de tu cita ya pasó. Si necesitas una nueva cita, escribe *hola*.'],
        ],
        ['GLOBHO_ERROR', { ok: false, causa: 'GLOBHO_ERROR' }, [MENSAJE_GLOBHO_ERROR], [MENSAJE_GLOBHO_ERROR]],
        ['ERROR', { ok: false, causa: 'ERROR' }, [MENSAJE_ERROR_CONFIRMACION], [MENSAJE_ERROR_CONFIRMACION]],
    ];

    it.each(casos)('%s con fecha/hora', (_n, resultado, conFecha) => {
        expect(construirRespuestaConfirmacion(resultado, 'campahna', 0)).toEqual({ siguiente: 'fin', mensajes: conFecha });
    });

    it.each(casos)('%s sin fecha/hora', (_n, resultado, _c, sinFecha) => {
        const { fecha_cita, hora_cita, ...sinFH } = resultado as any;
        expect(construirRespuestaConfirmacion(sinFH, 'campahna', 0)).toEqual({ siguiente: 'fin', mensajes: sinFecha });
    });

    it('ningún mensaje tiene dobles espacios ni menciona la especialidad', () => {
        for (const [, resultado] of casos) {
            for (const conFH of [true, false]) {
                const r: any = conFH ? { ...resultado, especialidad: 'Psicología' } : { ok: resultado.ok, ...(resultado.ok ? { estado: (resultado as any).estado } : { causa: (resultado as any).causa }) };
                for (const m of construirRespuestaConfirmacion(r, 'campahna', 0).mensajes) {
                    expect(m).not.toMatch(/ {2}/);
                    expect(m).not.toMatch(/Psicolog/i);
                }
            }
        }
    });

    it.each(['CITA_NOT_FOUND', 'DOCUMENTO_INVALIDO'] as const)('%s: primera vez reintenta, segunda cierra', (causa) => {
        expect(construirRespuestaConfirmacion({ ok: false, causa }, 'campahna', 0)).toEqual({
            siguiente: 'reintentar',
            mensajes: [MENSAJE_DOCUMENTO_REINTENTO],
        });
        expect(construirRespuestaConfirmacion({ ok: false, causa }, 'campahna', 1)).toEqual({
            siguiente: 'fin',
            mensajes: [MENSAJE_DOCUMENTO_FINAL],
        });
    });

    it('textos de reintento y final son los de 4.6', () => {
        expect(MENSAJE_DOCUMENTO_REINTENTO).toBe('No encontramos una cita pendiente con ese número de documento. Por favor verifica y escríbelo nuevamente.');
        expect(MENSAJE_DOCUMENTO_FINAL).toBe('No encontramos una cita asociada a este número y documento. Si crees que es un error, escribe *hola* y elige *Chatear con agente* para que un asesor te ayude.');
        expect(MENSAJE_GLOBHO_ERROR).toBe('No pudimos registrar tu confirmación en este momento. Si ya confirmaste tu cita con nuestro equipo, no necesitas hacer nada más. Si no, intenta de nuevo más tarde o escríbenos.');
        expect(MENSAJE_ERROR_CONFIRMACION).toBe('❌ No pudimos procesar tu confirmación en este momento. Intenta nuevamente más tarde.');
        expect(MENSAJE_AGRADECIMIENTO_CONFIRMACION).toBe('Gracias por confirmar tu cita. Si necesitas más ayuda, no dudes en preguntar. ¡Feliz día!');
    });
});

describe('construirRespuestaConfirmacion (camino B, "Confirmo asistencia")', () => {
    it('confirmada', () => {
        expect(construirRespuestaConfirmacion({ ok: true, estado: 'confirmada', ...FH }, 'recordatorio', 0).mensajes).toEqual([
            '✅ ¡Listo! Tu cita del 28 de septiembre de 2026 a las 10:00 quedó confirmada. Te esperamos. 😊',
        ]);
        expect(construirRespuestaConfirmacion({ ok: true, estado: 'confirmada' }, 'recordatorio', 0).mensajes).toEqual([
            '✅ ¡Listo! Tu cita quedó confirmada. Te esperamos. 😊',
        ]);
    });

    it('ya_confirmada', () => {
        expect(construirRespuestaConfirmacion({ ok: true, estado: 'ya_confirmada', ...FH }, 'recordatorio', 0).mensajes).toEqual([
            '😊 ¡Gracias por avisarnos! Tu cita del 28 de septiembre de 2026 a las 10:00 ya está confirmada. No necesitas hacer nada más. ¡Te esperamos!',
        ]);
        expect(construirRespuestaConfirmacion({ ok: true, estado: 'ya_confirmada' }, 'recordatorio', 0).mensajes).toEqual([
            '😊 ¡Gracias por avisarnos! Tu cita ya está confirmada. No necesitas hacer nada más. ¡Te esperamos!',
        ]);
    });

    it('errores con los mismos textos que el camino A', () => {
        for (const causa of ['CITA_CANCELADA', 'CITA_REPROGRAMADA', 'CITA_PASADA', 'GLOBHO_ERROR', 'ERROR'] as const) {
            expect(construirRespuestaConfirmacion({ ok: false, causa, ...FH }, 'recordatorio', 0)).toEqual(
                construirRespuestaConfirmacion({ ok: false, causa, ...FH }, 'campahna', 0)
            );
        }
        expect(construirRespuestaConfirmacion({ ok: false, causa: 'CITA_NOT_FOUND' }, 'recordatorio', 0).siguiente).toBe('reintentar');
        expect(construirRespuestaConfirmacion({ ok: false, causa: 'CITA_NOT_FOUND' }, 'recordatorio', 1).mensajes).toEqual([MENSAJE_DOCUMENTO_FINAL]);
    });
});

describe('resultadoConfirmacionDesdeRecordatorio', () => {
    it('ya_confirmada con fecha y hora', () => {
        expect(resultadoConfirmacionDesdeRecordatorio({
            ok: true,
            data: { accion: 'confirma', persistido: true, estado_resultado: 'ya_confirmada', ...FH },
        })).toEqual({ ok: true, estado: 'ya_confirmada', ...FH });
    });
    it('sin estado_resultado (backend viejo) → confirmada', () => {
        expect(resultadoConfirmacionDesdeRecordatorio({ ok: true, data: { accion: 'confirma', persistido: false } }))
            .toEqual({ ok: true, estado: 'confirmada' });
    });
    it('fallo pasa tal cual', () => {
        expect(resultadoConfirmacionDesdeRecordatorio({ ok: false, causa: 'CITA_PASADA', ...FH }))
            .toEqual({ ok: false, causa: 'CITA_PASADA', ...FH });
    });
});

describe('métricas', () => {
    it('campañas', () => {
        expect(metricaConfirmacionCampahna({ ok: true, estado: 'confirmada' })).toEqual({ estado: 'confirmado', resultado: 'exitoso' });
        expect(metricaConfirmacionCampahna({ ok: true, estado: 'ya_confirmada' })).toEqual({ estado: 'ya_confirmado', resultado: 'exitoso' });
        expect(metricaConfirmacionCampahna({ ok: false, causa: 'CITA_NOT_FOUND' })).toEqual({ estado: 'no_confirmado', resultado: 'cita_not_found' });
        expect(metricaConfirmacionCampahna({ ok: false, causa: 'GLOBHO_ERROR' })).toEqual({ estado: 'no_confirmado', resultado: 'globho_error' });
    });
    it('recordatorio', () => {
        expect(metricaConfirmacionRecordatorio({ ok: true, estado: 'confirmada' })).toBe('exitoso');
        expect(metricaConfirmacionRecordatorio({ ok: true, estado: 'ya_confirmada' })).toBe('ya_confirmada');
        expect(metricaConfirmacionRecordatorio({ ok: false, causa: 'DOCUMENTO_INVALIDO' })).toBe('documento_invalido');
    });
});
