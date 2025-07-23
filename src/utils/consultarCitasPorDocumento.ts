import {
    consultarPacientePorDocumento,
    consultarCitasProximasPaciente,
    crearPacienteDataBase,
} from '../services/apiService';

export async function consultarCitasPorDocumento(tipoDoc: string, numeroDoc: string) {
    const citas = await consultarCitasProximasPaciente(numeroDoc);
    if (!citas || citas.length === 0) {
        return [];
    }
    const citasProgramadas = citas.filter((cita: any) => cita.estado_agenda === 'Pendiente');
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

export async function crearPaciente(datosPaciente: any) {
    const pacienteCreado = await crearPacienteDataBase(datosPaciente);
    if (!pacienteCreado) {
        throw new Error('Error al crear el paciente');
    }
    return pacienteCreado.pacientes_id || null;
}
