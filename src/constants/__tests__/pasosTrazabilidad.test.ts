// El catálogo de pasos debe coincidir EXACTAMENTE con la tabla 11.3 de
// proyecto-ips/docs/features/2026-09-29-trazabilidad-usuarios.md (semilla de `catalogo_pasos`).
import { CATALOGO_PASOS, esPasoValido, obtenerPaso } from '../pasosTrazabilidad';

describe('catálogo de pasos de trazabilidad', () => {
    it('no tiene ids duplicados', () => {
        const ids = CATALOGO_PASOS.map((p) => p.paso);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('tiene los 67 pasos de la tabla 11.3', () => {
        expect(CATALOGO_PASOS).toHaveLength(67);
    });

    it('cada id tiene la forma <prefijo>.<nombre> y cabe en VARCHAR(60); flujo en VARCHAR(30)', () => {
        for (const p of CATALOGO_PASOS) {
            expect(p.paso).toMatch(/^[a-z_]+\.[a-z0-9_]+$/);
            expect(p.paso.length).toBeLessThanOrEqual(60);
            expect(p.flujo.length).toBeLessThanOrEqual(30);
            expect(Number.isInteger(p.orden)).toBe(true);
        }
    });

    it('solo usa los flujos del contrato', () => {
        const flujos = new Set(CATALOGO_PASOS.map((p) => p.flujo));
        expect([...flujos].sort()).toEqual([
            'agendar', 'agente', 'campana_respuesta', 'cancelar', 'comun', 'conocer_ips', 'inicio', 'legado',
            'lista_espera', 'menu', 'politicas', 'pqrs', 'recordatorio', 'reprogramar',
        ]);
    });

    it('muestras de la tabla 11.3 (flujo, orden y es_final)', () => {
        expect(obtenerPaso('agendar.s19_crear_cita')).toEqual({ paso: 'agendar.s19_crear_cita', flujo: 'agendar', orden: 19, es_final: true });
        expect(obtenerPaso('comun.c03_documento')).toEqual({ paso: 'comun.c03_documento', flujo: 'comun', orden: 4, es_final: false });
        expect(obtenerPaso('campana.confirmar_documento')).toEqual({ paso: 'campana.confirmar_documento', flujo: 'campana_respuesta', orden: 1, es_final: false });
        expect(obtenerPaso('legado.entrada')).toEqual({ paso: 'legado.entrada', flujo: 'legado', orden: 0, es_final: false });
        expect(esPasoValido('agendar.s20_descuento')).toBe(false);
    });
});
