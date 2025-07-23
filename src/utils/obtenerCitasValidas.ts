export async function obtenerCitasValidas(citas: any, ahora: Date) {
    return citas.filter((cita: any) => {
        if (!cita.fecha_cita || !cita.hora_cita) return false;
        const [anio, mes, dia] = (cita.fecha_cita || '').split('-');
        console.log('Fecha y hora de la cita:', cita.fecha_cita, cita.hora_cita);
        console.log('Fecha y hora actual:', ahora);
        console.log('Fecha y hora de la cita:', `${anio}-${mes}-${dia}T${cita.hora_cita}`);
        console.log('dia:', dia, 'mes:', mes, 'año:', anio);
        const [hora, minuto, segundos] = (cita.hora_cita || '').split(':');
        if (!dia || !mes || !anio || !hora || !minuto) return false;
        const fechaHoraFinal = new Date(`${anio}-${mes}-${dia}T${hora.padStart(2, '0')}:${minuto.padStart(2, '0')}:${segundos.padStart(2, '0')}`);
        return fechaHoraFinal > ahora;
    });
}
