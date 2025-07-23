import { IPaciente } from '../interfaces/IPacienteIn';
import { consultarCitasPaciente, consultarCitasPacienteEspecialidad } from '../services/apiService';
import { consultarProfesionalesPorId } from '../services/profesionalesService';


export async function consultarCitasPorPacEsp(numeroDoc: string, especialidad: string): Promise<IPaciente[] | null> {
    const consultaPaciente: IPaciente[] = await consultarCitasPaciente(numeroDoc, especialidad);
    /**if (!paciente || paciente.pacientes_id === undefined) {
        return 'no paciente';
    }
    const citas = await consultarCitasPacienteEspecialidad(paciente.pacientes_id, especialidad);
    if (!citas || citas.length === 0) {
        return 'no citas';
    }
    // Filtrar citas anteriores a la fecha actual y con EstadoAgenda 'Asistio'
    const ahora = new Date();
    const citasAnteriores = citas.filter((cita: any) => {
        // FechaCita formato 'dd/MM/yyyy'
        const [dia, mes, anio] = cita.FechaCita.split('/');
        const fechaCita = new Date(`${anio}-${mes}-${dia}`);
        return fechaCita < ahora && cita.EstadoAgenda.toLowerCase() === 'asistio';
    });
    if (citasAnteriores.length === 0) {
        return 'no citas';
    }
    // Ordenar por fecha descendente y tomar la más reciente
    citasAnteriores.sort((a: any, b: any) => {
        const [diaA, mesA, anioA] = a.FechaCita.split('/');
        const [diaB, mesB, anioB] = b.FechaCita.split('/');
        const fechaA = new Date(`${anioA}-${mesA}-${diaA}`);
        const fechaB = new Date(`${anioB}-${mesB}-${diaB}`);
        return fechaB.getTime() - fechaA.getTime();
    });
    const ultimaCita = citasAnteriores[0];
    //consultar el profesional por ID
    const profesional = await consultarProfesionalesPorId(ultimaCita.ProfesionalID);**/
    return consultaPaciente || null;
    
}
