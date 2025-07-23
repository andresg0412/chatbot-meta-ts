import axios from 'axios';

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
        return cita;
    } catch (error) {
        console.error('Error actualizando estado cita:', error);
        return null;
    }
}
