// Cancelar/reprogramar citas confirmadas (proyecto-ips/docs/features/2026-09-27-cancelar-reprogramar-confirmadas.md):
// el filtro de citas vigentes interpreta fecha/hora en hora de Colombia, sin depender de la TZ del proceso.
import { obtenerCitasValidas } from '../obtenerCitasValidas';

import { spawnSync } from 'child_process';
import path from 'path';

// "Ahora" fijo: 28/09/2026 10:00 en Bogotá (UTC-5) = 15:00 UTC. Se construye en UTC, no con new Date() local.
const AHORA_MS = Date.UTC(2026, 8, 28, 15, 0, 0);
const ahora = () => new Date(AHORA_MS);

const cita = (fecha_cita: any, hora_cita: any, extra: Record<string, any> = {}) => ({
    agenda_id_externa: 1,
    estado_agenda: 'Confirmado',
    fecha_cita,
    hora_cita,
    ...extra,
});

describe('obtenerCitasValidas', () => {
    it('cita de hoy dentro de 1 hora → incluida', async () => {
        const r = await obtenerCitasValidas([cita('2026-09-28', '11:00:00')], ahora());
        expect(r).toHaveLength(1);
    });

    it('cita de hoy hace 1 hora → excluida', async () => {
        const r = await obtenerCitasValidas([cita('2026-09-28', '09:00:00')], ahora());
        expect(r).toHaveLength(0);
    });

    it('cita exactamente en el instante actual → excluida', async () => {
        const r = await obtenerCitasValidas([cita('2026-09-28', '10:00:00')], ahora());
        expect(r).toHaveLength(0);
    });

    it('hora sin segundos (HH:MM) → no lanza y se evalúa', async () => {
        await expect(obtenerCitasValidas([cita('2026-09-28', '10:30')], ahora())).resolves.toHaveLength(1);
        await expect(obtenerCitasValidas([cita('2026-09-28', '09:30')], ahora())).resolves.toHaveLength(0);
    });

    it('hora o fecha null / vacía / malformada → excluida, nunca lanza', async () => {
        const entradas = [
            cita('2026-09-29', null),
            cita(null, '11:00:00'),
            cita('2026-09-29', ''),
            cita('2026-09-29', 'abc'),
            cita('no-es-fecha', '11:00:00'),
            cita(undefined, undefined),
            null,
        ];
        await expect(obtenerCitasValidas(entradas, ahora())).resolves.toEqual([]);
    });

    it('citas null/undefined → []', async () => {
        await expect(obtenerCitasValidas(null, ahora())).resolves.toEqual([]);
        await expect(obtenerCitasValidas(undefined, ahora())).resolves.toEqual([]);
    });

    it('conserva el orden y los objetos originales', async () => {
        const a = cita('2026-09-28', '11:00:00', { agenda_id_externa: 1 });
        const b = cita('2026-09-27', '11:00:00', { agenda_id_externa: 2 });
        const c = cita('2026-10-01', '08:00:00', { agenda_id_externa: 3 });
        const r = await obtenerCitasValidas([a, b, c], ahora());
        expect(r).toEqual([a, c]);
        expect(r[0]).toBe(a);
    });

    it('acepta fecha serializada como ISO con hora (columna DATE vía JSON)', async () => {
        const r = await obtenerCitasValidas([cita('2026-09-28T05:00:00.000Z', '11:00:00')], ahora());
        expect(r).toHaveLength(1);
    });
});

// Cambiar process.env.TZ dentro de jest no es confiable (en Windows no surte efecto): igual que en
// fechaHora.test.ts, se ejecuta el módulo real en un proceso hijo de Node con TZ fijada (tsx).
const RAIZ = path.resolve(__dirname, '../../..');

function ejecutarEnTZ(tz: string): any {
    const script = `
        const { obtenerCitasValidas } = require('./src/utils/obtenerCitasValidas.ts');
        const ahora = new Date(${AHORA_MS});
        const citas = [
            { id: 'hoy_0930', fecha_cita: '2026-09-28', hora_cita: '09:30:00' },
            { id: 'hoy_1030', fecha_cita: '2026-09-28', hora_cita: '10:30:00' },
            { id: 'hoy_1200', fecha_cita: '2026-09-28', hora_cita: '12:00' },
            { id: 'hoy_1900', fecha_cita: '2026-09-28', hora_cita: '19:00:00' },
            { id: 'ayer_2300', fecha_cita: '2026-09-27', hora_cita: '23:00:00' },
            { id: 'manana_0700', fecha_cita: '2026-09-29', hora_cita: '07:00:00' },
        ];
        obtenerCitasValidas(citas, ahora).then((r) => {
            console.log(JSON.stringify({
                tzResuelta: Intl.DateTimeFormat().resolvedOptions().timeZone,
                ids: r.map((c) => c.id),
            }));
        });`;
    const r = spawnSync(process.execPath, ['-r', 'tsx/cjs', '-e', script], {
        cwd: RAIZ,
        env: { ...process.env, TZ: tz },
        encoding: 'utf-8',
    });
    if (r.status !== 0) throw new Error(`Proceso hijo falló (TZ=${tz}): ${r.stderr}`);
    const lineas = r.stdout.trim().split(/\r?\n/);
    return JSON.parse(lineas[lineas.length - 1]);
}

describe('obtenerCitasValidas es independiente de la zona horaria del proceso', () => {
    // Con el código anterior (new Date sin offset), en TZ=UTC 'hoy_1030' y 'hoy_1200' quedaban fuera.
    const esperado = ['hoy_1030', 'hoy_1200', 'hoy_1900', 'manana_0700'];

    it.each(['UTC', 'America/Bogota', 'Asia/Tokyo'])('TZ=%s', (tz) => {
        const r = ejecutarEnTZ(tz);
        expect(r.tzResuelta).toBe(tz);
        expect(r.ids).toEqual(esperado);
    }, 30000);
});
