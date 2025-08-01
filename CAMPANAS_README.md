# Funcionalidad de Campañas de Meta

## Descripción General

Esta funcionalidad permite a usuarios autorizados ejecutar campañas de plantillas de Meta Business para enviar recordatorios de citas a pacientes.

## Características Principales

### 1. Control de Autorización
- Solo números específicos pueden ejecutar campañas
- Configuración centralizada en `authConstants.ts`
- Respuesta genérica para usuarios no autorizados

### 2. Comando de Ejecución
```
ejecutar DD/MM/YYYY
```

**Ejemplos válidos:**
- `ejecutar 2/8/2025`
- `ejecutar 15/12/2025`
- `ejecutar 1/1/2025`

### 3. Flujo de Procesamiento

1. **Validación de autorización**: Verifica que el número esté autorizado
2. **Validación de formato**: Extrae y valida la fecha del comando
3. **Consulta de citas**: Obtiene citas pendientes para la fecha especificada
4. **Envío de plantillas**: Procesa cada cita individualmente
5. **Actualización de estado**: Marca cada cita como "enviado"
6. **Reporte final**: Muestra estadísticas del proceso

## Archivos Modificados/Creados

### Nuevos Archivos
- `src/constants/authConstants.ts` - Configuración de números autorizados
- `src/services/metaTemplateService.ts` - Servicio para plantillas de Meta
- `src/utils/dateValidator.ts` - Validación y formato de fechas

### Archivos Modificados
- `src/services/citasService.ts` - Nuevas funciones para consultas y actualizaciones
- `src/templates/flujos/campahna/ejecutarCampahna.ts` - Lógica principal renovada

## Configuración

### Números Autorizados
Edita `src/constants/authConstants.ts` para agregar/quitar números autorizados:

```typescript
export const NUMEROS_AUTORIZADOS = [
  '573185215524', // Número autorizado 1
  '3001234567'    // Número autorizado 2
];
```

### Plantilla de Meta
La plantilla debe estar configurada en Meta Business con:
- **Nombre**: `plantilla_confirmacion_cita`
- **Parámetros del body**: 
  1. Nombre del paciente
  2. Especialidad
- **Botones**:
  - Confirmar (payload: `CONFIRMAR_CITA`)
  - Cancelar (payload: `CANCELAR_CITA`)

## API Endpoints Requeridos

### Obtener Citas Pendientes
```
GET /chatbot/citas-pendientes?fecha=YYYY-MM-DD
```

**Respuesta esperada:**
```json
{
  "data": [
    {
      "cedula": "123456789",
      "nombre": "Juan Pérez",
      "celular": "573001234567",
      "fecha": "2025-08-02",
      "hora": "10:00",
      "lugar": "Sede Norte",
      "especialidad": "Cardiología",
      "estado": "programada"
    }
  ]
}
```

### Actualizar Estado de Cita
```
PUT /chatbot/actualizar-estado-cita
```

**Body:**
```json
{
  "cedula": "123456789",
  "estado": "enviado"
}
```

## Manejo de Errores

### Errores de Validación
- **Número no autorizado**: "No entiendo que has dicho."
- **Formato incorrecto**: Mensaje con ejemplo del formato correcto
- **Fecha inválida**: Validación completa incluyendo días del mes

### Errores de Procesamiento
- **Sin citas**: Mensaje informativo cuando no hay citas para la fecha
- **Error de envío**: Log detallado + continuación con siguientes citas
- **Error de API**: Manejo graceful con mensajes informativos

## Logs y Monitoreo

### Logs de Consola
```typescript
console.log(`✅ Plantilla enviada a ${cita.nombre} (${cita.celular})`);
console.error(`❌ Error procesando cita de ${cita.nombre}:`, error);
```

### Reporte Final
```
📊 Reporte de Campaña Completado
📅 Fecha: 2025-08-02
✅ Exitosos: 8
❌ Errores: 1
📱 Total procesados: 9
```

## Principios de Desarrollo Aplicados

### 1. Principio de Responsabilidad Única
- **`authConstants.ts`**: Solo maneja autorización
- **`metaTemplateService.ts`**: Solo maneja plantillas de Meta
- **`dateValidator.ts`**: Solo valida y formatea fechas
- **`citasService.ts`**: Solo maneja operaciones de citas

### 2. Separación de Responsabilidades
- Validación separada de lógica de negocio
- Servicios especializados para cada funcionalidad
- Configuración centralizada

### 3. Manejo de Errores Robusto
- Try-catch en todos los puntos críticos
- Mensajes informativos para el usuario
- Logs detallados para debugging

### 4. Código Mantenible
- Funciones pequeñas y enfocadas
- Comentarios descriptivos
- Tipos TypeScript bien definidos
- Nombres de variables y funciones descriptivos

## Próximos Pasos

1. **Conectar con API real**: Reemplazar simulaciones en `citasService.ts`
2. **Testing**: Agregar pruebas unitarias para cada servicio
3. **Métricas**: Integrar con sistema de métricas existente
4. **Rate Limiting**: Implementar control de velocidad de envío
5. **Retry Logic**: Agregar reintentos automáticos para errores temporales
