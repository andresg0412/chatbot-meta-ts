/**
 * Servicio para el manejo de plantillas de Meta Business
 */

import { Cita } from './citasService';

/**
 * Interfaz para los parámetros de la plantilla
 */
interface PlantillaParametros {
  nombre: string;
  especialidad: string;
}

/**
 * Resultado del envío de plantilla
 */
interface ResultadoEnvio {
  exito: boolean;
  mensaje: string;
  error?: string;
}

interface CitaPendiente {
  cita_id: string;
  nombre_paciente: string;
  profesional: string;
  especialidad: string;
  fecha_cita: string;
  hora_cita: string;
  convenio?: string;
  telefono_paciente: string;
  estado: string;
}

/**
 * Clase para manejar el envío de plantillas de Meta
 */
export class MetaTemplateService {
  
  /**
   * Envía una plantilla de confirmación de cita a un paciente
   * @param cita - Datos de la cita
   * @param ctxFn - Contexto de BuilderBot para envío
   * @returns Resultado del envío
   */
  static async enviarPlantillaConfirmacion(
    cita: CitaPendiente, 
    ctxFn: any
  ): Promise<ResultadoEnvio> {
    try {
      const parametros: PlantillaParametros = {
        nombre: cita.nombre_paciente,
        especialidad: cita.especialidad
      };

      // Envío real de plantilla a Meta
      await ctxFn.provider.sendTemplate(
        cita.telefono_paciente,
        {
          name: 'plantilla_confirmacion_cita', // nombre de la plantilla en Meta
          language: { code: 'es_CO' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: parametros.nombre },
                { type: 'text', text: parametros.especialidad },
              ],
            },
            {
              type: 'button',
              sub_type: 'quick_reply',
              index: '0',
              parameters: [{ type: 'payload', payload: 'CONFIRMAR_CITA' }],
            },
            {
              type: 'button',
              sub_type: 'quick_reply',
              index: '1',
              parameters: [{ type: 'payload', payload: 'CANCELAR_CITA' }],
            },
          ],
        }
      );

      return {
        exito: true,
        mensaje: `Plantilla enviada exitosamente a ${cita.nombre_paciente} (${cita.telefono_paciente})`
      };

    } catch (error) {
      console.error('Error enviando plantilla:', error);
      return {
        exito: false,
        mensaje: `Error enviando plantilla a ${cita.nombre_paciente}`,
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
    }
  }

  /**
   * Valida el formato del número de celular
   * @param celular - Número de celular a validar
   * @returns true si es válido, false en caso contrario
   */
  static validarCelular(celular: string): boolean {
    // Validación básica para números colombianos
    const regex = /^57\d{10}$|^\d{10}$/;
    return regex.test(celular);
  }
}
