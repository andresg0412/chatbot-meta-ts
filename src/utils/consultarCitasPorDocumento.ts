import {
    consultarPacientePorDocumento,
    consultarCitasProximasPaciente,
    crearPacienteDataBase,
    ResultadoCrearPaciente,
} from '../services/apiService';
import { esEstadoCitaGestionable } from '../constants/estadosCita';

export async function consultarCitasPorDocumento(tipoDoc: string, numeroDoc: string) {
    const citas = await consultarCitasProximasPaciente(numeroDoc);
    if (!citas || citas.length === 0) {
        return [];
    }
    const citasProgramadas = citas.filter((cita: any) => esEstadoCitaGestionable(cita?.estado_agenda));
    return citasProgramadas;
}

export async function consultarPaciente(numeroDoc: string) {
    const paciente = await consultarPacientePorDocumento(numeroDoc);
    if (!paciente) {
        return null;
    }
    const nombreCompleto = paciente.nombre_paciente;
    return {
        pacienteId: paciente.pacientes_id,
        nombreCompleto,
    };
}

/**
 * Alta de paciente nuevo. Nunca lanza: devuelve el resultado con detalle (ver `ResultadoCrearPaciente`).
 * Un documento ya registrado (200 con `ya_existia: true`) cuenta como éxito con el `pacientes_id` existente.
 */
export async function crearPaciente(datosPaciente: any): Promise<ResultadoCrearPaciente> {
    return crearPacienteDataBase(datosPaciente);
}
