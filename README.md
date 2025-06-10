# Chatbot

¡Este es un chatbot para WhatsApp con flujos de agendamiento, reprogramación y cancelación de citas médicas e integración con SheetBest API

## 🚀 Características principales
- **Agendamiento, reprogramación y cancelación de citas médicas** totalmente automatizado.
- **Integración con SheetBest API** para persistencia y consulta de pacientes, agenda y profesionales.
- **Flujo de reprogramación robusto**: muestra solo citas válidas, maneja PUT/POST según corresponda, y filtra por profesional o especialidad según el motivo.
- **Flujo de cancelación seguro**: actualiza el estado de la cita y confirma al usuario.
- **Atención humana**: permite transferir a un agente humano vía enlace directo de WhatsApp.
- **Defensivo ante errores de datos**: evita caídas por datos faltantes o malformados.
- **Interfaz conversacional moderna**: uso de botones, listas y mensajes claros.
- **Fácilmente extensible y modular**: cada flujo y servicio está desacoplado y es fácil de mantener.

## 🛠️ Tecnologías utilizadas
- Node.js + TypeScript
- [@builderbot/bot](https://www.npmjs.com/package/@builderbot/bot) (framework conversacional)
- SheetBest API (persistencia en Google Sheets)
- Axios (HTTP requests)

## 📋 Flujos principales
- **Agendar cita**: Solicita datos del paciente, muestra fechas y horas disponibles, agenda y confirma.
- **Reprogramar cita**: Permite seleccionar una cita existente y cambiarla a otra fecha/hora, con lógica especial para "Primera vez" y "Control".
- **Cancelar cita**: Permite cancelar una cita y actualiza el estado en la agenda.
- **Atención humana**: Si el usuario lo solicita, lo transfiere a un agente humano vía WhatsApp.

## ⚠️ Aclaración
Los botones y las listas funcionan únicamente con **Meta Provider**.
