export interface IReagendarCita {
    cita_anterior: ICitaAnterior;
    nueva_cita: INuevaCita;
}
export interface ICitaAnterior {
    cita_id: string;
}
export interface INuevaCita {
    especialidad: string;
    fecha_cita: string;
    hora_cita: string;
    hora_final: string;
    profesional_id: string;
    paciente_id: string;
    tipo_usuario_atencion?: string; // particular, convenio
    convenio_id?: string;
    convenio_nombre?: string;
    tipo_consulta_paciente: string; // 'primera' o 'control'
    tipo_cita?: string; // 'virtual' o 'presencial'
}

export interface IAgendaResponse {
    idAgenda: number;
    sede: string;
    profesional: string;
    especialidad: string;
    fecha: string;
    hora: string;
    horaFinal?: string;
    tipoDocumentoPaciente: string;
    documentoPaciente: string;
    nombrePaciente: string;
    telefonoPaciente?: string;
    mailPaciente?: string;
    fechaNacimientoPaciente?: string;
    edadPaciente?: number;
    estado: string;
    regimen?: string;
    codigoCatalogo?: string;
    catalogo?: string;
    tipo?: number;
    fechaCreacion: string;
    fechaActualizacion: string;
}

export interface ICrearCita {
    especialidad: string;
    fecha_cita: string;
    hora_cita: string;
    hora_final: string;
    profesional_id: string;
    paciente_id: string;
    tipo_usuario_atencion: string; // particular, convenio
    convenio_id: string;
    convenio_nombre: string;
    tipo_consulta_paciente: string;
    tipo_cita: string;
    tipo_usuario_paciente: string;
}

export interface ICrearAgendaResponse{
    sede: string;
    profesional: string;
    especialidad: string;
    horaFinal: string;
    tipoDocumentoPaciente: string;
    documentoPaciente: string;  
    nombrePaciente: string;
    telefonoPaciente: string;
    mailPaciente: string;
    fechaNacimientoPaciente: string;
    edadPaciente: number;
    regimen: string;
    codigoCatalogo: string;
    catalogo: string;
}