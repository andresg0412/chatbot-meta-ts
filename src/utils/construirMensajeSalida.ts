export function construirMensajeFechasDisponibles(mostrarFechas: string[], fechasOrdenadas: number, nuevoFin: number, mensajeInicial: string): string {
    
    let mensaje = `${mensajeInicial}\n`;
    mostrarFechas.forEach((fecha, idx) => {
        mensaje += `*${idx + 1}*. ${fecha}\n`;
    });
    if (fechasOrdenadas > nuevoFin) {
        mensaje += `*${mostrarFechas.length + 1}*. Ver más\n`;
    }
    return mensaje;
}

export function construirMensajeHorasDisponibles(mostrarHoras: any[], numeroHoras: number, nuevoFin: number, mensajeInicial: string): string {
    let mensaje = `${mensajeInicial}\n`;
    mostrarHoras.forEach((cita, idx) => {
        mensaje += `*${idx + 1}*. ${cita.horacita} - ${cita.profesional}\n`;
    });
    if (numeroHoras > nuevoFin) {
        mensaje += `*${mostrarHoras.length + 1}*. Ver más\n`;
    }
    return mensaje;
}