export function construirMensajeFechasDisponibles(mostrarFechas: string[], fechasOrdenadas: number, nuevoFin: number, mensajeInicial: string, inicio: number = 0): string {
    
    let mensaje = `${mensajeInicial}\n`;
    mostrarFechas.forEach((fecha, idx) => {
        mensaje += `*${inicio + idx + 1}*. ${fecha}\n`;
    });
    if (fechasOrdenadas > nuevoFin) {
        mensaje += `*${nuevoFin + 1}*. Ver más\n`;
    }
    return mensaje;
}

export function construirMensajeHorasDisponibles(mostrarHoras: any[], numeroHoras: number, nuevoFin: number, mensajeInicial: string, inicio: number = 0): string {
    let mensaje = `${mensajeInicial}\n`;
    mostrarHoras.forEach((cita, idx) => {
        mensaje += `*${inicio + idx + 1}*. ${cita.horacita} - ${cita.profesional}\n`;
    });
    if (numeroHoras > nuevoFin) {
        mensaje += `*${nuevoFin + 1}*. Ver más\n`;
    }
    return mensaje;
}
