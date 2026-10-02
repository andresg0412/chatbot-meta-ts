import axios from 'axios';
import { metricCita } from '../utils/metrics';
import { IPaciente } from '../interfaces/IPacienteIn';
import { IReagendarCita, IAgendaResponse, ICrearCita } from '../interfaces/IReagendarCita';
import { AgendaPendienteResponse, AgendaProgramadaResponse } from '../interfaces/IReagendarCita';
import { AccionCascada } from '../interfaces/ICascadaListaEspera';
import { isRecordatoriosBotonesEnabled as flagRecordatoriosBotones, esTelefonoPiloto } from '../utils/listaEsperaFlags';
import { formatearFechaLarga, formatearHoraHHMM } from '../utils/fechaHora';
import { enmascararTelefono } from '../utils/telefono';
import { limpiarParametroPlantilla } from '../utils/parametroPlantilla';
import { fechaBogotaHoy } from '../utils/fechaHora';
import {
    isTrazabilidadV2Enabled,
    trackEventoLegado,
    trackEnvioWhatsApp,
    registrarFalloBackend,
    CampanaTraza,
    EventoEntrada,
    ResultadoEnvioMeta,
} from '../utils/trazabilidad';

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

// ---------------------------------------------------------------------------
// Trazabilidad de envíos salientes (proyecto-ips/docs/features/2026-09-29-trazabilidad-usuarios.md,
// 4.3.4 y 11.2): las funciones de envío devuelven `{ exito, mensajeWaId?, errorCode?, errorTitulo? }`
// y emiten `wa_envio` (solo con TRAZABILIDAD_V2_ENABLED=true).
// ---------------------------------------------------------------------------

/** Resultado de envío a partir de la respuesta 200 de Graph API (exito solo si message_status='accepted'). */
export function resultadoEnvioDesdeRespuesta(data: any): ResultadoEnvioMeta {
    const mensaje = Array.isArray(data?.messages) ? data.messages[0] : undefined;
    const mensajeWaId = typeof mensaje?.id === 'string' ? mensaje.id : undefined;
    if (mensaje?.message_status === 'accepted') {
        return { exito: true, ...(mensajeWaId ? { mensajeWaId } : {}) };
    }
    const estado = typeof mensaje?.message_status === 'string' ? mensaje.message_status : null;
    return {
        exito: false,
        ...(mensajeWaId ? { mensajeWaId } : {}),
        errorCode: estado ? `status_${estado}`.slice(0, 20) : 'sin_messages',
        errorTitulo: estado ? `message_status=${estado}` : 'respuesta de Meta sin messages',
    };
}

/** Resultado de envío a partir de un error de axios contra Graph API (sin datos personales). */
export function resultadoEnvioDesdeError(error: any): ResultadoEnvioMeta {
    const resumen = resumirErrorMeta(error);
    const code = resumen.code !== null && resumen.code !== undefined
        ? String(resumen.code)
        : resumen.http_status !== null ? `http_${resumen.http_status}` : undefined;
    return {
        exito: false,
        ...(code ? { errorCode: code.slice(0, 20) } : {}),
        errorTitulo: resumen.mensaje.slice(0, 100),
    };
}

/** Emite `wa_envio` para una plantilla de campaña y devuelve el mismo resultado. */
function trazarEnvioPlantilla(
    cita: { telefono_paciente?: string; cita_id?: string } | null | undefined,
    campana: CampanaTraza,
    plantilla: string | undefined,
    campanaEjecucionId: string | undefined,
    resultado: ResultadoEnvioMeta
): ResultadoEnvioMeta {
    trackEnvioWhatsApp({
        telefono: cita?.telefono_paciente ?? null,
        campana,
        campanaEjecucionId,
        plantilla: plantilla ?? null,
        tipoEnvio: 'plantilla',
        resultado,
        // `cita_id` de las campañas es agenda.agenda_id (id interno), no el id de Globho: va en el
        // campo `agenda_id` del evento y no en cita_id_externa (ver trackEnvioWhatsApp).
        agendaId: cita?.cita_id ?? null,
    });
    return resultado;
}

export async function consultarCitasPaciente(documento: string, especialidad: string): Promise<IPaciente[] | null> {
    try {
        const especialidadParse = especialidad === 'Psicologia' ? 'Psicología' : especialidad === 'NeuroPsicologia' ? 'Neuropsicología' : especialidad === 'Psiquiatria' ? 'Psiquiatría' : especialidad;
        const url = `${API_BACKEND_URL}/chatbot/citaspaciente?documento=${encodeURIComponent(documento)}&especialidad=${encodeURIComponent(especialidadParse)}`;
        const response = await axios.get(url);
        console.log('Response from consultarCitasPaciente:', response.data);
        return response.data.data || null;
    } catch (error) {
        registrarFalloBackend('/chatbot/citaspaciente', error);
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
        registrarFalloBackend('/chatbot/citaspaciente', error);
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

/** Causa de un alta de paciente fallida. Las dos primeras vienen del backend en un 400. */
export type CausaFalloCrearPaciente = 'VALIDATION_ERROR' | 'FECHA_NACIMIENTO_INVALIDA' | 'ERROR';

/**
 * Resultado de `POST /chatbot/crearpaciente`:
 * - `ok` true ⇒ `pacienteId` lleno. `yaExistia` true si el backend respondió 200 con `ya_existia: true`
 *   (el documento ya estaba registrado: alta idempotente, se usa el paciente existente).
 * - `ok` false ⇒ `causa`: 400 con `cause` 'VALIDATION_ERROR' / 'FECHA_NACIMIENTO_INVALIDA' (datos
 *   rechazados, reintentar igual no sirve) o 'ERROR' (red, 5xx o respuesta sin `pacientes_id`).
 */
export interface ResultadoCrearPaciente {
    ok: boolean;
    pacienteId: string | null;
    yaExistia: boolean;
    causa?: CausaFalloCrearPaciente;
}

/** Alta de paciente. Nunca lanza. */
export async function crearPacienteDataBase(datosPaciente: any): Promise<ResultadoCrearPaciente> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/crearpaciente`;
        const response = await axios.post(url, datosPaciente);
        const data = response?.data?.data;
        const pacienteId = typeof data?.pacientes_id === 'string' && data.pacientes_id ? data.pacientes_id : null;
        if (!pacienteId) {
            console.error(`Error creando paciente: respuesta ${response?.status} sin pacientes_id.`);
            return { ok: false, pacienteId: null, yaExistia: false, causa: 'ERROR' };
        }
        return { ok: true, pacienteId, yaExistia: data?.ya_existia === true };
    } catch (error) {
        registrarFalloBackend('/chatbot/crearpaciente', error);
        const status = (error as any)?.response?.status;
        const cause = (error as any)?.response?.data?.cause;
        // Solo status, cause y mensaje del backend (campo + regla de AJV, sin el valor); nunca la URL.
        console.error(
            `Error creando paciente (status ${status ?? 'sin respuesta'}, cause ${cause ?? '-'}):`,
            (error as any)?.response?.data?.message ?? (error as any)?.message ?? error
        );
        if (status === 400) {
            const causa: CausaFalloCrearPaciente = cause === 'FECHA_NACIMIENTO_INVALIDA' ? 'FECHA_NACIMIENTO_INVALIDA' : 'VALIDATION_ERROR';
            return { ok: false, pacienteId: null, yaExistia: false, causa };
        }
        return { ok: false, pacienteId: null, yaExistia: false, causa: 'ERROR' };
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
        registrarFalloBackend('/chatbot/fechas', error);
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
        registrarFalloBackend('/chatbot/horas', error);
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
        registrarFalloBackend('/chatbot/paciente', error);
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
        registrarFalloBackend('/chatbot/reagendar', error);
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
        registrarFalloBackend('/chatbot/agendar', error);
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
        registrarFalloBackend('/chatbot/cancelarcita', error);
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

export async function enviarPlantillaConfirmacion(cita: AgendaPendienteResponse | AgendaProgramadaResponse, campanaEjecucionId?: string): Promise<ResultadoEnvioMeta> {
    let plantillaUsada: string | undefined;
    const trazar = (resultado: ResultadoEnvioMeta) =>
        trazarEnvioPlantilla(cita, 'execute', plantillaUsada, campanaEjecucionId, resultado);
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
        plantillaUsada = nombrePlantilla;
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
                            { "type": "text", "text": limpiarParametroPlantilla(cita.nombre_paciente) },
                            { "type": "text", "text": limpiarParametroPlantilla(cita.especialidad) },
                            { "type": "text", "text": limpiarParametroPlantilla(usarBotones ? formatearFechaLarga(cita.fecha_cita) : fechaFormateada) },
                            { "type": "text", "text": limpiarParametroPlantilla(usarBotones ? formatearHoraHHMM(cita.hora_cita) : cita.hora_cita) },
                            { "type": "text", "text": limpiarParametroPlantilla(cita.profesional) },
                            { "type": "text", "text": limpiarParametroPlantilla(cita.tipo_cita === 1 ? 'Presencial' : 'Virtual') },
                            { "type": "text", "text": limpiarParametroPlantilla(administradora) }
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
        const resultadoEnvio = resultadoEnvioDesdeRespuesta(response.data);
        if (resultadoEnvio.exito) {
            console.log(`Plantilla enviada exitosamente a ${cita.nombre_paciente} (${cita.telefono_paciente})`);
            if (usarBotones) {
                // Fire-and-forget (15.6): un fallo de registro nunca debe afectar el envío ya exitoso.
                registrarEnvioRecordatorio(cita.cita_id, '24h').catch((error) =>
                    console.error('Error registrando envío de recordatorio (fire-and-forget):', error)
                );
            }
        }
        return trazar(resultadoEnvio);
    } catch (error) {
        console.error('Error enviando plantilla:', error);
        return trazar(resultadoEnvioDesdeError(error));
    }
}

export async function enviarPlantillaRecordatorio24h(cita: AgendaProgramadaResponse, campanaEjecucionId?: string): Promise<ResultadoEnvioMeta> {
    let plantillaUsada: string | undefined;
    const trazar = (resultado: ResultadoEnvioMeta) =>
        trazarEnvioPlantilla(cita, 'execute', plantillaUsada, campanaEjecucionId, resultado);
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
        plantillaUsada = nombrePlantilla;
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
                            { "type": "text", "text": limpiarParametroPlantilla(cita.nombre_paciente) },
                            { "type": "text", "text": limpiarParametroPlantilla(usarBotones ? formatearFechaLarga(cita.fecha_cita) : fechaFormateada) },
                            { "type": "text", "text": limpiarParametroPlantilla(usarBotones ? formatearHoraHHMM(cita.hora_cita) : cita.hora_cita) }
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
        const resultadoEnvio = resultadoEnvioDesdeRespuesta(response.data);
        if (resultadoEnvio.exito) {
            console.log(`Plantilla enviada exitosamente a ${cita.nombre_paciente} (${cita.telefono_paciente})`);
            if (usarBotones) {
                // Fire-and-forget (15.6): un fallo de registro nunca debe afectar el envío ya exitoso.
                registrarEnvioRecordatorio(cita.cita_id, '24h').catch((error) =>
                    console.error('Error registrando envío de recordatorio (fire-and-forget):', error)
                );
            }
        }
        return trazar(resultadoEnvio);
    } catch (error) {
        console.error('Error enviando plantilla:', error);
        return trazar(resultadoEnvioDesdeError(error));
    }
}

export async function enviarPlantillaDiaria(cita: AgendaPendienteResponse, campanaEjecucionId?: string): Promise<ResultadoEnvioMeta> {
    let plantillaUsada: string | undefined;
    const trazar = (resultado: ResultadoEnvioMeta) =>
        trazarEnvioPlantilla(cita, 'daily', plantillaUsada, campanaEjecucionId, resultado);
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
        plantillaUsada = nombrePlantilla;
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
                            { "type": "text", "text": limpiarParametroPlantilla(cita.nombre_paciente) },
                            { "type": "text", "text": limpiarParametroPlantilla(cita.especialidad) },
                            { "type": "text", "text": limpiarParametroPlantilla(cita.tipo_cita === 1 ? 'Presencial' : 'Virtual') },
                            { "type": "text", "text": limpiarParametroPlantilla(usarBotones ? formatearHoraHHMM(cita.hora_cita) : cita.hora_cita) }
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
        const resultadoEnvio = resultadoEnvioDesdeRespuesta(response.data);
        if (resultadoEnvio.exito) {
            console.log(`Plantilla enviada exitosamente a ${cita.nombre_paciente} (${cita.telefono_paciente})`);
            if (usarBotones) {
                // Fire-and-forget (15.6): un fallo de registro nunca debe afectar el envío ya exitoso.
                registrarEnvioRecordatorio(cita.cita_id, '2h').catch((error) =>
                    console.error('Error registrando envío de recordatorio (fire-and-forget):', error)
                );
            }
        }
        return trazar(resultadoEnvio);
    } catch (error) {
        console.error('Error enviando plantilla:', error);
        return trazar(resultadoEnvioDesdeError(error));
    }
}

export async function enviarPlantillaRecordatorio(cita: AgendaPendienteResponse, campanaEjecucionId?: string): Promise<ResultadoEnvioMeta> {
    let plantillaUsada: string | undefined;
    const trazar = (resultado: ResultadoEnvioMeta) =>
        trazarEnvioPlantilla(cita, 'reminder', plantillaUsada, campanaEjecucionId, resultado);
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
        plantillaUsada = nombrePlantilla;
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
                            { "type": "text", "text": limpiarParametroPlantilla(cita.nombre_paciente) },
                            { "type": "text", "text": limpiarParametroPlantilla(cita.especialidad) },
                            { "type": "text", "text": limpiarParametroPlantilla(usarBotones ? formatearFechaLarga(cita.fecha_cita) : fechaFormateada) },
                            { "type": "text", "text": limpiarParametroPlantilla(usarBotones ? formatearHoraHHMM(cita.hora_cita) : cita.hora_cita) },
                            { "type": "text", "text": limpiarParametroPlantilla(cita.profesional) },
                            { "type": "text", "text": limpiarParametroPlantilla(cita.tipo_cita === 1 ? 'Presencial' : 'Virtual') },
                            { "type": "text", "text": limpiarParametroPlantilla(administradora) }
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
        const resultadoEnvio = resultadoEnvioDesdeRespuesta(response.data);
        if (resultadoEnvio.exito) {
            console.log(`Plantilla enviada exitosamente a ${cita.nombre_paciente} (${cita.telefono_paciente})`);
            if (usarBotones) {
                // Fire-and-forget (15.6): un fallo de registro nunca debe afectar el envío ya exitoso.
                registrarEnvioRecordatorio(cita.cita_id, '48h').catch((error) =>
                    console.error('Error registrando envío de recordatorio (fire-and-forget):', error)
                );
            }
        }
        return trazar(resultadoEnvio);
    } catch (error) {
        console.error('Error enviando plantilla:', error);
        return trazar(resultadoEnvioDesdeError(error));
    }
}

// ---------------------------------------------------------------------------
// Confirmación de citas con detalle del resultado
// (proyecto-ips/docs/features/2026-09-27-confirmar-cita-ya-confirmada.md, secciones 4.3 y 4.6).
// ---------------------------------------------------------------------------

/** Causas de "no se confirmó" que el bot distingue (4.6). */
export type CausaFalloConfirmacion =
    | 'CITA_CANCELADA'
    | 'CITA_REPROGRAMADA'
    | 'CITA_PASADA'
    | 'CITA_NOT_FOUND'
    | 'DOCUMENTO_INVALIDO'
    | 'GLOBHO_ERROR'
    | 'ERROR';

export type FalloConfirmacion = {
    ok: false;
    causa: CausaFalloConfirmacion;
    fecha_cita?: string;
    hora_cita?: string;
    especialidad?: string;
};

export type ResultadoConfirmacion =
    | { ok: true; estado: 'confirmada' | 'ya_confirmada'; fecha_cita?: string; hora_cita?: string; especialidad?: string }
    | FalloConfirmacion;

/** `cause` del backend que se usan tal cual (el resto de valores se tratan según el HTTP status). */
const CAUSAS_BACKEND_CONOCIDAS: ReadonlyArray<CausaFalloConfirmacion> = [
    'CITA_CANCELADA',
    'CITA_REPROGRAMADA',
    'CITA_PASADA',
    'CITA_NOT_FOUND',
    'GLOBHO_ERROR',
];

function textoOpcional(valor: unknown): string | undefined {
    return typeof valor === 'string' && valor.trim() !== '' ? valor : undefined;
}

/**
 * Traduce el error de axios de `confirmarcitameta` / `recordatorios/responder` a una causa. Compatible
 * con el backend viejo: 400 → DOCUMENTO_INVALIDO; `cause` conocida → tal cual; 404 sin causa conocida →
 * CITA_NOT_FOUND; cualquier otra cosa (5xx sin causa conocida, red, timeout) → ERROR.
 */
export function mapearErrorConfirmacion(error: any): FalloConfirmacion {
    const status: number | undefined = error?.response?.status;
    const body = error?.response?.data;
    const cause = body?.cause;
    const detalle = body?.data && typeof body.data === 'object' ? body.data : {};

    let causa: CausaFalloConfirmacion;
    if (status === 400) {
        causa = 'DOCUMENTO_INVALIDO';
    } else if (typeof cause === 'string' && CAUSAS_BACKEND_CONOCIDAS.includes(cause as CausaFalloConfirmacion)) {
        causa = cause as CausaFalloConfirmacion;
    } else if (status === 404) {
        causa = 'CITA_NOT_FOUND';
    } else {
        causa = 'ERROR';
    }

    const fallo: FalloConfirmacion = { ok: false, causa };
    const fecha = textoOpcional(detalle.fecha_cita);
    const hora = textoOpcional(detalle.hora_cita);
    const especialidad = textoOpcional(detalle.especialidad);
    if (fecha) fallo.fecha_cita = fecha;
    if (hora) fallo.hora_cita = hora;
    if (especialidad) fallo.especialidad = especialidad;
    return fallo;
}

/**
 * Confirma la cita activa más próxima de (celular, documento) vía `POST /chatbot/confirmarcitameta`.
 * Nunca lanza: devuelve el resultado con detalle (4.6). Un 200 sin `estado_resultado` (backend viejo)
 * se trata como 'confirmada'.
 */
export async function confirmarCitaCampahna(celular: string, numeroDoc: string): Promise<ResultadoConfirmacion> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/confirmarcitameta`;
        const response = await axios.post(url, { celular: celular, documento: numeroDoc });
        const body = response?.data;
        if (body?.code !== 200) {
            return { ok: false, causa: 'ERROR' };
        }
        const data = body.data && typeof body.data === 'object' ? body.data : {};
        const resultado: ResultadoConfirmacion = {
            ok: true,
            estado: data.estado_resultado === 'ya_confirmada' ? 'ya_confirmada' : 'confirmada',
        };
        const fecha = textoOpcional(data.fecha_cita);
        const hora = textoOpcional(data.hora_cita);
        const especialidad = textoOpcional(data.especialidad);
        if (fecha) resultado.fecha_cita = fecha;
        if (hora) resultado.hora_cita = hora;
        if (especialidad) resultado.especialidad = especialidad;
        return resultado;
    } catch (error) {
        registrarFalloBackend('/chatbot/confirmarcitameta', error);
        const fallo = mapearErrorConfirmacion(error);
        console.error(`Error confirmando cita (causa: ${fallo.causa}):`, (error as any)?.message ?? error);
        return fallo;
    }
}

/**
 * Registra un evento de actividad (estadística legada de `chat_stats`).
 *
 * Trazabilidad (proyecto-ips/docs/features/2026-09-29-trazabilidad-usuarios.md, 4.3.1 y 11.2):
 * - Ya NO bloquea el flujo: devuelve `true` enseguida (antes cada `await` podía hacer esperar al
 *   paciente hasta 10 s si el backend estaba lento). El resultado real del envío ya no se reporta.
 * - Con `TRAZABILIDAD_V2_ENABLED=true` el evento va por la cola de `utils/trazabilidad.ts`
 *   (`POST /stats/batch`) con el MISMO `tipo_evento` y la MISMA metadata (las vistas de la 028 siguen
 *   funcionando), más `sesion_id` (de la sesión activa) y los campos V2 de `extra` si se conocen.
 * - Apagado (default): `POST /stats` uno por uno, como siempre, pero sin esperar (fire-and-forget).
 * - `metadata.date` es ahora la fecha de hoy en hora de Bogotá (antes era la fecha UTC).
 *
 * @param tipoEvento - Tipo de evento legado (ej: 'chat_inicio', 'campahna_envio', ...)
 * @param idUsuario - Número de teléfono o identificador del usuario
 * @param metadata - Información adicional del evento (fecha, campaña, etc.)
 * @param extra - Campos V2 opcionales (sesion_id, flujo, paso...). Solo se usan con la cola V2.
 * @returns Promise<boolean> - siempre true (no bloquea ni propaga errores)
 */
export async function registrarActividadBot(
    tipoEvento: string,
    idUsuario: string,
    metadata: Record<string, any> = {},
    extra?: Omit<EventoEntrada, 'tipo_evento' | 'telefono' | 'metadata'>
): Promise<boolean> {
    try {
        const metadataCompleta = {
            date: fechaBogotaHoy(),
            ...metadata
        };

        if (isTrazabilidadV2Enabled()) {
            trackEventoLegado(tipoEvento, idUsuario, metadataCompleta, extra);
            return true;
        }

        const url = `${API_BACKEND_URL}/stats`;
        const body = {
            tipo_evento: tipoEvento,
            id_usuario: idUsuario,
            metadata: metadataCompleta
        };

        axios.post(url, body, { timeout: 10000 })
            .then((response) => {
                if (!(response?.status >= 200 && response?.status < 300)) {
                    console.warn(`Respuesta inesperada al registrar actividad: ${response?.status}`);
                }
            })
            .catch((error) => {
                console.error('Error registrando actividad del bot:', (error as any)?.message ?? error);
            });
    } catch (error) {
        console.error('Error registrando actividad del bot:', (error as any)?.message ?? error);
    }
    return true;
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

export async function enviarPlantillaRecuperar(cita: AgendaPendienteResponse, campanaEjecucionId?: string): Promise<ResultadoEnvioMeta> {
    let plantillaUsada: string | undefined;
    const trazar = (resultado: ResultadoEnvioMeta) =>
        trazarEnvioPlantilla(cita, 'recuperacion', plantillaUsada, campanaEjecucionId, resultado);
    try {
        // Formatear la fecha, aparece en formato YYYY-MM-ddTHH:mm:ss.SSSZ convertir en formato '31 de julio de 2025'

        //FALTA AJUSTAR LA PLANTILLA
        const fechaCita = new Date(cita.fecha_cita);
        const fechaFormateada = fechaCita.toLocaleDateString('es-CO', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        plantillaUsada = process.env.NOMBRE_PLANTILLA_META_CANCELADOS;
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
                            { "type": "text", "text": limpiarParametroPlantilla(cita.nombre_paciente) },
                            { "type": "text", "text": limpiarParametroPlantilla(fechaFormateada) },
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
        const resultadoEnvio = resultadoEnvioDesdeRespuesta(response.data);
        if (resultadoEnvio.exito) {
            console.log(`Plantilla enviada exitosamente a ${cita.nombre_paciente} (${cita.telefono_paciente})`);
        }
        return trazar(resultadoEnvio);
    } catch (error) {
        console.error('Error enviando plantilla:', error);
        return trazar(resultadoEnvioDesdeError(error));
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
        registrarFalloBackend('/chatbot/listaespera/inscribir', error);
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
        registrarFalloBackend('/chatbot/listaespera/retirar', error);
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

export async function enviarPlantillaUsuariosConAsistencia(cita: AgendaPendienteResponse, campanaEjecucionId?: string): Promise<ResultadoEnvioMeta> {
    let plantillaUsada: string | undefined;
    const trazar = (resultado: ResultadoEnvioMeta) =>
        trazarEnvioPlantilla(cita, 'conasistencia', plantillaUsada, campanaEjecucionId, resultado);
    try {
        // Formatear la fecha, aparece en formato YYYY-MM-ddTHH:mm:ss.SSSZ convertir en formato '31 de julio de 2025'

        //FALTA AJUSTAR LA PLANTILLA
        const fechaCita = new Date(cita.fecha_cita);
        const fechaFormateada = fechaCita.toLocaleDateString('es-CO', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        plantillaUsada = process.env.NOMBRE_PLANTILLA_META_ASISTIDOS;
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
                            { "type": "text", "text": limpiarParametroPlantilla(cita.nombre_paciente) },
                            { "type": "text", "text": limpiarParametroPlantilla(fechaFormateada) },
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
        const resultadoEnvio = resultadoEnvioDesdeRespuesta(response.data);
        if (resultadoEnvio.exito) {
            console.log(`Plantilla enviada exitosamente a ${cita.nombre_paciente} (${cita.telefono_paciente})`);
        }
        return trazar(resultadoEnvio);
    } catch (error) {
        console.error('Error enviando plantilla:', error);
        return trazar(resultadoEnvioDesdeError(error));
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
/**
 * Timeout de las llamadas al backend que corren dentro del tick de cascada. Axios no tiene timeout por
 * defecto (0 = infinito) y el poller serializa los ticks (guarda de ejecución única, corrección R2):
 * una llamada colgada sin timeout dejaría la guarda tomada y la cascada detenida en silencio. Con
 * timeout, el error cae en el catch de cada función (que ya retorna []/false) y el tick termina.
 */
export const TIMEOUT_BACKEND_CASCADA_MS = 20000;

export async function tickCascadaListaEspera(limite?: number): Promise<AccionCascada[]> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/listaespera/cascada/tick`;
        const body = typeof limite === 'number' ? { limite } : {};
        const response = await axios.post(url, body, { timeout: TIMEOUT_BACKEND_CASCADA_MS });
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
 * origen sí la traiga disponible — solo se usan nombre, profesional, fecha, hora y minutos.
 *
 * Ajuste 1 (ventana escalonada, docs/features/2026-09-28-ajustes-lista-espera.md 1.5.6/1.5.7): la
 * plantilla tiene SIEMPRE 5 variables, en este orden:
 *   {{1}} nombre del paciente, {{2}} profesional, {{3}} fecha (formatearFechaLarga),
 *   {{4}} hora HH:MM, {{5}} minutos para responder (solo el número, p. ej. '15'; el texto fijo de la
 *   plantilla ya dice "minutos").
 * No hay modo compatibilidad de 4 variables.
 *
 * @param minutosVentana minutos que tiene el paciente para responder (redondeo de
 *   `ventana_respuesta_segundos / 60` de la acción 'ofertar'); se envía como {{5}}.
 */
export async function enviarPlantillaOfertaCupo(
    nombrePaciente: string,
    telefonoPaciente: string,
    profesional: string,
    fechaCita: string,
    horaCita: string,
    minutosVentana: number
): Promise<ResultadoEnvioMeta> {
    const trazar = (resultado: ResultadoEnvioMeta): ResultadoEnvioMeta => {
        trackEnvioWhatsApp({
            telefono: telefonoPaciente,
            campana: 'oferta_cupo',
            plantilla: process.env.NOMBRE_PLANTILLA_OFERTA_CUPO ?? null,
            tipoEnvio: 'plantilla',
            resultado,
        });
        return resultado;
    };
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
                            { "type": "text", "text": limpiarParametroPlantilla(nombrePaciente) },
                            { "type": "text", "text": limpiarParametroPlantilla(profesional) },
                            { "type": "text", "text": limpiarParametroPlantilla(fechaFormateada) },
                            { "type": "text", "text": limpiarParametroPlantilla(horaFormateada) },
                            { "type": "text", "text": String(minutosVentana) }
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
        const resultadoEnvio = resultadoEnvioDesdeRespuesta(response.data);
        if (resultadoEnvio.exito) {
            // Runbook B9: sin nombre ni teléfono completo en logs.
            console.log(`Plantilla de oferta de cupo enviada exitosamente a ${enmascararTelefono(telefonoPaciente)}`);
        }
        return trazar(resultadoEnvio);
    } catch (error: any) {
        // Runbook B9: no se imprime el objeto de error completo (su config.data lleva el cuerpo del
        // mensaje con nombre y teléfono del paciente); solo estado HTTP y error de Meta.
        console.error('Error enviando plantilla de oferta de cupo:', resumirErrorMeta(error));
        return trazar(resultadoEnvioDesdeError(error));
    }
}

/**
 * Confirma al backend que la plantilla de oferta se envió. `ventanaRespuestaSegundos` (Ajuste 1,
 * 1.5.3) es el eco de la ventana que llegó en la acción 'ofertar' y cuyo equivalente en minutos se
 * puso en {{5}}: el backend la usa para `expira_at`, de modo que la expiración siga a lo que leyó el
 * paciente.
 */
export async function confirmarEnvioOfertaCupo(
    cupoLiberadoId: string,
    listaEsperaId: string,
    mensajeWaId?: string,
    ventanaRespuestaSegundos?: number
): Promise<boolean> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/listaespera/cascada/oferta/confirmar-envio`;
        const response = await axios.post(url, {
            cupo_liberado_id: cupoLiberadoId,
            lista_espera_id: listaEsperaId,
            ...(mensajeWaId ? { mensaje_wa_id: mensajeWaId } : {}),
            ...(typeof ventanaRespuestaSegundos === 'number' ? { ventana_respuesta_segundos: ventanaRespuestaSegundos } : {})
        }, { timeout: TIMEOUT_BACKEND_CASCADA_MS });
        return response.data?.code === 200;
    } catch (error: any) {
        if (error?.response?.status === 409) {
            // Corrección R1/R2 (docs/features/2026-09-28-ajustes-lista-espera.md 1.13): confirmar-envio no
            // es reintentable. Con 409 el backend ya anuló la oferta (CUPO_NO_DISPONIBLE,
            // PACIENTE_CON_OFERTA_ACTIVA) o era un duplicado (OFERTA_NO_DISPONIBLE, que es también lo que
            // responde el backend viejo). No se reintenta ni se llama a marcar-fallo: solo se registra el
            // cause. Runbook B9: solo ids internos, sin nombre ni teléfono.
            const causeRaw = error?.response?.data?.cause;
            const cause = typeof causeRaw === 'string' && causeRaw ? causeRaw : 'SIN_CAUSE';
            console.warn(
                `[confirmarEnvioOfertaCupo] 409 al confirmar envío de oferta (cause=${cause}) para cupo ` +
                `${cupoLiberadoId}/lista_espera ${listaEsperaId}. No se reintenta ni se marca fallo.`
            );
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
        }, { timeout: TIMEOUT_BACKEND_CASCADA_MS });
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
        registrarFalloBackend('/chatbot/listaespera/cascada/respuesta', error);
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
        const response = await axios.post(url, { cupo_liberado_id: cupoLiberadoId }, { timeout: TIMEOUT_BACKEND_CASCADA_MS });
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
 * después la respuesta del paciente. `citaId` es el `cita_id` que traen `AgendaPendienteResponse`/
 * `AgendaProgramadaResponse`, y en los endpoints de campañas (`citaspendientes`, `citasconfirmadas`,
 * `citasprogramadas`) el backend lo llena con `agenda.agenda_id`, el id INTERNO VARCHAR(8). No es el id
 * de Globho (`agenda_id_externa`). Verificado en proyecto-ips/backend/src/dao/agenda.dao.ts
 * (`agenda_id as cita_id`). Se llama en modo fire-and-forget desde las 4
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
export interface RespuestaRecordatorioData {
    accion: string;
    agenda_id?: string;
    persistido: boolean;
    estado_resultado?: 'confirmada' | 'ya_confirmada' | 'cancelada';
    fecha_cita?: string;
    hora_cita?: string;
}

export type ResultadoRespuestaRecordatorio =
    | { ok: true; data: RespuestaRecordatorioData }
    | FalloConfirmacion;

export async function responderRecordatorio(
    celular: string,
    documento: string,
    respuesta: 'confirma' | 'no_asistira'
): Promise<ResultadoRespuestaRecordatorio> {
    try {
        const url = `${API_BACKEND_URL}/chatbot/recordatorios/responder`;
        const response = await axios.post(url, { celular, documento, respuesta });
        const data = response?.data?.data;
        if (!data || typeof data !== 'object') {
            return { ok: false, causa: 'ERROR' };
        }
        return { ok: true, data };
    } catch (error) {
        registrarFalloBackend('/chatbot/recordatorios/responder', error);
        const fallo = mapearErrorConfirmacion(error);
        console.error(`Error respondiendo recordatorio (causa: ${fallo.causa}):`, (error as any)?.message ?? error);
        return fallo;
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
    // Trazabilidad: hoy esta función solo la usan los avisos al asesor humano (utils/avisoAsesor.ts),
    // por eso la campaña es 'aviso_asesor'. El texto del aviso nunca va en el evento.
    const trazar = (resultado: ResultadoEnvioMeta) =>
        trackEnvioWhatsApp({ telefono: to, campana: 'aviso_asesor', tipoEnvio: 'texto', resultado });
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
            trazar({ exito: true, mensajeWaId });
            return { exito: true, mensajeWaId };
        }
        trazar({ exito: false, errorCode: 'sin_messages', errorTitulo: 'respuesta de Meta sin messages' });
        return { exito: false, error: { http_status: response.status ?? null, code: null, mensaje: 'respuesta_sin_messages' } };
    } catch (error) {
        trazar(resultadoEnvioDesdeError(error));
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
        registrarFalloBackend('/chatbot/listaespera', error);
        const status = error?.response?.status;
        if (status === 400 || status === 404) {
            return { ok: true, encontrado: false, inscripciones: [] };
        }
        console.error('Error consultando lista de espera por documento:', error?.message ?? error);
        return { ok: false, encontrado: false, inscripciones: [] };
    }
}
