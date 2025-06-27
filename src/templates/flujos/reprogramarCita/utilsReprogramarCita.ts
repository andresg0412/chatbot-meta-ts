import {
    consultarProfesionalesPorEspecialidad,
    consultarHorariosPorProfesionalId,
    consultarAgendaPorProfesionalId,
    consultarProfesionalesPorId,
} from '../../../services/profesionalesService';
import { obtenerFestivos } from '../../../services/apiService';

export async function obtenerDuracionCitaEspecialidad(profesionales) {
    for (const profesional of profesionales) {
        const horariosArr = await consultarHorariosPorProfesionalId(profesional.ColaboradoresId);
        for (const horarios of horariosArr) {
            for (const dia of ['Lunes','Martes','Miercoles','Jueves','Viernes','Sabado','Domingo']) {
                if (horarios[dia]) {
                    const horas = horarios[dia].split(',').map(h => h.trim()).filter(Boolean).sort();
                    if (horas.length >= 4) {
                        const diferencias = [];
                        for (let i = 1; i < horas.length; i++) {
                            const [h1, m1] = horas[i - 1].split(':').map(Number);
                            const [h2, m2] = horas[i].split(':').map(Number);
                            diferencias.push((h2 * 60 + m2) - (h1 * 60 + m1));
                        }
                        const frecuencia: { [min: number]: number } = {};
                        diferencias.forEach(d => { frecuencia[d] = (frecuencia[d] || 0) + 1; });
                        const duracion = Number(Object.keys(frecuencia).reduce((a, b) => frecuencia[a] > frecuencia[b] ? a : b));
                        if (duracion > 0) return duracion;
                    }
                }
            }
        }
    }
    return 45;
}

export async function obtenerCitasDisponiblesPorProfesional(profesional, especialidad, ahora, duracionCita, festivos = []) {
    const horariosArr = await consultarHorariosPorProfesionalId(profesional.ColaboradoresId);
    const agendaArr = await consultarAgendaPorProfesionalId(profesional.ColaboradoresId);
    const citas = [];
    const semanasAMostrar = 4;
    for (const horarios of horariosArr) {
        for (const dia of ['Lunes','Martes','Miercoles','Jueves','Viernes','Sabado','Domingo']) {
            if (horarios[dia]) {
                const horas = horarios[dia].split(',').map(h => h.trim()).filter(Boolean).sort();
                for (let semana = 0; semana < semanasAMostrar; semana++) {
                    const fechaBase = new Date(ahora);
                    fechaBase.setDate(fechaBase.getDate() + semana * 7);
                    const fechaProxima = getNextDateForDay(dia, fechaBase);
                    const fechaProximaStr = formatDate(fechaProxima);
                    // Excluir si es festivo
                    if (festivos.includes(fechaProximaStr)) continue;
                    if (fechaProxima.getMonth() !== ahora.getMonth() && semanasAMostrar > 4) continue;
                    for (let i = 0; i < horas.length; i++) {
                        const hora = horas[i];
                        const [h, m] = hora.split(':').map(Number);
                        const totalMin = h * 60 + m + duracionCita;
                        const hFinal = Math.floor(totalMin / 60).toString().padStart(2, '0');
                        const mFinal = (totalMin % 60).toString().padStart(2, '0');
                        const horaFinal = `${hFinal}:${mFinal}`;
                        const citaAgendaExistente = agendaArr.find((cita) =>
                            cita.FechaCita === fechaProximaStr && cita.HoraCita === hora
                        );
                        const ocupada = citaAgendaExistente && ['Programada','Aprobada','Asistio','Confirmo'].includes(citaAgendaExistente.EstadoAgenda);
                        const [horaStr, minutoStr] = hora.split(':');
                        const fechaHora = new Date(fechaProxima);
                        fechaHora.setHours(Number(horaStr), Number(minutoStr), 0, 0);
                        if (!ocupada && fechaHora > ahora) {
                            if (citaAgendaExistente) {
                                citas.push({ ...citaAgendaExistente,
                                    lugar: profesional.Sede || 'Av. Gonzalez Valencia Bucaramanga',
                                    profesional: profesional.NombreCompleto ?? (`${profesional.PrimerNombre} ${profesional.PrimerApellido}`),
                                });
                            } else {
                                citas.push({
                                    id: profesional.ColaboradoresId + '-' + fechaProximaStr + '-' + hora,
                                    FechaCita: fechaProximaStr,
                                    HoraCita: hora,
                                    HoraFinal: horaFinal,
                                    lugar: profesional.Sede || 'Av. Gonzalez Valencia Bucaramanga',
                                    profesional: profesional.NombreCompleto ?? (`${profesional.PrimerNombre} ${profesional.PrimerApellido}`),
                                    ProfesionalID: profesional.ColaboradoresId,
                                    Especialidad: especialidad
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    return citas;
}

export async function obtenerCitasDisponiblesPrimeraVez(Especialidad) {
    const profesionales = await consultarProfesionalesPorEspecialidad(Especialidad);
    const ahora = new Date();
    const duracionCita = await obtenerDuracionCitaEspecialidad(profesionales);
    const festivos = await obtenerFestivos();
    let citasDisponiblesReprogramar = [];
    for (const profesional of profesionales) {
        const citas = await obtenerCitasDisponiblesPorProfesional(profesional, Especialidad, ahora, duracionCita, festivos);
        citasDisponiblesReprogramar = citasDisponiblesReprogramar.concat(citas);
    }
    return citasDisponiblesReprogramar;
}

export async function obtenerCitasDisponiblesControl(profesionalPrevio) {
    const ahora = new Date();
    const Especialidad = profesionalPrevio.Especialidad;
    const duracionCita = await obtenerDuracionCitaEspecialidad([profesionalPrevio]);
    const festivos = await obtenerFestivos();
    let citasDisponiblesReprogramar = [];
    const citas = await obtenerCitasDisponiblesPorProfesional(profesionalPrevio, Especialidad, ahora, duracionCita, festivos);
    citasDisponiblesReprogramar = citasDisponiblesReprogramar.concat(citas);
    return citasDisponiblesReprogramar;
}

export function agruparCitasPorFecha(citasDisponiblesReprogramar) {
    const citasPorFecha = {};
    citasDisponiblesReprogramar.forEach(cita => {
        if (!citasPorFecha[cita.FechaCita]) {
            citasPorFecha[cita.FechaCita] = [];
        }
        citasPorFecha[cita.FechaCita].push(cita);
    });
    // Ordenar las citas de cada fecha por HoraCita
    Object.keys(citasPorFecha).forEach(fecha => {
        citasPorFecha[fecha].sort((a, b) => a.HoraCita.localeCompare(b.HoraCita));
    });
    const fechasOrdenadas = Object.keys(citasPorFecha).sort((a, b) => {
        const [da, ma, ya] = a.split('/');
        const [db, mb, yb] = b.split('/');
        const fechaA = new Date(`${ya}-${ma}-${da}`);
        const fechaB = new Date(`${yb}-${mb}-${db}`);
        return fechaA.getTime() - fechaB.getTime();
    });
    return { citasPorFecha, fechasOrdenadas };
}

export function getNextDateForDay(dia: string, baseDate: Date): Date {
    const diasSemana = {
        'Domingo': 0,
        'Lunes': 1,
        'Martes': 2,
        'Miercoles': 3,
        'Jueves': 4,
        'Viernes': 5,
        'Sabado': 6
    };
    const diaObjetivo = diasSemana[dia];
    const fecha = new Date(baseDate);
    fecha.setHours(0,0,0,0);
    const diff = (diaObjetivo + 7 - fecha.getDay()) % 7;
    fecha.setDate(fecha.getDate() + (diff === 0 ? 7 : diff));
    return fecha;
}

export function formatDate(date: Date): string {
    return date.getDate().toString().padStart(2,'0') + '/' + (date.getMonth()+1).toString().padStart(2,'0') + '/' + date.getFullYear();
}
