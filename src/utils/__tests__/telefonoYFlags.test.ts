// Runbook B4/B7/B9: normalización de teléfono, lista piloto e interruptores.
import { normalizarTelefonoWhatsApp, destinoPlantillaWhatsApp, claveComparacionTelefono, enmascararTelefono } from '../telefono';
import {
    esTelefonoPiloto,
    hayListaPiloto,
    obtenerTelefonosPiloto,
    isListaEsperaOptinEnabled,
    isCrisisProtocolEnabled,
    isCascadaEnabled,
    isRecordatoriosBotonesEnabled,
    isRecordatoriosPayloadEnabled,
} from '../listaEsperaFlags';

const ENV_ORIGINAL = { ...process.env };
afterEach(() => {
    process.env = { ...ENV_ORIGINAL };
});

describe('normalizarTelefonoWhatsApp', () => {
    it.each([
        ['3001234567', '573001234567'],
        ['573001234567', '573001234567'],
        ['+57 300 123 4567', '573001234567'],
        ['300-123-4567', '573001234567'],
        [' 57 3001234567 ', '573001234567'],
        ['12025550123', '12025550123'], // número extranjero con indicativo: se respeta
    ])('%s → %s', (entrada, esperado) => {
        expect(normalizarTelefonoWhatsApp(entrada)).toBe(esperado);
    });

    it.each([[null], [undefined], [''], ['   '], ['12345'], ['6071234']])('%p → null (no contactable)', (entrada) => {
        expect(normalizarTelefonoWhatsApp(entrada)).toBeNull();
    });
});

describe('destinoPlantillaWhatsApp', () => {
    it.each([
        ['3214593929', '573214593929'],
        ['573214593929', '573214593929'],
        ['6764341329', null],
        ['123405923', null],
        ['5712345678901', null],
        ['14155550123', '14155550123'],
    ])('%s → %p', (entrada, esperado) => {
        expect(destinoPlantillaWhatsApp(entrada)).toBe(esperado);
    });
});

it('claveComparacionTelefono iguala 10 dígitos y 57...', () => {
    expect(claveComparacionTelefono('3001234567')).toBe(claveComparacionTelefono('573001234567'));
    expect(claveComparacionTelefono('+57 300 123 4567')).toBe('3001234567');
    expect(claveComparacionTelefono(null)).toBeNull();
});

it('enmascararTelefono deja solo los últimos 4 dígitos', () => {
    expect(enmascararTelefono('573001234567')).toBe('********4567');
    expect(enmascararTelefono(null)).toBe('(sin teléfono)');
    expect(enmascararTelefono('123')).toBe('****');
});

describe('LISTA_ESPERA_TELEFONOS_PILOTO', () => {
    it('vacía o ausente = sin restricción', () => {
        delete process.env.LISTA_ESPERA_TELEFONOS_PILOTO;
        expect(hayListaPiloto()).toBe(false);
        expect(esTelefonoPiloto('573009999999')).toBe(true);
        process.env.LISTA_ESPERA_TELEFONOS_PILOTO = ' , ';
        expect(hayListaPiloto()).toBe(false);
        expect(esTelefonoPiloto(null)).toBe(true);
    });

    it('con valores: solo esos números, comparando 10 dígitos vs 57...', () => {
        process.env.LISTA_ESPERA_TELEFONOS_PILOTO = '573001234567, 3107654321';
        expect(hayListaPiloto()).toBe(true);
        expect(obtenerTelefonosPiloto()).toEqual(['3001234567', '3107654321']);
        expect(esTelefonoPiloto('3001234567')).toBe(true);
        expect(esTelefonoPiloto('573107654321')).toBe(true);
        expect(esTelefonoPiloto('+57 310 765 4321')).toBe(true);
        expect(esTelefonoPiloto('573009999999')).toBe(false);
        expect(esTelefonoPiloto(null)).toBe(false);
        expect(esTelefonoPiloto('')).toBe(false);
    });
});

describe('interruptores: default apagado, solo "true" enciende', () => {
    const casos: Array<[string, () => boolean]> = [
        ['LISTA_ESPERA_OPTIN_ENABLED', isListaEsperaOptinEnabled],
        ['CRISIS_PROTOCOL_ENABLED', isCrisisProtocolEnabled],
        ['LISTA_ESPERA_CASCADA_ENABLED', isCascadaEnabled],
        ['RECORDATORIOS_BOTONES_ENABLED', isRecordatoriosBotonesEnabled],
        ['RECORDATORIOS_PAYLOAD_ENABLED', isRecordatoriosPayloadEnabled],
    ];
    it.each(casos)('%s', (variable, fn) => {
        delete process.env[variable];
        expect(fn()).toBe(false);
        process.env[variable] = 'false';
        expect(fn()).toBe(false);
        process.env[variable] = 'TRUE';
        expect(fn()).toBe(false);
        process.env[variable] = 'true';
        expect(fn()).toBe(true);
    });
});
