// Simulación de servicios para citas y base de datos en memoria
import fs from 'fs';
import path from 'path';

// Ruta del archivo JSON para almacenamiento (puede cambiarse por memoria si prefieres)
const DB_PATH = path.join(process.cwd(), 'src', 'services', 'citasDB.json');
const statusFilePath = path.join(process.cwd(), 'src', 'services', 'confBot.json');

export type Cita = {
  cedula: string;
  nombre: string;
  celular: string;
  fecha: string;
  hora: string;
  lugar: string;
  estado: 'programada' | 'confirmada' | 'cancelada';
};

// Simula llamada a API para obtener citas programadas
export async function obtenerCitasProgramadas(): Promise<Cita[]> {
  // Simulación de respuesta
  return [
    {
      cedula: '123456789',
      nombre: 'Andres Gamboa',
      celular: '573185215524',
      fecha: '2025-06-01',
      hora: '10:00',
      lugar: 'Sede Norte',
      estado: 'programada',
    },
    {
      cedula: '987654321',
      nombre: 'Ana Gómez',
      celular: '3009876543',
      fecha: '2025-06-01',
      hora: '11:00',
      lugar: 'Sede Centro',
      estado: 'programada',
    },
  ];
}

// Guarda las citas en el archivo JSON
export async function guardarCitasDB(citas: Cita[]): Promise<void> {
  fs.writeFileSync(DB_PATH, JSON.stringify(citas, null, 2), 'utf-8');
}

// Lee las citas del archivo JSON
export function leerCitasDB(): Cita[] {
  if (!fs.existsSync(DB_PATH)) return [];
  const data = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(data);
}

// Busca una cita por celular
export function buscarCitaPorCelular(celular: string): Cita | undefined {
  const citas = leerCitasDB();
  return citas.find(c => c.celular === celular);
}

// Simula llamada a API para confirmar cita
export async function confirmarCitaPorCedula(cedula: string): Promise<boolean> {
  let citas = leerCitasDB();
  let updated = false;
  citas = citas.map(cita => {
    if (cita.cedula === cedula && cita.estado === 'programada') {
      updated = true;
      return { ...cita, estado: 'confirmada' };
    }
    return cita;
  });
  if (updated) guardarCitasDB(citas);
  return updated;
}


/**
 * Actualiza el estado de una cita específica a 'enviado'
 * @param cedula - Cédula del paciente
 * @returns true si se actualizó correctamente, false en caso contrario
 */
/*export async function marcarCitaComoEnviada(cedula: string): Promise<boolean> {
  try {
    // Aquí harías la llamada real a tu API para actualizar el estado
    // const response = await axios.put(`${API_BACKEND_URL}/chatbot/actualizar-estado-cita`, {
    //   cedula,
    //   estado: 'enviado'
    // });
    // return response.status === 200;
    
    // Simulación temporal - actualiza en la BD local
    let citas = leerCitasDB();
    let updated = false;
    citas = citas.map(cita => {
      if (cita.cedula === cedula) {
        updated = true;
        return { ...cita, estado: 'enviado' };
      }
      return cita;
    });
    
    if (updated) {
      guardarCitasDB(citas);
    }
    
    return updated;
  } catch (error) {
    console.error('Error marcando cita como enviada:', error);
    return false;
  }
}*/

export const obtenerEstadoBot = (): { habilitado: boolean; ultimaModificacion: string } => {
  try {
    const data = fs.readFileSync(statusFilePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error obteniendo estado del bot:', error);
    return { habilitado: true, ultimaModificacion: '' };
  }
};
export const actualizarEstadoBot = (habilitado: boolean): boolean => {
  try {
    const nuevoEstado: { habilitado: boolean; ultimaModificacion: string } = {
      habilitado,
      ultimaModificacion: new Date().toISOString()
    };
    
    fs.writeFileSync(statusFilePath, JSON.stringify(nuevoEstado, null, 2));
    console.log(`Bot ${habilitado ? 'habilitado' : 'deshabilitado'} - ${nuevoEstado.ultimaModificacion}`);
    return true;
  } catch (error) {
    console.error('Error actualizando estado del bot:', error);
    return false;
  }
};

export const esBotHabilitado = (): boolean => {
  const estado = obtenerEstadoBot();
  return estado.habilitado;
};