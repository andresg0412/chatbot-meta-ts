import { IPaciente } from '../interfaces/IPacienteIn';
import { consultarCitasPaciente, consultarCitasPacienteEspecialidad } from '../services/apiService';


export async function consultarCitasPorPacEsp(numeroDoc: string, especialidad: string): Promise<IPaciente[] | null> {
    const consultaPaciente: IPaciente[] = await consultarCitasPaciente(numeroDoc, especialidad);
    return consultaPaciente || null;
    
}
