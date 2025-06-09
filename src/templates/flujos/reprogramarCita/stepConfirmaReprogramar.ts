import { addKeyword, EVENTS } from '@builderbot/bot';
import { seleccionaCitaReprogramar, preguntarConfirmarBotones } from './seleccionaCitaReprogramar';
import {
    consultarProfesionalesPorEspecialidad,
    consultarHorariosPorProfesionalId,
    consultarAgendaPorProfesionalId,
    consultarProfesionalesPorId,
} from '../../../services/profesionalesService';


const stepHoraSeleccionada = addKeyword(EVENTS.ACTION)
    .addAnswer('Por favor, escribe el número de la hora que deseas seleccionar:',
        { capture: true },
        async (ctx, { state, flowDynamic, gotoFlow }) => {
            // Esperamos selección de número de hora
            const seleccionHoraAgendar = ctx.body ? parseInt(ctx.body, 10) : 0;
            const horasDisponiblesAgendar = state.getMyState().horasDisponiblesAgendar;
            if (!horasDisponiblesAgendar || seleccionHoraAgendar < 1 || seleccionHoraAgendar > horasDisponiblesAgendar.length) {
                await flowDynamic('Opción inválida. Por favor, selecciona una hora válida.');
                return;
            }
            // Buscar la cita seleccionada (hora)
            const citaSeleccionadaHora = horasDisponiblesAgendar[seleccionHoraAgendar - 1];
            // Guardar la cita seleccionada en el estado
            await state.update({ citaSeleccionadaHora });
            // Confirmar selección al usuario
            await flowDynamic(`Has seleccionado la siguiente cita:\n*Fecha*: ${citaSeleccionadaHora.FechaCita} \n*Hora*: ${citaSeleccionadaHora.HoraCita} - ${citaSeleccionadaHora.HoraFinal} \n*Profesional*: ${citaSeleccionadaHora.profesional} \n*Especialidad*: ${citaSeleccionadaHora.Especialidad} \n*Lugar*: ${citaSeleccionadaHora.lugar}.`);
            // Enviar al flujo de confirmación (botones sí o no)
            return gotoFlow(preguntarConfirmarBotones); // O el flujo de confirmación que corresponda
        }
    );


const stepSeleccionaFechaReprogramar = addKeyword(EVENTS.ACTION)
    .addAnswer('Por favor, escribe el *número* de la fecha que deseas ver las horas disponibles:',
        { capture: true },
        async (ctx, { state, flowDynamic, gotoFlow }) => {
            const { fechasOrdenadas, citasPorFecha, pasoSeleccionFecha } = state.getMyState();
            const seleccion = ctx.body ? parseInt(ctx.body, 10) : 0;

            const mostrarFechas = fechasOrdenadas.slice(pasoSeleccionFecha.inicio, pasoSeleccionFecha.fin);
            if (seleccion < 1 || seleccion > mostrarFechas.length + 1) {
                await flowDynamic('Opción inválida. Por favor, selecciona una opción válida.');
                return;
            }
            // Si selecciona "Ver más"
            if (seleccion === mostrarFechas.length + 1 && fechasOrdenadas.length > pasoSeleccionFecha.fin) {
                const nuevoInicio = pasoSeleccionFecha.fin;
                const nuevoFin = Math.min(fechasOrdenadas.length, pasoSeleccionFecha.fin + 3);
                const nuevasFechas = fechasOrdenadas.slice(nuevoInicio, nuevoFin);
                let mensaje = '*Más fechas con citas disponibles*:\n';
                nuevasFechas.forEach((fecha, idx) => {
                    mensaje += `*${idx + 1}*. ${fecha}\n`;
                });
                if (fechasOrdenadas.length > nuevoFin) {
                    mensaje += `*${nuevasFechas.length + 1}*. Ver más\n`;
                }
                await flowDynamic(mensaje);
                await state.update({ pasoSeleccionFecha: { inicio: nuevoInicio, fin: nuevoFin } });
                return gotoFlow(stepSeleccionaFechaReprogramar);
            }
            // Si selecciona una fecha válida
            const fechaSeleccionadaAgendar = mostrarFechas[seleccion - 1];
            const horasDisponiblesAgendar = citasPorFecha[fechaSeleccionadaAgendar];
            let mensaje = `Horas disponibles para el *${fechaSeleccionadaAgendar}*:\n`;
            horasDisponiblesAgendar.forEach((cita, idx) => {
                mensaje += `${idx + 1}. ${cita.HoraCita} - ${cita.HoraFinal} - ${cita.profesional} (${cita.lugar})\n`;
            });
            await flowDynamic(mensaje);
            // Aquí puedes continuar el flujo para que el usuario seleccione la hora
            await state.update({ fechaSeleccionadaAgendar, horasDisponiblesAgendar });
            return gotoFlow(stepHoraSeleccionada); // Aquí puedes redirigir al siguiente paso si lo deseas
        }
    );


async function obtenerDuracionCitaEspecialidad(profesionales) {
    for (const profesional of profesionales) {
        const horariosArr = await consultarHorariosPorProfesionalId(profesional.ColaboradoresId);
        for (const horarios of horariosArr) {
            for (const dia of ['Lunes','Martes','Miercoles','Jueves','Viernes','Sabado','Domingo']) {
                if (horarios[dia]) {
                    const horas = horarios[dia].split(',').map(h => h.trim()).filter(Boolean).sort();
                    if (horas.length >= 4) {
                        // Calcular diferencias
                        const diferencias = [];
                        for (let i = 1; i < horas.length; i++) {
                            const [h1, m1] = horas[i - 1].split(':').map(Number);
                            const [h2, m2] = horas[i].split(':').map(Number);
                            diferencias.push((h2 * 60 + m2) - (h1 * 60 + m1));
                        }
                        // Buscar la duración más frecuente
                        const frecuencia: { [min: number]: number } = {};
                        diferencias.forEach(d => { frecuencia[d] = (frecuencia[d] || 0) + 1; });
                        const duracion = Number(Object.keys(frecuencia).reduce((a, b) => frecuencia[a] > frecuencia[b] ? a : b));
                        if (duracion > 0) return duracion;
                    }
                }
            }
        }
    }
    // Si no se encuentra, por defecto 45 minutos
    return 45;
}

async function obtenerCitasDisponiblesPorProfesional(profesional, especialidad, ahora, duracionCita) {
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
                    if (fechaProxima.getMonth() !== ahora.getMonth() && semanasAMostrar > 4) continue;
                    for (let i = 0; i < horas.length; i++) {
                        const hora = horas[i];
                        const [h, m] = hora.split(':').map(Number);
                        const totalMin = h * 60 + m + duracionCita;
                        const hFinal = Math.floor(totalMin / 60).toString().padStart(2, '0');
                        const mFinal = (totalMin % 60).toString().padStart(2, '0');
                        const horaFinal = `${hFinal}:${mFinal}`;
                        const citaAgendaExistente = agendaArr.find((cita) =>
                            cita.FechaCita === formatDate(fechaProxima) && cita.HoraCita === hora
                        );
                        const ocupada = citaAgendaExistente && ['Programada','Aprobada','Asistio','Confirmo'].includes(citaAgendaExistente.EstadoAgenda);
                        const [horaStr, minutoStr] = hora.split(':');
                        const fechaHora = new Date(fechaProxima);
                        fechaHora.setHours(Number(horaStr), Number(minutoStr), 0, 0);
                        if (!ocupada && fechaHora > ahora) {
                            if (citaAgendaExistente) {
                                citas.push({ ...citaAgendaExistente,
                                    lugar: profesional.Sede || 'Bucarama Gonzalez Valencia',
                                    profesional: profesional.NombreCompleto ?? (`${profesional.PrimerNombre} ${profesional.PrimerApellido}`),
                                });
                            } else {
                                citas.push({
                                    id: profesional.ColaboradoresId + '-' + formatDate(fechaProxima) + '-' + hora,
                                    FechaCita: formatDate(fechaProxima),
                                    HoraCita: hora,
                                    HoraFinal: horaFinal,
                                    lugar: profesional.Sede || 'Bucarama Gonzalez Valencia',
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

async function obtenerCitasDisponiblesPrimeraVez(Especialidad) {
    const profesionales = await consultarProfesionalesPorEspecialidad(Especialidad);
    const ahora = new Date();
    const duracionCita = await obtenerDuracionCitaEspecialidad(profesionales);
    let citasDisponiblesReprogramar = [];
    for (const profesional of profesionales) {
        const citas = await obtenerCitasDisponiblesPorProfesional(profesional, Especialidad, ahora, duracionCita);
        citasDisponiblesReprogramar = citasDisponiblesReprogramar.concat(citas);
    }
    console.log('Citas disponibles para reprogramar:', citasDisponiblesReprogramar);
    return citasDisponiblesReprogramar;
}

async function obtenerCitasDisponiblesControl(profesionalPrevio) {
    const ahora = new Date();
    const Especialidad = profesionalPrevio.Especialidad;
    const duracionCita = await obtenerDuracionCitaEspecialidad([profesionalPrevio]);
    let citasDisponiblesReprogramar = [];
    const citas = await obtenerCitasDisponiblesPorProfesional(profesionalPrevio, Especialidad, ahora, duracionCita);
    citasDisponiblesReprogramar = citasDisponiblesReprogramar.concat(citas);
    return citasDisponiblesReprogramar;
}

function agruparCitasPorFecha(citasDisponiblesReprogramar) {
    const citasPorFecha = {};
    citasDisponiblesReprogramar.forEach(cita => {
        if (!citasPorFecha[cita.FechaCita]) {
            citasPorFecha[cita.FechaCita] = [];
        }
        citasPorFecha[cita.FechaCita].push(cita);
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

const stepConfirmaReprogramar = addKeyword(EVENTS.ACTION)
    .addAnswer(
        'A continuación te mostraré las fechas disponibles:',
        {
            capture: false,
        },
        async (ctx, { state, gotoFlow, flowDynamic }) => {
            const citaSeleccionadaProgramada = state.getMyState().citaSeleccionadaProgramada;
            if (!citaSeleccionadaProgramada) {
                await flowDynamic('No se encontró la cita seleccionada.');
                return;
            }
            const { Especialidad, MotivoConsulta, ProfesionalID, profesional } = citaSeleccionadaProgramada;
            let citasDisponiblesReprogramar = [];
            if (MotivoConsulta === 'Primera Vez') {
                citasDisponiblesReprogramar = await obtenerCitasDisponiblesPrimeraVez(Especialidad);
            } else if (MotivoConsulta === 'Control') {
                let profesionalPrevio = ProfesionalID;
                if (!profesionalPrevio || typeof profesionalPrevio !== 'object') {
                    const profesional = await consultarProfesionalesPorId(ProfesionalID);
                    profesionalPrevio = profesional && profesional.length > 0 ? profesional[0] : null;
                }
                if (!profesionalPrevio) {
                    await flowDynamic('No se encontró el profesional de la cita anterior.');
                    return;
                }
                citasDisponiblesReprogramar = await obtenerCitasDisponiblesControl(profesionalPrevio);
            }
            if (!citasDisponiblesReprogramar.length) {
                await flowDynamic('No hay citas disponibles para reprogramar en este momento. Por favor, inténtalo más tarde.');
                return gotoFlow(seleccionaCitaReprogramar);
            }
            const { citasPorFecha, fechasOrdenadas } = agruparCitasPorFecha(citasDisponiblesReprogramar);
            await state.update({ citasPorFecha, fechasOrdenadas, citasDisponiblesReprogramar });
            const mostrarFechas = fechasOrdenadas.slice(0, 3);
            let mensaje = '*Fechas con citas disponibles*:\n';
            mostrarFechas.forEach((fecha, idx) => {
                mensaje += `*${idx + 1}*. ${fecha}\n`;
            });
            if (fechasOrdenadas.length > 3) {
                mensaje += `*${mostrarFechas.length + 1}*. Ver más\n`;
            }
            await flowDynamic(mensaje);
            await state.update({ pasoSeleccionFecha: { inicio: 0, fin: 3 } });
            return gotoFlow(stepSeleccionaFechaReprogramar);
        }
    );


// Función auxiliar para obtener la próxima fecha de un día de la semana a partir de una fecha base
function getNextDateForDay(dia: string, baseDate: Date): Date {
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
// Función auxiliar para formatear fecha a dd/mm/yyyy
function formatDate(date: Date): string {
    return date.getDate().toString().padStart(2,'0') + '/' + (date.getMonth()+1).toString().padStart(2,'0') + '/' + date.getFullYear();
}

export {
    stepConfirmaReprogramar,
    //step8ConfirmaReprogramar,
    //step9ConfirmaReprogramar,
    stepSeleccionaFechaReprogramar,
    stepHoraSeleccionada
};