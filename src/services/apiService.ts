import axios from 'axios';
import { metricCita } from '../utils/metrics';
import { IPaciente } from '../interfaces/IPacienteIn';

export const URL_SHEETBEST = process.env.URL_SHEETBEST;
export const API_KEY_SHEETBEST = process.env.API_KEY_SHEETBEST;
export const API_BACKEND_URL = process.env.API_BACKEND_URL;

export async function consultarCitasPaciente(documento: string, especialidad: string): Promise<IPaciente[] | null> {
    try {
        const especialidadParse = especialidad === 'Psicologia' ? 'Psicología' : especialidad === 'NeuroPsicologia' ? 'Neuropsicología' : especialidad === 'Psiquiatria' ? 'Psiquiatría' : especialidad;
        const url = `${API_BACKEND_URL}/chatbot/citaspaciente?documento=${encodeURIComponent(documento)}&especialidad=${encodeURIComponent(especialidadParse)}`;
        const response = await axios.get(url);
        console.log('Response from consultarCitasPaciente:', response.data);
        return response.data.data || null;
    } catch (error) {
        console.error('Error consultando paciente:', error);
        return null;
    }
}

export async function consultarCitasProximasPaciente(numeroDoc: string) {

    try {
        const response = await axios.get(
            `${API_BACKEND_URL}/chatbot/citaspaciente?documento=${numeroDoc}&proximas=true`);
        return response.data.data || [];
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
        const url = `${API_BACKEND_URL}/chatbot/citas?documento_paciente=${pacienteId}&especialidad=${encodeURIComponent(especialidad)}`;
        const response = await axios.get(url);
        return response.data.data || [];
    } catch (error) {
        console.error('Error consultando citas por pacienteId y especialidad:', error);
        return null;
    }
}

export async function crearPacienteDataBase(datosPaciente: any) {
    try {
        const url = `${API_BACKEND_URL}/chatbot/crearpaciente`;
        const response = await axios.post(url, datosPaciente);
        return response.data.data || null;
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

export async function consultarFechasCitasDisponibles(tipoConsulta:string, especialidad:string, profesionalId?: string): Promise<string[]> {
    try {
        const tipoConsultaparse = tipoConsulta === 'Primera vez' ? 'primera' : 'control';

        let url = `${API_BACKEND_URL}/chatbot/fechas?tipoConsulta=${tipoConsultaparse}&especialidad=${especialidad}`;
        
        if (tipoConsulta === 'Control' && profesionalId) {
            url += `&profesionalId=${profesionalId}`;
        }
        const response = await axios.get(url);
        return response.data.data.fechasOrdenadas || [];
    } catch (error) {
        console.error('Error consultando fechas de citas disponibles:', error);
        return [];
    }
    
}

export async function consultarCitasFecha(fecha: string, tipoConsulta: string, especialidad: string, profesionalId?: string) {
    try {
        const tipoConsultaparse = tipoConsulta === 'Primera vez' ? 'primera' : 'control';
        const formattedDate = fecha.split('/').reverse().join('/');
        let url = `${API_BACKEND_URL}/chatbot/horas?fecha=${formattedDate}&tipoConsulta=${tipoConsultaparse}&especialidad=${especialidad}`;
        if (tipoConsulta === 'Control' && profesionalId) {
            url += `&profesionalId=${profesionalId}`;
        }
        const response = await axios.get(url);
        return response.data.data.citasDisponibles || [];
    } catch (error) {
        console.error('Error consultando citas por fecha:', error);
        return [];
    }
}

export async function consultarPacientePorDocumento(documento: string): Promise<IPaciente | null> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/paciente?documento=${encodeURIComponent(documento)}`;
        const response = await axios.get(url);
        return response.data.data[0] || null;
    } catch (error) {
        console.error('Error consultando paciente por documento:', error);
        return null;
    }
}