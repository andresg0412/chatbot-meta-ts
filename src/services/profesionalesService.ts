import axios from 'axios';

const URL_SHEETBEST = process.env.URL_SHEETBEST;
const API_KEY_SHEETBEST = process.env.API_KEY_SHEETBEST;

const ESPECIALIDAD_EQUIVALENCIAS: Record<string, string> = {
    'Psicologia': 'Psicología Clínica',
};

/*export async function consultarProfesionalesPorEspecialidad(especialidad: string) {
    try {
        const especialidadFinal = ESPECIALIDAD_EQUIVALENCIAS[especialidad] || especialidad;
        const response = await axios.get(
            `${URL_SHEETBEST}/tabs/Equipo/Especialidad/${especialidadFinal}`,
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
}*/

export async function consultarProfesionalesPorEspecialidad(especialidad: string) {
    try {
        //const especialidadFinal = ESPECIALIDAD_EQUIVALENCIAS[especialidad] || especialidad;
        // convertir especialidad a minúsculas y primera mayuscula para la consulta
        const especialidadFinal = especialidad.charAt(0).toUpperCase() + especialidad.slice(1).toLowerCase();
        const response = await axios.get(
            `${URL_SHEETBEST}/tabs/Equipo/query?TipoProfesional=__eq(${especialidadFinal})&Estado=__eq(Activo)&TipoUsuario=__eq(Profesionales)`,
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

export async function consultarProfesionalesPorId(profesionalId: string) {
    try {
        const response = await axios.get(
            `${URL_SHEETBEST}/tabs/Equipo/ColaboradoresId/${profesionalId}`,
            {
                headers: {
                    'X-Api-Key': API_KEY_SHEETBEST,
                },
            }
        );
        // Filtrar solo profesionales activos
        return (response.data || []).filter((prof: any) => prof.Estado === 'Activo');
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
