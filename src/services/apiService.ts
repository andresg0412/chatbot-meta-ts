import axios from 'axios';
import { metricCita } from '../utils/metrics';
import { IPaciente } from '../interfaces/IPacienteIn';
import { IReagendarCita, IAgendaResponse, ICrearCita } from '../interfaces/IReagendarCita';
import { AgendaPendienteResponse } from '../interfaces/IReagendarCita';

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

export async function obtenerCitasPendientesPorFecha(fecha: string): Promise<AgendaPendienteResponse[] | []> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/citaspendientes?fecha=${encodeURIComponent(fecha)}`;
        const response = await axios.get(url);
        return response.data.data || [];
    } catch (error) {
        console.error('Error obteniendo citas pendientes:', error);
        return [];
    }
}

export async function enviarPlantillaConfirmacion(cita: AgendaPendienteResponse): Promise<{ exito: boolean }> {
    try {
        // Formatear la fecha, aparece en formato YYYY-MM-ddTHH:mm:ss.SSSZ convertir en formato '31 de julio de 2025'
        const fechaCita = new Date(cita.fecha_cita);
        const fechaFormateada = fechaCita.toLocaleDateString('es-CO', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        const url = `https://graph.facebook.com/v22.0/${process.env.numberId}/messages`;
        const administradora = cita.administradora ? cita.administradora : 'PARTICULAR';
        console.log('Enviando plantilla URL:', url);
        console.log('Administradora:', administradora);
        const body = {
            "messaging_product": "whatsapp",
            "to": `${cita.telefono_paciente}`,
            "type": "template",
            "template": {
                "name": `${process.env.NOMBRE_PLANTILLA_META}`,
                "language": {
                "code": "es_CO"
                },
                "components": [
                {
                    "type": "body",
                    "parameters": [
                    { "type": "text", "text": `${cita.nombre_paciente}` },
                    { "type": "text", "text": "Dianita" },
                    { "type": "text", "text": `${cita.especialidad}` },
                    { "type": "text", "text": `${fechaFormateada}` },
                    { "type": "text", "text": `${cita.profesional}` },
                    { "type": "text", "text": `${cita.hora_cita}` },
                    { "type": "text", "text": `${administradora}` }
                    ]
                }
                ]
            }
        };
        const response = await axios.post(url, body, {
            headers: {
                'Authorization': `Bearer ${process.env.jwtToken}`,
                'Content-Type': 'application/json'
            }
        });
        console.log('Respuesta de Meta:', response.data);
        if (response.data.messages && response.data.messages.length > 0) {
            console.log('Plantilla enviada correctamente:', response.data);
        } else {
            console.error('Error al enviar plantilla:', response.data);
        }
        if (response.data.messages[0].message_status === 'accepted') {
            console.log(`Plantilla enviada exitosamente a ${cita.nombre_paciente} (${cita.telefono_paciente})`);
            return { exito: true };
        }
        return { exito: false };
    } catch (error) {
        console.error('Error enviando plantilla:', error);
        return { exito: false };
    }
}

export async function confirmarCitaCampahna(celular: string): Promise<boolean> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/confirmarcitameta`;
        const response = await axios.post(url, { celular });
        return response.data.code === 200;
    } catch (error) {
        console.error('Error confirmando cita:', error);
        return false;
    }
}

/**
 * Registra un evento de actividad en el backend para generar estadísticas
 * @param tipoEvento - Tipo de evento que se está registrando (ej: 'chat_inicio', 'cita_agendada', etc.)
 * @param idUsuario - Número de teléfono o identificador del usuario
 * @param metadata - Objeto con información adicional del evento (fecha, campaña, etc.)
 * @returns Promise<boolean> - true si se registró exitosamente, false en caso contrario
 */
export async function registrarActividadBot(
    tipoEvento: string, 
    idUsuario: string, 
    metadata: Record<string, any> = {}
): Promise<boolean> {
    try {
        const url = `${API_BACKEND_URL}/stats`;
        
        const body = {
            tipo_evento: tipoEvento,
            id_usuario: idUsuario,
            metadata: {
                date: new Date().toISOString().split('T')[0],
                ...metadata
            }
        };

        const response = await axios.post(url, body);
        
        if (response.status >= 200 && response.status < 300) {
            return true;
        }
        
        console.warn(`Respuesta inesperada al registrar actividad: ${response.status}`);
        return false;
        
    } catch (error) {
        console.error('Error registrando actividad del bot:', error);
        return false;
    }
}