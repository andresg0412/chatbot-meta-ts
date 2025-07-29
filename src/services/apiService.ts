import axios from 'axios';
import { metricCita } from '../utils/metrics';
import { IPaciente } from '../interfaces/IPacienteIn';
import { IReagendarCita, IAgendaResponse, ICrearCita } from '../interfaces/IReagendarCita';

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

/**export async function actualizarEstadoCitaNO(cita: any, estado: string, pacienteId: string, MotivoConsulta: string) {
    try {
        
    } catch (error) {
        console.error('Error actualizando estado cita:', error);
        return null;
    }
}

export async function actualizarEstadoCitaCancelarNO(cita: any, estado: string) {
    try {
        
    } catch (error) {
        console.error('Error cancelando cita:', error);
        return null;
    }
}

export async function crearCitaNO(cita: any) {
    try {
        
    } catch (error) {
        console.error('Error actualizando estado cita:', error);
        return null;
    }
}**/

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

/**export async function obtenerFestivosNO() {
    try {
        
    } catch (error) {
        console.error('Error obteniendo festivos:', error);
        return [];
    }
}**/

/**export async function obtenerConvenios(especialidad: string, convenio: string) {
    try {
        //mockear respuesta temporalmente
        return {
            IdConvenios: '12345',
            ValorPrimeraVez: 100000,
            ValorControl: 80000,
            ValorPaquete: 150000,
        };
    } catch (error) {
        console.error('Error obteniendo convenios:', error);
        return null;
    }
}*/

export async function consultarFechasCitasDisponibles(tipoConsulta:string, especialidad:string, profesionalId?: string): Promise<string[]> {
    try {
        const tipoConsultaparse = tipoConsulta === 'Primera vez' ? 'primera' : 'control';
        const especialidadParse = especialidad === 'Psicología' ? 'Psicologia' : especialidad === 'NeuroPsicología' ? 'Neuropsicologia' : especialidad === 'Psiquiatría' ? 'Psiquiatria' : especialidad;

        let url = `${API_BACKEND_URL}/chatbot/fechas?tipoConsulta=${tipoConsultaparse}&especialidad=${especialidadParse}`;
        console.log('URL:', url);
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
        const especialidadParse = especialidad === 'Psicología' ? 'Psicologia' : especialidad === 'NeuroPsicología' ? 'Neuropsicologia' : especialidad === 'Psiquiatría' ? 'Psiquiatria' : especialidad;
        let url = `${API_BACKEND_URL}/chatbot/horas?fecha=${formattedDate}&tipoConsulta=${tipoConsultaparse}&especialidad=${especialidadParse}`;
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

export async function reagendarCita(data: IReagendarCita): Promise<IAgendaResponse | null> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/reagendar`;
        const response = await axios.post(url, data);
        metricCita('reagendada');
        return response.data.data || null;
    } catch (error) {
        console.error('Error reprogramando cita:', error);
        return null;
    }
}

export async function crearCita(data: ICrearCita): Promise<IAgendaResponse | null> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/agendar`;
        const response = await axios.post(url, data);
        metricCita('agendada');
        return response.data.code === 201 ? response.data.data : null;
    } catch (error) {
        console.error('Error creando cita:', error);
        return null;
    }
}

export async function cancelarCita(citaId: string): Promise<string | null> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/cancelarcita`;
        const response = await axios.post(url, { cita_id: citaId });
        metricCita('cancelada');
        return response.data.code === 200 ? 'ok' : null;
    } catch (error) {
        console.error('Error cancelando cita:', error);
        return null;
    }
}