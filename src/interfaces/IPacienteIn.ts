export interface IPaciente {
    pacientes_id: string;
    tipo_documento: string;
    nombre_paciente: string;
    numero_documento: string;
    numero_contacto?: string;
    email?: string;
    fecha_nacimiento?: string;
    edad?: number;
    agenda_id?: string;
    fecha_cita?: string;
    hora_cita?: string;
    estado_agenda?: string;
    especialidad?: string;
    codigo_catalogo?: string;
    catalogo?: string;
    profesional_id?: string;
    nombre_profesional?: string;
}