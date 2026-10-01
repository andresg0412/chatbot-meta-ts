// Persistencia de los números bloqueados por el protocolo de crisis — runbook B8,
// proyecto-ips/docs/features/2026-09-26-lista-espera-runbook-produccion.md.
//
// `bot.dynamicBlacklist` de @builderbot vive solo en memoria: un `pm2 restart` desbloqueaba a un
// paciente en crisis sin intervención humana. Aquí se guardan en un JSON de runtime (mismo estilo que
// userSessionsDB.json de proactiveSessionManager.ts; está en .gitignore para no bloquear `git pull`)
// y se restauran al arrancar.
//
// Decisión: SOLO se persisten los números bloqueados por crisis. Los agregados a mano con
// POST /v1/blacklist {intent:'add'} siguen como antes (solo memoria), para no cambiar el
// comportamiento existente de ese endpoint. Al reactivar con POST /v1/blacklist {intent:'remove'}
// se quita el número de este JSON también.

import fs from 'fs';
import path from 'path';

const DEFAULT_DB_PATH = path.join(__dirname, 'crisisBlacklistDB.json');

let dbPath = DEFAULT_DB_PATH;

type Registro = { bloqueado_at: string };

function normalizarNumero(numero: unknown): string {
    return String(numero ?? '').replace(/\+/g, '').replace(/\s/g, '');
}

function leer(): Record<string, Registro> {
    try {
        if (!fs.existsSync(dbPath)) return {};
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (error) {
        console.error('[crisisBlacklistStore] No se pudo leer el archivo de bloqueos por crisis; se asume vacío:', error);
        return {};
    }
}

function escribir(data: Record<string, Registro>): void {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
        console.error('[crisisBlacklistStore] No se pudo guardar el archivo de bloqueos por crisis:', error);
    }
}

/** Números bloqueados por crisis que deben restaurarse en `bot.dynamicBlacklist` al arrancar. */
export function obtenerBloqueadosPorCrisis(): string[] {
    return Object.keys(leer());
}

export function registrarBloqueoPorCrisis(numero: string): void {
    const clave = normalizarNumero(numero);
    if (!clave) return;
    const data = leer();
    if (!data[clave]) {
        data[clave] = { bloqueado_at: new Date().toISOString() };
        escribir(data);
    }
}

/** Devuelve true si el número estaba registrado como bloqueado por crisis. */
export function quitarBloqueoPorCrisis(numero: unknown): boolean {
    const clave = normalizarNumero(numero);
    if (!clave) return false;
    const data = leer();
    if (!data[clave]) return false;
    delete data[clave];
    escribir(data);
    return true;
}

/** Solo para pruebas: redirige el archivo a otra ruta. */
export function _setCrisisBlacklistPathParaPruebas(nuevaRuta: string | null): void {
    dbPath = nuevaRuta ?? DEFAULT_DB_PATH;
}
