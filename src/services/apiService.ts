import axios from 'axios';
import { metricCita } from '../utils/metrics';

export const URL_SHEETBEST = process.env.URL_SHEETBEST;
export const API_KEY_SHEETBEST = process.env.API_KEY_SHEETBEST;

export async function consultarPacientePorDocumento(documento: string) {
    try {
        const response = await axios.get(
            `${URL_SHEETBEST}/tabs/Pacientes/NumeroDocumento/${documento}`,
            {
                headers: {
                    'X-Api-Key': API_KEY_SHEETBEST,
                },
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error consultando paciente:', error);
        return null;
    }
}

export async function consultarCitasPorPacienteId(pacienteId: string) {
    try {
        const response = await axios.get(
            `${URL_SHEETBEST}/tabs/Agenda/PacienteID/${pacienteId}`,
            {
                headers: {
                    'X-Api-Key': API_KEY_SHEETBEST,
                },
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error consultando citas por pacienteId:', error);
        return null;
    }
}

export async function actualizarEstadoCita(cita: any, estado: string, pacienteId: string, MotivoConsulta: string) {
    try {
        await axios.put(
            `${URL_SHEETBEST}/tabs/Agenda/AgendaId/${cita.AgendaId}`,
            { ...cita, EstadoAgenda: estado, PacienteID: pacienteId, MotivoConsulta: MotivoConsulta },
            { headers: { 'X-Api-Key': API_KEY_SHEETBEST } }
        );
        metricCita('reagendada');
        return cita;
    } catch (error) {
        console.error('Error actualizando estado cita:', error);
        return null;
    }
}

export async function actualizarEstadoCitaCancelar(cita: any, estado: string) {
    try {
        await axios.put(
            `${URL_SHEETBEST}/tabs/Agenda/AgendaId/${cita.AgendaId}`,
            { ...cita, EstadoAgenda: estado },
            { headers: { 'X-Api-Key': API_KEY_SHEETBEST } }
        );
        metricCita('cancelada');
        return cita;
    } catch (error) {
        console.error('Error cancelando cita:', error);
        return null;
    }
}

export async function crearCita(cita: any) {
    try {
        await axios.post(
            `${URL_SHEETBEST}/tabs/Agenda`,
            cita,
            { headers: { 'X-Api-Key': API_KEY_SHEETBEST } }
        );
        metricCita('reagendada');
        return cita;
    } catch (error) {
        console.error('Error actualizando estado cita:', error);
        return null;
    }
}

export async function consultarCitasPacienteEspecialidad(pacienteId: string, especialidad: string) {
    try {
        const response = await axios.get(
            `${URL_SHEETBEST}/tabs/Agenda/query?PacienteID=__eq(${pacienteId})&Especialidad=__eq(${especialidad})`,
            {
                headers: {
                    'X-Api-Key': API_KEY_SHEETBEST,
                },
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error consultando citas por pacienteId y especialidad:', error);
        return null;
    }
}

export async function crearPacienteDataBase(datosPaciente: any) {
    try {
        const response = await axios.post(
            `${URL_SHEETBEST}/tabs/Pacientes`,
            datosPaciente,
            { headers: { 'X-Api-Key': API_KEY_SHEETBEST } }
        );
        return response.data;
    } catch (error) {
        console.error('Error creando paciente:', error);
        return null;
    }
}

export async function obtenerFestivos() {
    try {
        const response = await axios.get(
            `${URL_SHEETBEST}/tabs/Festivos`,
            {
                headers:{
                    'X-Api-Key': API_KEY_SHEETBEST
                },
            }
        );
        return response.data.map(f => f.Fecha);
    } catch (error) {
        console.error('Error obteniendo festivos:', error);
        return [];
    }
}

export async function obtenerConvenios(especialidad: string, convenio: string) {
    try {
        const response = await axios.get(
            `${URL_SHEETBEST}/tabs/Convenios/query?Servicio=__eq(${especialidad})&NombreConvenio=__eq(${convenio})`,
            {
                headers:{
                    'X-Api-Key': API_KEY_SHEETBEST
                },
            }
        );
        
        if (response.data && response.data.length > 0) {
            return response.data[0];
        } else {
            console.log('No se encontraron convenios para esta especialidad y convenio');
            return null;
        }
    } catch (error) {
        console.error('Error obteniendo convenios:', error);
        return null;
    }
}