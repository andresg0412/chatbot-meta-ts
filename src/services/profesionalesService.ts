import axios from 'axios';

const API_KEY_SHEETBEST = process.env.API_KEY_SHEETBEST;

const ESPECIALIDAD_EQUIVALENCIAS: Record<string, string> = {
    'Psicologia': 'Psicología Clínica',
};

/**export async function consultarProfesionalesPorEspecialidadNO(especialidad: string) {
    try {
        
    } catch (error) {
        console.error('Error consultando profesionales:', error);
        return [];
    }
}

export async function consultarProfesionalesPorIdNO(profesionalId: string) {
    try {
        
    } catch (error) {
        console.error('Error consultando profesionales:', error);
        return [];
    }
}

export async function consultarHorariosPorProfesionalIdNO(profesionalId: string) {
    try {
        
    } catch (error) {
        console.error('Error consultando horarios profesional:', error);
        return [];
    }
}

export async function consultarAgendaPorProfesionalIdNO(profesionalId: string) {
    try {
        
    } catch (error) {
        console.error('Error consultando agenda profesional:', error);
        return [];
    }
}*/
