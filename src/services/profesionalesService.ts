import axios from 'axios';

const URL_SHEETBEST = process.env.URL_SHEETBEST;
const API_KEY_SHEETBEST = process.env.API_KEY_SHEETBEST;

export async function consultarProfesionalesPorEspecialidad(especialidad: string) {
    try {
        const response = await axios.get(
            `${URL_SHEETBEST}/tabs/Equipo/Especialidad/${especialidad}`,
            {
                headers: {
                    'X-Api-Key': API_KEY_SHEETBEST,
                },
            }
        );
        // Filtrar solo profesionales activos
        return (response.data || []).filter((prof: any) => prof.Estado === 'Activo' && prof.TipoUsuario === 'Profesionales');
    } catch (error) {
        console.error('Error consultando profesionales:', error);
        return [];
    }
}

export async function consultarHorariosPorProfesionalId(profesionalId: string) {
    try {
        const response = await axios.get(
            `${URL_SHEETBEST}/tabs/HorariosEquipo/ProfesionalID/${profesionalId}`,
            {
                headers: {
                    'X-Api-Key': API_KEY_SHEETBEST,
                },
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error consultando horarios profesional:', error);
        return [];
    }
}

export async function consultarAgendaPorProfesionalId(profesionalId: string) {
    try {
        const response = await axios.get(
            `${URL_SHEETBEST}/tabs/Agenda/ProfesionalID/${profesionalId}`,
            {
                headers: {
                    'X-Api-Key': API_KEY_SHEETBEST,
                },
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error consultando agenda profesional:', error);
        return [];
    }
}
