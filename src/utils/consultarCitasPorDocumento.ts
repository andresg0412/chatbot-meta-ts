import {
    consultarPacientePorDocumento,
    consultarCitasPorPacienteId,
    crearPacienteDataBase,
} from '../services/apiService';

export async function consultarCitasPorDocumento(tipoDoc: string, numeroDoc: string) {
    const paciente = await consultarPacientePorDocumento(numeroDoc);
    if (!paciente || paciente.length === 0) {
        return [];
    }
    const pacienteId = paciente[0]?.PacientesID;
    if (!pacienteId) {
        return [];
    }
    const citas = await consultarCitasPorPacienteId(pacienteId);
    if (!citas || citas.length === 0) {
        return [];
    }
    const citasProgramadas = citas.filter((cita: any) => cita.EstadoAgenda === 'Programada');
    return citasProgramadas;
}

export async function consultarPaciente(numeroDoc: string) {
    const paciente = await consultarPacientePorDocumento(numeroDoc);
    if (!paciente || paciente.length === 0) {
        return null;
    }
    const primerNombre = paciente[0]?.PrimerNombre || '';
    const segundoNombre = paciente[0]?.SegundoNombre || '';
    const nombreCompleto = `${primerNombre} ${segundoNombre}`.trim();
    return {
        pacienteId: paciente[0].PacientesID,
        nombreCompleto,
    };
}

export async function crearPaciente(datosPaciente: any) {
    const pacienteCreado = await crearPacienteDataBase(datosPaciente);
    if (!pacienteCreado) {
        throw new Error('Error al crear el paciente');
    }
    return pacienteCreado;
}