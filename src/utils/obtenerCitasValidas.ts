export async function obtenerCitasValidas(citas: any, ahora: Date) {
    return citas.filter((cita: any) => {
        if (!cita.FechaCita || !cita.HoraFinal) return false;
        const [dia, mes, anio] = (cita.FechaCita || '').split('/');
        const [hora, minuto] = (cita.HoraFinal || '').split(':');
        if (!dia || !mes || !anio || !hora || !minuto) return false;
        const fechaHoraFinal = new Date(`${anio}-${mes}-${dia}T${hora.padStart(2, '0')}:${minuto.padStart(2, '0')}:00`);
        return fechaHoraFinal > ahora;
    });
}
