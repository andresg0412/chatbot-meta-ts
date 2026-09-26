// Runbook B2/B9: formateo de fecha/hora independiente de la zona horaria del proceso.
import { formatearFechaLarga, formatearHoraHHMM, extraerFechaISO, instanteBogota } from '../fechaHora';

import { spawnSync } from 'child_process';
import path from 'path';

// Cambiar process.env.TZ dentro del proceso de jest no es confiable (en Windows no surte efecto), así
// que las comprobaciones que dependen de la zona horaria corren en un proceso de Node hijo con TZ
// fijada, cargando el mismo módulo TypeScript con tsx (igual que producción: PM2 + tsx).
const RAIZ = path.resolve(__dirname, '../../..');

function ejecutarEnTZ(tz: string): any {
    const script = `
        const f = require('./src/utils/fechaHora.ts');
        const entradas = ['2026-10-05', '2026-01-01', '2026-12-31', '2026-10-05T05:00:00.000Z', '2026-10-05T00:00:00.000Z'];
        console.log(JSON.stringify({
            tzResuelta: Intl.DateTimeFormat().resolvedOptions().timeZone,
            offset: new Date(Date.UTC(2026, 9, 5, 12)).getTimezoneOffset(),
            nuevo: entradas.map((e) => f.formatearFechaLarga(e)),
            anterior: new Date('2026-10-05').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }),
            instante: f.instanteBogota('2026-10-05', '14:00:00'),
        }));`;
    const r = spawnSync(process.execPath, ['-r', 'tsx/cjs', '-e', script], {
        cwd: RAIZ,
        env: { ...process.env, TZ: tz },
        encoding: 'utf-8',
    });
    if (r.status !== 0) throw new Error(`Proceso hijo falló (TZ=${tz}): ${r.stderr}`);
    const lineas = r.stdout.trim().split(/\r?\n/);
    return JSON.parse(lineas[lineas.length - 1]);
}

describe.each([
    ['UTC', 0],
    ['America/Bogota', 300],
])('formatearFechaLarga en un proceso con TZ=%s', (tz, offsetEsperado) => {
    let r: any;
    beforeAll(() => {
        r = ejecutarEnTZ(tz as string);
    }, 30000);

    it('control: el proceso hijo realmente corre en esa zona horaria', () => {
        expect(r.tzResuelta).toBe(tz);
        expect(r.offset).toBe(offsetEsperado);
    });

    it('fechas YYYY-MM-DD e ISO de columna DATE → día correcto', () => {
        expect(r.nuevo).toEqual([
            '5 de octubre de 2026',
            '1 de enero de 2026',
            '31 de diciembre de 2026',
            '5 de octubre de 2026',
            '5 de octubre de 2026',
        ]);
    });

    it('instanteBogota no depende de la TZ del proceso', () => {
        expect(r.instante).toBe(Date.UTC(2026, 9, 5, 19, 0));
    });

    it('control: el formateo anterior (new Date + zona local) solo acertaba en UTC', () => {
        expect(r.anterior).toBe(tz === 'UTC' ? '5 de octubre de 2026' : '4 de octubre de 2026');
    });
});

describe('formatearFechaLarga casos borde', () => {
    it('vacío / null → cadena vacía', () => {
        expect(formatearFechaLarga('')).toBe('');
        expect(formatearFechaLarga(null)).toBe('');
        expect(formatearFechaLarga(undefined)).toBe('');
    });
    it('texto sin forma de fecha se devuelve tal cual', () => {
        expect(formatearFechaLarga('mañana')).toBe('mañana');
    });
    it('extraerFechaISO rechaza meses inválidos', () => {
        expect(extraerFechaISO('2026-13-01')).toBeNull();
    });
});

describe('formatearHoraHHMM (B9)', () => {
    it.each([
        ['14:00:00', '14:00'],
        ['09:30:00', '09:30'],
        ['9:05', '09:05'],
        ['07:00', '07:00'],
        ['', ''],
        ['sin hora', 'sin hora'],
    ])('%s → %s', (entrada, esperado) => {
        expect(formatearHoraHHMM(entrada)).toBe(esperado);
    });
});

describe('instanteBogota', () => {
    it('null si no se puede interpretar', () => {
        expect(instanteBogota('x', '14:00')).toBeNull();
        expect(instanteBogota('2026-10-05', 'x')).toBeNull();
    });
});
