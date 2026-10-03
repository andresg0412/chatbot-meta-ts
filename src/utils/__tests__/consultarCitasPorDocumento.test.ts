// Cancelar/reprogramar citas confirmadas: el listado incluye exactamente 'Pendiente' y 'Confirmado'
// (sin normalizar mayúsculas). Sin red: apiService simulado.
jest.mock('../../services/apiService', () => ({
    consultarCitasProximasPaciente: jest.fn(),
    consultarPacientePorDocumento: jest.fn(),
    crearPacienteDataBase: jest.fn(),
}));

import * as api from '../../services/apiService';
import { consultarCitasPorDocumento } from '../consultarCitasPorDocumento';
import { ESTADOS_CITA_GESTIONABLE, esEstadoCitaGestionable } from '../../constants/estadosCita';

const mockedApi = api as jest.Mocked<typeof api>;

beforeEach(() => jest.clearAllMocks());

const cita = (agenda_id_externa: number, estado_agenda: any) => ({
    agenda_id_externa,
    estado_agenda,
    fecha_cita: '2026-09-30',
    hora_cita: '10:00:00',
    especialidad: 'Psicología',
});

describe('consultarCitasPorDocumento', () => {
    it('de Pendiente/Confirmado/Cancelado/PROGRAMADA/Reprogramar quedan solo las 2 gestionables', async () => {
        mockedApi.consultarCitasProximasPaciente.mockResolvedValueOnce([
            cita(1, 'Pendiente'),
            cita(2, 'Confirmado'),
            cita(3, 'Cancelado'),
            cita(4, 'PROGRAMADA'),
            cita(5, 'Reprogramar'),
        ]);
        const r = await consultarCitasPorDocumento('CC', '123');
        expect(mockedApi.consultarCitasProximasPaciente).toHaveBeenCalledWith('123');
        expect(r.map((c: any) => c.agenda_id_externa)).toEqual([1, 2]);
    });

    it('no normaliza mayúsculas ni acepta estados cerrados o vacíos', async () => {
        mockedApi.consultarCitasProximasPaciente.mockResolvedValueOnce([
            cita(1, 'CONFIRMADO'),
            cita(2, 'pendiente'),
            cita(3, 'Anulado'),
            cita(4, 'Asistio'),
            cita(5, 'No Asistio'),
            cita(6, null),
            cita(7, undefined),
            cita(8, 'Confirmado '),
        ]);
        await expect(consultarCitasPorDocumento('CC', '123')).resolves.toEqual([]);
    });

    it('respuesta vacía o null del backend → []', async () => {
        mockedApi.consultarCitasProximasPaciente.mockResolvedValueOnce(null as any);
        await expect(consultarCitasPorDocumento('CC', '123')).resolves.toEqual([]);
        mockedApi.consultarCitasProximasPaciente.mockResolvedValueOnce([]);
        await expect(consultarCitasPorDocumento('CC', '123')).resolves.toEqual([]);
    });
});

describe('ESTADOS_CITA_GESTIONABLE', () => {
    it('contiene exactamente Pendiente y Confirmado', () => {
        expect([...ESTADOS_CITA_GESTIONABLE]).toEqual(['Pendiente', 'Confirmado']);
        expect(esEstadoCitaGestionable('Confirmado')).toBe(true);
        expect(esEstadoCitaGestionable('PROGRAMADA')).toBe(false);
    });
});
