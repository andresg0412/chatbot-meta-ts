import axios from 'axios';
import { metricCita } from '../utils/metrics';
import { IPaciente } from '../interfaces/IPacienteIn';
import { IReagendarCita, IAgendaResponse, ICrearCita } from '../interfaces/IReagendarCita';
import { AgendaPendienteResponse, AgendaProgramadaResponse } from '../interfaces/IReagendarCita';
import { AccionCascada } from '../interfaces/ICascadaListaEspera';
import { isRecordatoriosBotonesEnabled as flagRecordatoriosBotones, esTelefonoPiloto } from '../utils/listaEsperaFlags';
import { formatearFechaLarga, formatearHoraHHMM } from '../utils/fechaHora';
import { enmascararTelefono } from '../utils/telefono';

export const API_BACKEND_URL = process.env.API_BACKEND_URL;

/**
 * Bandera de seguridad (default apagada, mismo patrón que `LISTA_ESPERA_CASCADA_ENABLED` de Fase 2 —
 * ver `utils/listaEsperaCascadaPoller.ts`): mientras las 4 plantillas nuevas con botones
 * (`NOMBRE_PLANTILLA_META_BOTONES`, `NOMBRE_PLANTILLA_META_CONFIRMADO_24H_BOTONES`,
 * `NOMBRE_PLANTILLA_META_DIARIA_BOTONES`, `NOMBRE_PLANTILLA_RECORDATORIO_META_BOTONES`) no estén
 * aprobadas en Meta Business Manager, los 4 recordatorios siguen enviándose exactamente igual que hoy
 * (mismos textos/plantillas actuales, sin registrar envío en el backend).
 * Ver proyecto-ips/docs/features/2026-09-07-lista-espera-inteligente.md, sección 15.6.
 */
function isRecordatoriosBotonesEnabled(): boolean {
    return flagRecordatoriosBotones();
}

/**
 * Runbook B7: con `LISTA_ESPERA_TELEFONOS_PILOTO` configurada, solo los números piloto reciben la
 * variante con botones; el resto recibe la plantilla actual sin botones (comportamiento de siempre).
 * Sin lista piloto, decide solo `RECORDATORIOS_BOTONES_ENABLED`.
 */
function usarVarianteConBotones(telefonoPaciente: unknown): boolean {
    return isRecordatoriosBotonesEnabled() && esTelefonoPiloto(telefonoPaciente);
}

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

export async function consultarFechasCitasDisponibles(tipoConsulta: string, especialidad: string, profesionalId?: string): Promise<string[]> {
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

export async function obtenerCitasProgramadas(fecha: string): Promise<AgendaProgramadaResponse[] | []> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/citasprogramadas?fecha=${encodeURIComponent(fecha)}`;
        const response = await axios.get(url);
        return response.data.data || [];
    } catch (error) {
        console.error('Error obteniendo citas programadas:', error);
        return [];
    }
}

export async function obtenerCitasConfirmadas(fecha: string): Promise<AgendaPendienteResponse[] | []> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/citasconfirmadas?fecha=${encodeURIComponent(fecha)}`;
        const response = await axios.get(url);
        return response.data.data || [];
    } catch (error) {
        console.error('Error obteniendo citas confirmadas:', error);
        return [];
    }
}

export async function enviarPlantillaConfirmacion(cita: AgendaPendienteResponse | AgendaProgramadaResponse): Promise<{ exito: boolean }> {
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
        const usarBotones = usarVarianteConBotones(cita.telefono_paciente);
        const nombrePlantilla = usarBotones ? process.env.NOMBRE_PLANTILLA_META_BOTONES : process.env.NOMBRE_PLANTILLA_META;
        console.log('Enviando plantilla URL:', url);
        console.log('Administradora:', administradora);
        const body = {
            "messaging_product": "whatsapp",
            "to": `${cita.telefono_paciente}`,
            "type": "template",
            "template": {
                "name": `${nombrePlantilla}`,
                "language": {
                    "code": "es_CO"
                },
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            { "type": "text", "text": `${cita.nombre_paciente}` },
                            { "type": "text", "text": `${cita.especialidad}` },
                            { "type": "text", "text": `${usarBotones ? formatearFechaLarga(cita.fecha_cita) : fechaFormateada}` },
                            { "type": "text", "text": `${usarBotones ? formatearHoraHHMM(cita.hora_cita) : cita.hora_cita}` },
                            { "type": "text", "text": `${cita.profesional}` },
                            { "type": "text", "text": `${cita.tipo_cita === 1 ? 'Presencial' : 'Virtual'}` },
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
            },
            timeout: 15000 // 15 segundos timeout
        });
        console.log('Respuesta de Meta:', response.data);
        if (response.data.messages && response.data.messages.length > 0) {
            console.log('Plantilla enviada correctamente:', response.data);
        } else {
            console.error('Error al enviar plantilla:', response.data);
        }
        if (response.data.messages[0].message_status === 'accepted') {
            console.log(`Plantilla enviada exitosamente a ${cita.nombre_paciente} (${cita.telefono_paciente})`);
            if (usarBotones) {
                // Fire-and-forget (15.6): un fallo de registro nunca debe afectar el envío ya exitoso.
                registrarEnvioRecordatorio(cita.cita_id, '24h').catch((error) =>
                    console.error('Error registrando envío de recordatorio (fire-and-forget):', error)
                );
            }
            return { exito: true };
        }
        return { exito: false };
    } catch (error) {
        console.error('Error enviando plantilla:', error);
        return { exito: false };
    }
}

export async function enviarPlantillaRecordatorio24h(cita: AgendaProgramadaResponse): Promise<{ exito: boolean }> {
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
        const usarBotones = usarVarianteConBotones(cita.telefono_paciente);
        const nombrePlantilla = usarBotones ? process.env.NOMBRE_PLANTILLA_META_CONFIRMADO_24H_BOTONES : process.env.NOMBRE_PLANTILLA_META_CONFIRMADO_24H;
        const body = {
            "messaging_product": "whatsapp",
            "to": `${cita.telefono_paciente}`,
            "type": "template",
            "template": {
                "name": `${nombrePlantilla}`,
                "language": {
                    "code": "es_CO"
                },
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            { "type": "text", "text": `${cita.nombre_paciente}` },
                            { "type": "text", "text": `${usarBotones ? formatearFechaLarga(cita.fecha_cita) : fechaFormateada}` },
                            { "type": "text", "text": `${usarBotones ? formatearHoraHHMM(cita.hora_cita) : cita.hora_cita}` }
                        ]
                    }
                ]
            }
        };
        const response = await axios.post(url, body, {
            headers: {
                'Authorization': `Bearer ${process.env.jwtToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000 // 15 segundos timeout
        });
        console.log('Respuesta de Meta:', response.data);
        if (response.data.messages && response.data.messages.length > 0) {
            console.log('Plantilla enviada correctamente:', response.data);
        } else {
            console.error('Error al enviar plantilla:', response.data);
        }
        if (response.data.messages[0].message_status === 'accepted') {
            console.log(`Plantilla enviada exitosamente a ${cita.nombre_paciente} (${cita.telefono_paciente})`);
            if (usarBotones) {
                // Fire-and-forget (15.6): un fallo de registro nunca debe afectar el envío ya exitoso.
                registrarEnvioRecordatorio(cita.cita_id, '24h').catch((error) =>
                    console.error('Error registrando envío de recordatorio (fire-and-forget):', error)
                );
            }
            return { exito: true };
        }
        return { exito: false };
    } catch (error) {
        console.error('Error enviando plantilla:', error);
        return { exito: false };
    }
}

export async function enviarPlantillaDiaria(cita: AgendaPendienteResponse): Promise<{ exito: boolean }> {
    try {
        // Formatear la fecha, aparece en formato YYYY-MM-ddTHH:mm:ss.SSSZ convertir en formato '31 de julio de 2025'
        const fechaCita = new Date(cita.fecha_cita);
        const fechaFormateada = fechaCita.toLocaleDateString('es-CO', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        const url = `https://graph.facebook.com/v22.0/${process.env.numberId}/messages`;
        const usarBotones = usarVarianteConBotones(cita.telefono_paciente);
        const nombrePlantilla = usarBotones ? process.env.NOMBRE_PLANTILLA_META_DIARIA_BOTONES : process.env.NOMBRE_PLANTILLA_META_DIARIA;
        console.log('Enviando plantilla URL:', url);
        const body = {
            "messaging_product": "whatsapp",
            "to": `${cita.telefono_paciente}`,
            "type": "template",
            "template": {
                "name": `${nombrePlantilla}`,
                "language": {
                    "code": "es_CO"
                },
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            { "type": "text", "text": `${cita.nombre_paciente}` },
                            { "type": "text", "text": `${cita.especialidad}` },
                            { "type": "text", "text": `${cita.tipo_cita === 1 ? 'Presencial' : 'Virtual'}` },
                            { "type": "text", "text": `${usarBotones ? formatearHoraHHMM(cita.hora_cita) : cita.hora_cita}` }
                        ]
                    }
                ]
            }
        };
        const response = await axios.post(url, body, {
            headers: {
                'Authorization': `Bearer ${process.env.jwtToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000 // 15 segundos timeout
        });
        console.log('Respuesta de Meta:', response.data);
        if (response.data.messages && response.data.messages.length > 0) {
            console.log('Plantilla enviada correctamente:', response.data);
        } else {
            console.error('Error al enviar plantilla:', response.data);
        }
        if (response.data.messages[0].message_status === 'accepted') {
            console.log(`Plantilla enviada exitosamente a ${cita.nombre_paciente} (${cita.telefono_paciente})`);
            if (usarBotones) {
                // Fire-and-forget (15.6): un fallo de registro nunca debe afectar el envío ya exitoso.
                registrarEnvioRecordatorio(cita.cita_id, '2h').catch((error) =>
                    console.error('Error registrando envío de recordatorio (fire-and-forget):', error)
                );
            }
            return { exito: true };
        }
        return { exito: false };
    } catch (error) {
        console.error('Error enviando plantilla:', error);
        return { exito: false };
    }
}

export async function enviarPlantillaRecordatorio(cita: AgendaPendienteResponse): Promise<{ exito: boolean }> {
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
        const usarBotones = usarVarianteConBotones(cita.telefono_paciente);
        const nombrePlantilla = usarBotones ? process.env.NOMBRE_PLANTILLA_RECORDATORIO_META_BOTONES : process.env.NOMBRE_PLANTILLA_RECORDATORIO_META;
        console.log('Enviando plantilla URL:', url);
        console.log('Administradora:', administradora);
        const body = {
            "messaging_product": "whatsapp",
            "to": `${cita.telefono_paciente}`,
            "type": "template",
            "template": {
                "name": `${nombrePlantilla}`,
                "language": {
                    "code": "es_CO"
                },
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            { "type": "text", "text": `${cita.nombre_paciente}` },
                            { "type": "text", "text": `${cita.especialidad}` },
                            { "type": "text", "text": `${usarBotones ? formatearFechaLarga(cita.fecha_cita) : fechaFormateada}` },
                            { "type": "text", "text": `${usarBotones ? formatearHoraHHMM(cita.hora_cita) : cita.hora_cita}` },
                            { "type": "text", "text": `${cita.profesional}` },
                            { "type": "text", "text": `${cita.tipo_cita === 1 ? 'Presencial' : 'Virtual'}` },
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
            },
            timeout: 15000 // 15 segundos timeout
        });
        console.log('Respuesta de Meta:', response.data);
        if (response.data.messages && response.data.messages.length > 0) {
            console.log('Plantilla enviada correctamente:', response.data);
        } else {
            console.error('Error al enviar plantilla:', response.data);
        }
        if (response.data.messages[0].message_status === 'accepted') {
            console.log(`Plantilla enviada exitosamente a ${cita.nombre_paciente} (${cita.telefono_paciente})`);
            if (usarBotones) {
                // Fire-and-forget (15.6): un fallo de registro nunca debe afectar el envío ya exitoso.
                registrarEnvioRecordatorio(cita.cita_id, '48h').catch((error) =>
                    console.error('Error registrando envío de recordatorio (fire-and-forget):', error)
                );
            }
            return { exito: true };
        }
        return { exito: false };
    } catch (error) {
        console.error('Error enviando plantilla:', error);
        return { exito: false };
    }
}

export async function confirmarCitaCampahna(celular: string, numeroDoc: string): Promise<boolean> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/confirmarcitameta`;
        const response = await axios.post(url, { celular: celular, documento: numeroDoc });
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

        const response = await axios.post(url, body, { timeout: 10000 });

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

export async function obtenerCitasCanceladasAbandonadas(): Promise<AgendaPendienteResponse[] | []> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/citasrecuperarpaciente`;
        const response = await axios.get(url);
        return response.data.data || [];
    } catch (error) {
        console.error('Error obteniendo citas canceladas:', error);
        return [];
    }
}

export async function enviarPlantillaRecuperar(cita: AgendaPendienteResponse): Promise<{ exito: boolean }> {
    try {
        // Formatear la fecha, aparece en formato YYYY-MM-ddTHH:mm:ss.SSSZ convertir en formato '31 de julio de 2025'

        //FALTA AJUSTAR LA PLANTILLA
        const fechaCita = new Date(cita.fecha_cita);
        const fechaFormateada = fechaCita.toLocaleDateString('es-CO', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        const url = `https://graph.facebook.com/v22.0/${process.env.numberId}/messages`;
        const body = {
            "messaging_product": "whatsapp",
            "to": `${cita.telefono_paciente}`,
            "type": "template",
            "template": {
                "name": `${process.env.NOMBRE_PLANTILLA_META_CANCELADOS}`,
                "language": {
                    "code": "es_CO"
                },
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            { "type": "text", "text": `${cita.nombre_paciente}` },
                            { "type": "text", "text": `${fechaFormateada}` },
                        ]
                    }
                ]
            }
        };
        const response = await axios.post(url, body, {
            headers: {
                'Authorization': `Bearer ${process.env.jwtToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000 // 15 segundos timeout
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

// ---------------------------------------------------------------------------
// Lista de espera inteligente (Fase 1)
// Ver proyecto-ips/docs/features/2026-09-07-lista-espera-inteligente.md, sección 4 (contrato).
// ---------------------------------------------------------------------------

export interface IInscribirListaEspera {
    paciente_id: string;
    profesional_id: string;
    fecha_cita: string; // YYYY-MM-DD de la cita ya agendada
    hora_cita: string;  // HH:MM o HH:MM:SS de esa misma cita
    especialidad?: string;
    consentimiento_texto: string;
    disponibilidad_dias?: string;
    disponibilidad_franjas?: string;
}

export interface IListaEsperaResponse {
    lista_espera_id: string;
    paciente_id: string;
    profesional_id: string;
    cita_actual_id: string | null;
    estado: string;
    [key: string]: any;
}

export async function inscribirListaEspera(data: IInscribirListaEspera): Promise<IListaEsperaResponse | null> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/listaespera/inscribir`;
        const response = await axios.post(url, data);
        return response.data?.data ?? null;
    } catch (error) {
        console.error('Error inscribiendo en lista de espera:', error);
        return null;
    }
}

export async function retirarListaEspera(params: {
    lista_espera_id?: string;
    paciente_id?: string;
    profesional_id?: string;
}): Promise<boolean> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/listaespera/retirar`;
        const response = await axios.post(url, params);
        return response.data?.code === 200;
    } catch (error) {
        console.error('Error retirando de lista de espera:', error);
        return false;
    }
}

export async function obtenerCitasUsuariosConAsistencia(): Promise<AgendaPendienteResponse[] | []> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/citasusuarioconasistencia`;
        const response = await axios.get(url);
        return response.data.data || [];
    } catch (error) {
        console.error('Error obteniendo citas de usuarios con asistencia:', error);
        return [];
    }
}

export async function enviarPlantillaUsuariosConAsistencia(cita: AgendaPendienteResponse): Promise<{ exito: boolean }> {
    try {
        // Formatear la fecha, aparece en formato YYYY-MM-ddTHH:mm:ss.SSSZ convertir en formato '31 de julio de 2025'

        //FALTA AJUSTAR LA PLANTILLA
        const fechaCita = new Date(cita.fecha_cita);
        const fechaFormateada = fechaCita.toLocaleDateString('es-CO', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        const url = `https://graph.facebook.com/v22.0/${process.env.numberId}/messages`;
        const body = {
            "messaging_product": "whatsapp",
            "to": `${cita.telefono_paciente}`,
            "type": "template",
            "template": {
                "name": `${process.env.NOMBRE_PLANTILLA_META_ASISTIDOS}`,
                "language": {
                    "code": "es_CO"
                },
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            { "type": "text", "text": `${cita.nombre_paciente}` },
                            { "type": "text", "text": `${fechaFormateada}` },
                        ]
                    }
                ]
            }
        };
        const response = await axios.post(url, body, {
            headers: {
                'Authorization': `Bearer ${process.env.jwtToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000 // 15 segundos timeout
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

// ---------------------------------------------------------------------------
// Lista de espera inteligente — Fase 2: cascada de ofertas de cupo liberado.
// Ver proyecto-ips/docs/features/2026-09-07-lista-espera-inteligente.md, sección 13.6 (contrato
// definitivo, ya implementado y probado en el backend).
// ---------------------------------------------------------------------------

/**
 * Sondea el motor de cascada del backend (idempotente, sin más efectos secundarios que los que el
 * propio backend decide aplicar internamente: expirar ofertas, avanzar la fila, escalar, etc.).
 * Se llama cada `LISTA_ESPERA_CASCADA_POLL_INTERVAL_MS` desde `listaEsperaCascadaPoller.ts` y también
 * de forma inmediata (path rápido) tras cancelar/reagendar una cita desde el propio bot.
 */
export async function tickCascadaListaEspera(limite?: number): Promise<AccionCascada[]> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/listaespera/cascada/tick`;
        const body = typeof limite === 'number' ? { limite } : {};
        const response = await axios.post(url, body);
        return response.data?.data?.acciones ?? [];
    } catch (error) {
        console.error('Error consultando tick de cascada de lista de espera:', error);
        return [];
    }
}

/**
 * Envía la plantilla de oferta de cupo liberado (`NOMBRE_PLANTILLA_OFERTA_CUPO`, pendiente de
 * aprobación en Meta Business — ver docs/features/2026-09-07-lista-espera-inteligente.md, 13.8).
 *
 * Regla de privacidad transversal (9.1, no negociable): ningún mensaje puede mencionar la
 * especialidad ni palabras como "psicología"/"terapia"/"sesión". Por eso esta función deliberadamente
 * NO recibe ni envía `especialidad` como variable de la plantilla, aunque el `AccionCascada` de
 * origen sí la traiga disponible — solo se usan nombre, profesional, fecha y hora.
 */
export async function enviarPlantillaOfertaCupo(
    nombrePaciente: string,
    telefonoPaciente: string,
    profesional: string,
    fechaCita: string,
    horaCita: string
): Promise<{ exito: boolean; mensajeWaId?: string }> {
    try {
        // Runbook B2/B9: fecha 'YYYY-MM-DD' formateada sin depender de la zona horaria del proceso
        // (antes `new Date('YYYY-MM-DD')` + formato local mostraba el día anterior en America/Bogota),
        // y hora como HH:MM (antes salía HH:MM:SS). Solo cambia el contenido de las variables, no su
        // cantidad ni su orden.
        const fechaFormateada = formatearFechaLarga(fechaCita);
        const horaFormateada = formatearHoraHHMM(horaCita);

        const url = `https://graph.facebook.com/v22.0/${process.env.numberId}/messages`;
        const body = {
            "messaging_product": "whatsapp",
            "to": `${telefonoPaciente}`,
            "type": "template",
            "template": {
                "name": `${process.env.NOMBRE_PLANTILLA_OFERTA_CUPO}`,
                "language": {
                    "code": "es_CO"
                },
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            { "type": "text", "text": `${nombrePaciente}` },
                            { "type": "text", "text": `${profesional}` },
                            { "type": "text", "text": `${fechaFormateada}` },
                            { "type": "text", "text": `${horaFormateada}` }
                        ]
                    }
                ]
            }
        };
        const response = await axios.post(url, body, {
            headers: {
                'Authorization': `Bearer ${process.env.jwtToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000 // 15 segundos timeout
        });
        // Runbook B9: la respuesta de Meta incluye `contacts[].input/wa_id` (el teléfono completo) —
        // solo se loguea el estado y el id del mensaje.
        if (response.data.messages && response.data.messages.length > 0) {
            console.log('Plantilla de oferta de cupo enviada correctamente:', {
                message_status: response.data.messages[0]?.message_status,
                id: response.data.messages[0]?.id
            });
        } else {
            console.error('Error al enviar plantilla de oferta de cupo (sin messages en la respuesta de Meta).');
        }
        if (response.data.messages?.[0]?.message_status === 'accepted') {
            // Runbook B9: sin nombre ni teléfono completo en logs.
            console.log(`Plantilla de oferta de cupo enviada exitosamente a ${enmascararTelefono(telefonoPaciente)}`);
            return { exito: true, mensajeWaId: response.data.messages[0]?.id };
        }
        return { exito: false };
    } catch (error: any) {
        // Runbook B9: no se imprime el objeto de error completo (su config.data lleva el cuerpo del
        // mensaje con nombre y teléfono del paciente); solo estado HTTP y error de Meta.
        console.error('Error enviando plantilla de oferta de cupo:', resumirErrorMeta(error));
        return { exito: false };
    }
}

export async function confirmarEnvioOfertaCupo(
    cupoLiberadoId: string,
    listaEsperaId: string,
    mensajeWaId?: string
): Promise<boolean> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/listaespera/cascada/oferta/confirmar-envio`;
        const response = await axios.post(url, {
            cupo_liberado_id: cupoLiberadoId,
            lista_espera_id: listaEsperaId,
            ...(mensajeWaId ? { mensaje_wa_id: mensajeWaId } : {})
        });
        return response.data?.code === 200;
    } catch (error: any) {
        if (error?.response?.status === 409) {
            // OFERTA_NO_DISPONIBLE: la fila ya no estaba en 'en_cola' (llamada duplicada / carrera
            // entre dos ticks) — no es un error grave, solo se ignora (ver contrato 13.6).
            console.warn('Oferta ya no disponible al confirmar envío (llamada duplicada o carrera de ticks):', cupoLiberadoId, listaEsperaId);
            return false;
        }
        console.error('Error confirmando envío de oferta de cupo:', error);
        return false;
    }
}

export async function marcarFalloOfertaCupo(
    cupoLiberadoId: string,
    listaEsperaId: string,
    motivo?: string
): Promise<boolean> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/listaespera/cascada/oferta/marcar-fallo`;
        const response = await axios.post(url, {
            cupo_liberado_id: cupoLiberadoId,
            lista_espera_id: listaEsperaId,
            ...(motivo ? { motivo } : {})
        });
        return response.data?.code === 200;
    } catch (error) {
        console.error('Error marcando fallo de oferta de cupo:', error);
        return false;
    }
}

/**
 * Registra la respuesta del paciente ('acepta'/'rechaza') a una oferta de cupo. Se distingue el
 * código de estado (no solo boolean) porque 404/409 requieren mensajes distintos al paciente:
 * - 404 SIN_OFERTA_ACTIVA: ya no tiene ninguna oferta pendiente.
 * - 409 CUPO_YA_ASIGNADO: alguien más aceptó primero.
 * - 200: `data.registrado` (rechaza) o `data.movimiento/nueva_fecha_cita/...` (acepta).
 */
export async function responderOfertaCupo(
    documento: string,
    celular: string,
    respuesta: 'acepta' | 'rechaza'
): Promise<{ ok: boolean; code?: number; data?: any }> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/listaespera/cascada/respuesta`;
        const response = await axios.post(url, { documento, celular, respuesta });
        return { ok: true, code: response.data?.code ?? response.status, data: response.data?.data };
    } catch (error: any) {
        if (error?.response) {
            return { ok: false, code: error.response.status, data: error.response.data };
        }
        console.error('Error respondiendo oferta de cupo:', error);
        return { ok: false };
    }
}

export async function confirmarEscalamientoListaEspera(cupoLiberadoId: string): Promise<boolean> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/listaespera/cascada/escalar/confirmar`;
        const response = await axios.post(url, { cupo_liberado_id: cupoLiberadoId });
        return response.data?.code === 200;
    } catch (error) {
        console.error('Error confirmando escalamiento de lista de espera:', error);
        return false;
    }
}

// ---------------------------------------------------------------------------
// Lista de espera inteligente — Fase 3: captura de respuesta en recordatorios (Funcionalidad 1).
// Ver proyecto-ips/docs/features/2026-09-07-lista-espera-inteligente.md, sección 15.5 (contrato
// definitivo, ya implementado y probado en el backend).
// ---------------------------------------------------------------------------

export type TipoRecordatorio = '48h' | '24h' | '2h';

/**
 * Registra que un recordatorio (con botones) fue enviado para una cita, para poder correlacionar
 * después la respuesta del paciente. `citaId` es `agenda_id_externa` (el mismo `cita_id` que ya trae
 * `AgendaPendienteResponse`/`AgendaProgramadaResponse`), no el `agenda_id` interno (bug 6.8, sigue sin
 * corregirse — el endpoint lo resuelve server-side). Se llama en modo fire-and-forget desde las 4
 * funciones de envío de plantillas cuando `RECORDATORIOS_BOTONES_ENABLED === 'true'` — nunca debe
 * hacer fallar el envío del recordatorio en sí.
 */
export async function registrarEnvioRecordatorio(citaId: string, tipoRecordatorio: TipoRecordatorio): Promise<boolean> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/recordatorios/registrar-envio`;
        const response = await axios.post(url, { cita_id: citaId, tipo_recordatorio: tipoRecordatorio });
        return response.data?.isError === false;
    } catch (error) {
        console.error('Error registrando envío de recordatorio:', error);
        return false;
    }
}

/**
 * Registra la respuesta del paciente ('confirma'/'no_asistira') a un botón de recordatorio. Importante
 * (15.8): si `respuesta === 'no_asistira'`, el backend cancela la cita de verdad (Globho + BD) y
 * dispara la detección de cupo liberado de Fase 2 — no es una operación de solo lectura.
 */
export async function responderRecordatorio(
    celular: string,
    documento: string,
    respuesta: 'confirma' | 'no_asistira'
): Promise<{ accion: string; persistido: boolean } | null> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/recordatorios/responder`;
        const response = await axios.post(url, { celular, documento, respuesta });
        return response.data?.data ?? null;
    } catch (error) {
        console.error('Error respondiendo recordatorio:', error);
        return null;
    }
}
// ---------------------------------------------------------------------------
// Runbook 2026-09-26 (B5/B6): utilidades nuevas.
// ---------------------------------------------------------------------------

/**
 * Resumen corto y sin datos personales de un error de axios contra Graph API: estado HTTP, código y
 * mensaje de Meta (p. ej. 131047 "Re-engagement message" / 131026 "Message undeliverable").
 * Nunca incluye `config.data` (lleva el cuerpo del mensaje y el teléfono de destino).
 */
export function resumirErrorMeta(error: any): { http_status: number | null; code: number | string | null; mensaje: string } {
    const metaError = error?.response?.data?.error;
    const mensajeBase = metaError?.error_data?.details || metaError?.message || error?.message || 'error_desconocido';
    return {
        http_status: error?.response?.status ?? null,
        code: metaError?.code ?? error?.code ?? null,
        mensaje: String(mensajeBase).slice(0, 200)
    };
}

/**
 * Envía un mensaje de texto libre directo a Graph API (mismo endpoint que ya usan las plantillas de
 * este archivo). Se usa para los avisos al asesor humano (runbook B6) en vez de
 * `adapterProvider.sendMessage`, porque el provider de Meta encola el envío y NO propaga el error al
 * llamador (`sendMessage` no retorna la promesa de `sendText` y `queue.add` descarta el resultado —
 * ver node_modules/@builderbot/provider-meta/dist/index.cjs): con el provider, un fallo nunca llega al
 * `catch` del llamador.
 *
 * Nota: un texto libre fuera de la ventana de 24h suele ser ACEPTADO por la API (HTTP 200) y fallar
 * después de forma asíncrona (webhook de estado `failed`, código 131047). Ese caso se captura aparte
 * (ver src/utils/avisoAsesor.ts, listener de 'notice').
 */
export async function enviarMensajeTextoMeta(
    to: string,
    texto: string
): Promise<{ exito: boolean; mensajeWaId?: string; error?: ReturnType<typeof resumirErrorMeta> }> {
    try {
        const url = `https://graph.facebook.com/v22.0/${process.env.numberId}/messages`;
        const body = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'text',
            text: { preview_url: false, body: texto }
        };
        const response = await axios.post(url, body, {
            headers: {
                'Authorization': `Bearer ${process.env.jwtToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });
        const mensajeWaId = response.data?.messages?.[0]?.id;
        if (mensajeWaId) {
            return { exito: true, mensajeWaId };
        }
        return { exito: false, error: { http_status: response.status ?? null, code: null, mensaje: 'respuesta_sin_messages' } };
    } catch (error) {
        return { exito: false, error: resumirErrorMeta(error) };
    }
}

/**
 * Consulta las inscripciones de lista de espera de un paciente por documento
 * (`GET /chatbot/listaespera?documento=`, contrato de Fase 1). El backend responde 400
 * (INVALID_QUERY) cuando el documento no corresponde a ningún paciente: se reporta como
 * `encontrado: false`, no como error.
 */
export async function consultarListaEsperaPorDocumento(
    documento: string
): Promise<{ ok: boolean; encontrado: boolean; inscripciones: IListaEsperaResponse[] }> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/listaespera`;
        const response = await axios.get(url, { params: { documento } });
        const inscripciones = Array.isArray(response.data?.data) ? response.data.data : [];
        return { ok: true, encontrado: true, inscripciones };
    } catch (error: any) {
        const status = error?.response?.status;
        if (status === 400 || status === 404) {
            return { ok: true, encontrado: false, inscripciones: [] };
        }
        console.error('Error consultando lista de espera por documento:', error?.message ?? error);
        return { ok: false, encontrado: false, inscripciones: [] };
    }
}
