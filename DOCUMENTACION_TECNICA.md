# Documentación Técnica - Chatbot WhatsApp Business para IPS

## 📋 Tabla de Contenidos
- [Información General](#información-general)
- [Arquitectura del Sistema](#arquitectura-del-sistema)
- [Tecnologías Utilizadas](#tecnologías-utilizadas)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Flujos Conversacionales](#flujos-conversacionales)
- [Integración con APIs](#integración-con-apis)
- [Características Técnicas](#características-técnicas)
- [Configuración y Deploy](#configuración-y-deploy)
- [Métricas y Monitoreo](#métricas-y-monitoreo)
- [Seguridad](#seguridad)
- [Mantenimiento](#mantenimiento)

---

## 📖 Información General

### Descripción
Chatbot conversacional para WhatsApp Business desarrollado específicamente para una IPS (Institución Prestadora de Servicios de Salud) que permite a los pacientes gestionar sus citas médicas de manera automatizada. El bot está integrado con **Meta Provider** y utiliza **SheetBest API** como backend para la persistencia de datos.

### Propósito
- Automatizar el proceso de agendamiento, reprogramación y cancelación de citas médicas
- Proporcionar información sobre servicios de la IPS
- Mejorar la experiencia del usuario con atención 24/7
- Reducir la carga de trabajo del personal administrativo

### Características Principales
- ✅ **Agendamiento de citas** completo con validación de disponibilidad
- ✅ **Reprogramación de citas** con lógica diferenciada por tipo de consulta
- ✅ **Cancelación de citas** con confirmación de seguridad
- ✅ **Información de la IPS** (servicios, tarifas, horarios, etc.)
- ✅ **Transferencia a agente humano** vía enlace directo de WhatsApp
- ✅ **Sistema de métricas** para monitoreo de rendimiento
- ✅ **Límites de seguridad** para prevenir spam y abuso
- ✅ **Interfaz conversacional moderna** con botones y listas interactivas

---

## 🏗️ Arquitectura del Sistema

### Diagrama de Arquitectura
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   WhatsApp      │    │    Chatbot       │    │   SheetBest     │
│   Business      │◄──►│   (Node.js +     │◄──►│   API           │
│   (Meta API)    │    │   TypeScript)    │    │ (Google Sheets) │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   Metrics DB     │
                       │   (JSON File)    │
                       └──────────────────┘
```

### Componentes Principales

1. **Provider Meta**: Maneja la comunicación con WhatsApp Business API
2. **Motor Conversacional**: Framework BuilderBot para gestión de flujos
3. **API Service**: Capa de abstracción para comunicación con SheetBest
4. **Sistema de Métricas**: Registro y análisis de uso del bot
5. **Utilitarios**: Funciones de seguridad, validación y sanitización

---

## 🛠️ Tecnologías Utilizadas

### Framework y Runtime
- **Node.js** v20+ con **TypeScript**
- **@builderbot/bot** v1.2.2 - Framework conversacional
- **@builderbot/provider-meta** v1.2.2 - Integración con Meta

### Dependencias Principales
```json
{
  "@builderbot/bot": "1.2.2",
  "@builderbot/provider-meta": "1.2.2",
  "dotenv": "^16.4.5",
  "axios": "para requests HTTP"
}
```

### Herramientas de Desarrollo
- **TypeScript** para tipado estático
- **ESLint** para linting de código
- **Jest** para testing
- **Nodemon** para desarrollo
- **Rollup** para bundling

### APIs Externas
- **Meta WhatsApp Business API** - Comunicación con usuarios
- **SheetBest API** - Persistencia de datos en Google Sheets

---

## 📁 Estructura del Proyecto

```
bot-meta/
├── src/
│   ├── app.ts                          # Punto de entrada principal
│   ├── constants/
│   │   └── conveniosConstants.ts       # Mapeo de convenios médicos
│   ├── services/
│   │   ├── apiService.ts              # Servicios de API externa
│   │   ├── citasService.ts            # Lógica de citas
│   │   └── profesionalesService.ts    # Gestión de profesionales
│   ├── templates/
│   │   ├── index.ts                   # Exportación de todos los flujos
│   │   ├── welcomeFlow.ts             # Flujo de bienvenida
│   │   ├── menuFlow.ts                # Menú principal
│   │   └── flujos/
│   │       ├── agendarCita/           # 23 pasos del flujo de agendamiento
│   │       ├── reprogramarCita/       # Flujo de reprogramación
│   │       ├── cancelarCita/          # Flujo de cancelación
│   │       ├── conocerIps/            # Información de la IPS
│   │       ├── common/                # Componentes reutilizables
│   │       └── principal/             # Flujos principales
│   └── utils/
│       ├── metrics.ts                 # Sistema de métricas
│       ├── sanitize.ts                # Sanitización de inputs
│       ├── securityLimits.ts          # Límites de seguridad
│       ├── userRateLimiter.ts         # Control de frecuencia de uso
│       └── verificarHorario.ts        # Validaciones de horarios
├── assets/                            # Archivos multimedia
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

---

## 🔄 Flujos Conversacionales

### 1. Flujo de Bienvenida
**Archivo**: `welcomeFlow.ts`
- Mensaje de bienvenida personalizado
- Control de rate limiting (límite de intentos)
- Redirige a política de datos personales

### 2. Menú Principal
**Archivo**: `menuFlow.ts`
- Lista interactiva con 5 opciones principales:
  - Conocer la IPS
  - Agendar cita
  - Reprogramar cita
  - Cancelar cita
  - Chatear con agente

### 3. Flujo de Agendamiento (23 pasos)
**Archivos**: `step1AgendarCita.ts` a `step23AgendarCita.ts`

#### Subprocesos principales:
- **Clasificación inicial**: Primera vez vs Control
- **Datos del paciente**: Documento, nombres, contacto, email
- **Tipo de atención**: Presencial vs Virtual
- **Especialidad**: Psicología, Neuropsicología, Psiquiatría
- **Convenios**: Particular vs diversos convenios médicos
- **Selección de fecha y hora**: Con paginación inteligente
- **Confirmación**: Verificación antes de crear la cita

#### Lógica de negocio:
```typescript
// Generación de ID único para agenda
function generarAgendaIdAleatorio() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 8; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

// Determinación del tipo de atención basado en especialidad
let tipoAtencion = 'Individual';
if (atencionPsicologica === 'psicologia_pareja') {
    tipoAtencion = 'Pareja';
} else if (atencionPsicologica === 'psicologia_familia') {
    tipoAtencion = 'Familia';
}
```

### 4. Flujo de Reprogramación
**Características**:
- Consulta citas existentes del paciente
- Diferencia entre "Primera vez" y "Control"
- Para Control: Solo con el mismo profesional
- Para Primera vez: Cualquier profesional de la especialidad
- Actualización del estado a "Programada"

### 5. Flujo de Cancelación
**Proceso**:
- Verificación de citas existentes
- Confirmación de cancelación
- Opción de reprogramar en lugar de cancelar
- Actualización del estado a "Cancelo"

### 6. Flujo de Información IPS
**Secciones**:
- Servicios disponibles
- Convenios aceptados
- Tarifas y precios
- Formas de pago
- Ubicación y contacto
- Horarios de atención
- Canales de comunicación

---

## 🔌 Integración con APIs

### SheetBest API
Configuración en `apiService.ts`:

```typescript
export const URL_SHEETBEST = process.env.URL_SHEETBEST;
export const API_KEY_SHEETBEST = process.env.API_KEY_SHEETBEST;

// Funciones principales:
- consultarPacientePorDocumento()
- consultarCitasPorPacienteId()
- actualizarEstadoCita()
- crearCita()
- consultarCitasPacienteEspecialidad()
```

### Estructura de Datos (Google Sheets)

#### Tabla Pacientes
```
- PacientesID
- TipoDocumento
- NumeroDocumento
- PrimerNombre, SegundoNombre
- PrimerApellido, SegundoApellido
- NombreCompleto
- CodigoPais, NúmeroContacto
- Email
- Convenio
- FechaNacimiento
- FechaRegistro
```

#### Tabla Agenda
```
- AgendaId
- FechaCita, HoraCita, HoraFinal
- ProfesionalID
- Especialidad
- PacienteID
- MotivoConsulta
- TipoConsulta
- EstadoAgenda
- Convenios
- ValorPrimeraVez, ValorControl, ValorPaquete
- HoraCitaBot
- TipoAtención
```

---

## ⚙️ Características Técnicas

### 1. Sistema de Métricas (`metrics.ts`)
```typescript
interface Metrics {
  conversaciones_iniciadas: number;
  usuarios_unicos: string[];
  usuarios_recurrentes: string[];
  flujo_reagendar_finalizados: number;
  flujo_cancelar_finalizados: number;
  flujo_agente_finalizados: number;
  citas_reagendadas: number;
  citas_canceladas: number;
  errores: any[];
}
```

### 2. Rate Limiting (`userRateLimiter.ts`)
- Control de intentos por usuario
- Bloqueo temporal tras límite excedido
- Prevención de spam y abuso

### 3. Sanitización de Inputs (`sanitize.ts`)
- Limpieza de caracteres especiales
- Validación de longitud
- Prevención de inyecciones

### 4. Validación de Horarios (`verificarHorario.ts`)
- Verificación de días laborales
- Exclusión de festivos
- Validación de horarios de atención

### 5. Gestión de Estados
Cada flujo mantiene estado conversacional:
```typescript
await state.update({
  pacienteId,
  especialidadAgendarCita,
  tipoCitaAgendarCita,
  citaSeleccionadaHora
});
```

---

## 🚀 Configuración y Deploy

### Variables de Entorno (.env)
```env
# Meta WhatsApp Business API
jwtToken=your_jwt_token
numberId=your_number_id
verifyToken=your_verify_token

# SheetBest API
URL_SHEETBEST=https://api.sheetbest.com/sheets/your_sheet_id
API_KEY_SHEETBEST=your_api_key

# Server
PORT=3008
```

### Scripts Disponibles
```json
{
  "start": "node ./dist/app.js",
  "dev": "npm run lint && nodemon ./src/app.ts",
  "build": "npx rollup -c",
  "lint": "eslint . --no-ignore"
}
```

### Endpoints del Servidor
El bot expone varios endpoints REST:

```typescript
// Envío de mensajes programático
POST /v1/messages
{
  "number": "573001234567",
  "message": "Hola!",
  "urlMedia": "optional_media_url"
}

// Registro de nuevos usuarios
POST /v1/register
{
  "number": "573001234567",
  "name": "Usuario"
}

// Gestión de lista negra
POST /v1/blacklist
{
  "number": "573001234567",
  "intent": "add|remove"
}
```

---

## 📊 Métricas y Monitoreo

### Métricas Registradas
1. **Conversaciones iniciadas**: Contador total
2. **Usuarios únicos**: Lista de primeros contactos
3. **Usuarios recurrentes**: Lista de usuarios que regresan
4. **Flujos completados**: Por tipo (agendar, cancelar, etc.)
5. **Errores**: Log de excepciones con detalles

### Archivo de Métricas
Las métricas se almacenan en `metricsDB.json`:
```json
{
  "conversaciones_iniciadas": 150,
  "usuarios_unicos": ["573001234567", "573007654321"],
  "usuarios_recurrentes": ["573001234567"],
  "flujo_reagendar_finalizados": 25,
  "flujo_cancelar_finalizados": 12,
  "citas_reagendadas": 30,
  "citas_canceladas": 15,
  "errores": [...]
}
```

---

## 🔒 Seguridad

### 1. Rate Limiting
```typescript
// Control de frecuencia por usuario
const rate = checkAndRegisterUserAttempt(ctx.from);
if (!rate.allowed) {
    await flowDynamic(`Has superado el límite de intentos. 
        Intenta nuevamente después de ${minutes} minutos.`);
    return endFlow();
}
```

### 2. Sanitización de Datos
```typescript
// Limpieza de inputs del usuario
const numeroDocumento = sanitizeString(ctx.body, 20);
const nombrePaciente = sanitizeString(ctx.body, 50);
```

### 3. Validación de Estados
- Verificación de datos requeridos antes de proceder
- Manejo de errores y estados inconsistentes
- Timeouts para sesiones inactivas

### 4. Gestión de Errores
```typescript
try {
    // Lógica del flujo
} catch (e) {
    metricError(e, ctx.from);
    await flowDynamic('Ocurrió un error inesperado.');
    return endFlow();
}
```

---

## 🔧 Mantenimiento

### Testing
- **Jest** configurado para testing unitario
- Archivo de configuración: `jest.config.js`
- Tests ubicados en `__tests__/`

### Linting
- **ESLint** con reglas específicas para BuilderBot
- Plugin: `eslint-plugin-builderbot`

### Monitoreo de Errores
- Registro automático de errores en métricas
- Logs detallados con contexto del usuario
- Alertas para errores críticos

### Actualizaciones
1. **Agregar nuevos flujos**: Crear en `flujos/` y exportar en `index.ts`
2. **Modificar convenios**: Actualizar `conveniosConstants.ts`
3. **Ajustar métricas**: Extender interfaz en `metrics.ts`
4. **Nuevas validaciones**: Agregar en `utils/`

---

## 📝 Notas Importantes

### Limitaciones
- **Los botones y listas funcionan únicamente con Meta Provider**
- Requiere conexión constante a internet
- Dependiente de la disponibilidad de SheetBest API

### Recomendaciones
1. Monitorear regularmente las métricas de uso
2. Revisar logs de errores periódicamente
3. Actualizar dependencias de seguridad
4. Realizar backups de la configuración
5. Probar nuevos flujos en ambiente de desarrollo

### Escalabilidad
- El sistema está diseñado para manejar múltiples conversaciones concurrentes
- Las métricas se almacenan localmente (considerar BD externa para mayor escala)
- La arquitectura modular permite agregar nuevas funcionalidades fácilmente

---

## 🤝 Contribución

Para contribuir al proyecto:
1. Seguir la estructura de carpetas establecida
2. Usar TypeScript para nuevo código
3. Agregar tests para nuevas funcionalidades
4. Documentar cambios importantes
5. Mantener compatibilidad con Meta Provider

---

*Documentación generada para el proyecto Chatbot WhatsApp Business IPS*
*Última actualización: Julio 2025*
