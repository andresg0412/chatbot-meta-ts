// Textos, lista de Meta y formato de cita de la respuesta a los recordatorios con botones ("Confirmo
// asistencia" / "Necesito cancelar" / "No podré asistir"), TB-05 y TBOT-03 del informe QA
// (proyecto-ips/docs/features/2026-10-02-informe-qa-lista-espera.md). Funciones puras: no envían nada
// ni tocan el state.
//
// Privacidad (regla transversal): ningún texto menciona la especialidad ni el tipo de servicio. De la cita
// solo se muestran fecha, hora y nombre del profesional.

import type { CitaRecordatorio } from '../services/apiService';
import { extraerFechaISO, formatearFechaLarga, formatearHoraHHMM } from './fechaHora';
import { numeroAsesorHumano } from './mensajesMovimientoCita';
import { TEXTO_BOTON_SI_CANCELAR, TEXTO_BOTON_NO_MANTENER } from '../templates/flujos/keywordsBotones';

export type AccionRecordatorio = 'confirma' | 'no_asistira';

// ---------------------------------------------------------------------------
// Lista de Meta para elegir la cita (2 o más citas)
// ---------------------------------------------------------------------------

/** Límites de Meta para mensajes interactivos de lista y de botones. */
export const LIMITES_META = {
    filasLista: 10,
    tituloFila: 24,
    descripcionFila: 72,
    tituloSeccion: 24,
    textoBotonLista: 20,
    tituloBoton: 20,
} as const;

/** Una fila es "Ninguna de estas": caben 9 citas. */
export const MAX_CITAS_EN_LISTA = LIMITES_META.filasLista - 1;

/**
 * Prefijo de los ids de fila. Sin dígitos (las keywords '3', '4', '5', '6' coinciden por subcadena,
 * TBOT-19) ni palabras que sean keyword de otro flujo. Lo verifica templates/__tests__/keywordRouting.test.ts.
 */
export const PREFIJO_ID_FILA_CITA = 'rcdcita_';
const LETRAS_FILA = 'abcdefghi';
export const ID_FILA_NINGUNA = `${PREFIJO_ID_FILA_CITA}ninguna`;

export const TEXTO_LISTA_CITAS = 'Tienes más de una cita programada. ¿A cuál te refieres?';
const TEXTO_FILA_NINGUNA = 'Ninguna de estas';
const DESCRIPCION_FILA_NINGUNA = 'No hacer ningún cambio';

export function idFilaCita(indice: number): string {
    return `${PREFIJO_ID_FILA_CITA}${LETRAS_FILA[indice]}`;
}

/** Índice de la cita de una fila ('rcdcita_b' → 1), o null si no es una fila de cita. */
export function indiceDesdeIdFila(id: unknown): number | null {
    if (typeof id !== 'string') return null;
    const texto = id.trim();
    if (!texto.startsWith(PREFIJO_ID_FILA_CITA) || texto.length !== PREFIJO_ID_FILA_CITA.length + 1) return null;
    const indice = LETRAS_FILA.indexOf(texto.slice(-1));
    return indice >= 0 ? indice : null;
}

export function esFilaNinguna(id: unknown): boolean {
    return typeof id === 'string' && id.trim() === ID_FILA_NINGUNA;
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function recortar(texto: string, maximo: number): string {
    return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1).trimEnd()}…`;
}

/** Nombre del profesional sin caracteres de control ni espacios repetidos. */
export function limpiarProfesional(profesional: unknown): string {
    if (typeof profesional !== 'string') return '';
    const sinControl = Array.from(profesional)
        .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c))
        .join('');
    return sinControl
        .replace(/[<>"'`\\*_~]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** 'vie 10 oct · 07:00' (≤ 24). Sin depender de la zona horaria del proceso. */
export function tituloFilaCita(cita: Pick<CitaRecordatorio, 'fecha_cita' | 'hora_cita'>): string {
    const hora = formatearHoraHHMM(cita?.hora_cita);
    const iso = extraerFechaISO(cita?.fecha_cita);
    let fecha = String(cita?.fecha_cita ?? '').trim();
    if (iso) {
        const [y, m, d] = iso.split('-').map(Number);
        const dia = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
        fecha = `${DIAS[dia]} ${d} ${MESES[m - 1]}`;
    }
    const titulo = [fecha, hora].filter(Boolean).join(' · ');
    return recortar(titulo || 'Cita', LIMITES_META.tituloFila);
}

/** El profesional, recortado (≤ 72). */
export function descripcionFilaCita(cita: Pick<CitaRecordatorio, 'profesional'>): string {
    const profesional = limpiarProfesional(cita?.profesional);
    return recortar(profesional ? `Con ${profesional}` : 'Con el profesional que te atiende', LIMITES_META.descripcionFila);
}

/** Lista de Meta (`provider.sendList`) con hasta 9 citas más "Ninguna de estas". */
export function construirListaCitasRecordatorio(citas: CitaRecordatorio[]) {
    const visibles = citas.slice(0, MAX_CITAS_EN_LISTA);
    const texto = citas.length > MAX_CITAS_EN_LISTA
        ? `${TEXTO_LISTA_CITAS}\n\nTe mostramos las ${MAX_CITAS_EN_LISTA} más próximas.`
        : TEXTO_LISTA_CITAS;
    return {
        header: { type: 'text', text: 'Tus citas' },
        body: { text: texto },
        footer: { text: '' },
        action: {
            button: 'Ver citas',
            sections: [
                {
                    title: 'Citas programadas',
                    rows: [
                        ...visibles.map((cita, indice) => ({
                            id: idFilaCita(indice),
                            title: tituloFilaCita(cita),
                            description: descripcionFilaCita(cita),
                        })),
                        { id: ID_FILA_NINGUNA, title: TEXTO_FILA_NINGUNA, description: DESCRIPCION_FILA_NINGUNA },
                    ],
                },
            ],
        },
    };
}

// ---------------------------------------------------------------------------
// Cita en los mensajes
// ---------------------------------------------------------------------------

type DatosCita = { fecha_cita?: string | null; hora_cita?: string | null; profesional?: string | null };

/** ' del 10 de octubre de 2026 a las 07:00 con Ana Pérez' (omite lo que falte). */
export function fraseCita(cita: DatosCita | null | undefined): string {
    const fecha = formatearFechaLarga(cita?.fecha_cita ?? '');
    const hora = formatearHoraHHMM(cita?.hora_cita ?? '');
    const profesional = limpiarProfesional(cita?.profesional);
    return `${fecha ? ` del ${fecha}` : ''}${hora ? ` a las ${hora}` : ''}${profesional ? ` con ${profesional}` : ''}`;
}

/** Los datos que devuelve `responder` tienen prioridad; si faltan, los de la cita elegida. */
export function citaParaMensaje(elegida: DatosCita | null | undefined, respuesta: DatosCita | null | undefined): DatosCita {
    return {
        fecha_cita: respuesta?.fecha_cita || elegida?.fecha_cita || '',
        hora_cita: respuesta?.hora_cita || elegida?.hora_cita || '',
        profesional: respuesta?.profesional || elegida?.profesional || '',
    };
}

/** Mensaje con la cita a cancelar; va con los botones `BOTONES_CONFIRMAR_CANCELACION`. */
export function mensajeConfirmarCancelacion(cita: DatosCita): string {
    const fecha = formatearFechaLarga(cita?.fecha_cita ?? '');
    const hora = formatearHoraHHMM(cita?.hora_cita ?? '');
    const profesional = limpiarProfesional(cita?.profesional);
    const lineas = [
        'Vas a cancelar esta cita:',
        fecha ? `📅 ${fecha}` : '',
        hora ? `🕐 ${hora}` : '',
        profesional ? `👤 ${profesional}` : '',
    ].filter(Boolean);
    return `${lineas.join('\n')}\n\n¿Confirmas que deseas cancelarla?`;
}

export const BOTONES_CONFIRMAR_CANCELACION = [{ body: TEXTO_BOTON_SI_CANCELAR }, { body: TEXTO_BOTON_NO_MANTENER }];

// ---------------------------------------------------------------------------
// Textos fijos
// ---------------------------------------------------------------------------

/** 0 citas o paciente inexistente en "Necesito cancelar" / "No podré asistir" (texto de siempre). */
export const MENSAJE_SIN_CITA_ACTIVA =
    'No encontramos una cita activa asociada a ese número de documento. Si crees que es un error, contáctanos.';
/** Falla la consulta de citas (solo lectura: no se hizo ningún cambio, se puede reintentar). */
export const MENSAJE_ERROR_CONSULTA_CITAS =
    '❌ No pudimos consultar tus citas en este momento. Por favor intenta nuevamente en unos minutos.';
export const MENSAJE_SIN_IDENTIFICAR = 'No pudimos identificar tu respuesta. Por favor intenta nuevamente.';
export const MENSAJE_DOCUMENTO_NO_VALIDO = 'El número de documento ingresado no es válido. Intenta nuevamente.';
export const MENSAJE_SOLICITUD_EN_PROCESO = '⏳ Estamos procesando tu solicitud anterior. En un momento te respondemos.';
export const MENSAJE_CITA_SIGUE_IGUAL = 'Tu cita sigue igual 😊';
export const MENSAJE_NINGUNA_CITA = 'Entendido, no hicimos ningún cambio en tus citas. Si necesitas ayuda, escribe *hola*. 😊';
export const MENSAJE_SELECCION_REINTENTO = 'Por favor selecciona una de las citas de la lista.';
export const MENSAJE_SELECCION_FINAL =
    'No recibimos una selección válida, así que no hicimos ningún cambio en tus citas. Si necesitas ayuda, escribe *hola*.';
export const MENSAJE_CONFIRMACION_REINTENTO =
    `Por favor responde con uno de los botones: *${TEXTO_BOTON_SI_CANCELAR}* o *${TEXTO_BOTON_NO_MANTENER}*.`;
export const MENSAJE_CONFIRMACION_FINAL =
    'No recibimos una respuesta válida, así que no hicimos ningún cambio en tu cita. Si necesitas ayuda, escribe *hola*.';
/** 409 RESPUESTA_EN_PROCESO: otra respuesta a esta cita sigue en curso; no se invita a repetir. */
export const MENSAJE_RESPUESTA_EN_PROCESO =
    '⏳ Ya estamos procesando una respuesta sobre esta cita. En unos segundos te confirmamos el resultado; no necesitas enviarla de nuevo.';
export const MENSAJE_CITA_NO_DISPONIBLE = 'Esa cita ya no está disponible para cambios. Si necesitas ayuda, escribe *hola*.';

function verbo(accion: AccionRecordatorio): string {
    return accion === 'confirma' ? 'confirmar' : 'cancelar';
}

/** 502 GLOBHO_ERROR (patrón de mensajesMovimientoCita.ts): el sistema de agenda no aplicó el cambio. */
export function mensajeErrorGlobhoRecordatorio(accion: AccionRecordatorio): string {
    return (
        `No pudimos ${verbo(accion)} tu cita en este momento por una falla en nuestro sistema de agenda. ` +
        'Intenta de nuevo en unos minutos o, si prefieres, comunícate con un asesor para que te ayude:\n' +
        `👉 https://wa.me/${numeroAsesorHumano()}`
    );
}

/**
 * 500, timeout o error de red en `responder`: la acción pudo haberse hecho, así que no se invita a
 * repetirla; se deriva a un asesor para verificarla.
 */
export function mensajeErrorTecnicoRecordatorio(accion: AccionRecordatorio): string {
    const estado = accion === 'confirma' ? 'confirmada' : 'cancelada';
    return (
        `❌ Tuvimos un problema técnico y no pudimos comprobar si tu cita quedó ${estado}. ` +
        'Para no repetir la solicitud, comunícate con un asesor y te ayudamos a verificarla:\n' +
        `👉 https://wa.me/${numeroAsesorHumano()}`
    );
}

/** 200 de `responder` con 'confirma'. */
export function mensajeCitaConfirmada(cita: DatosCita, estadoResultado?: string): string {
    const frase = fraseCita(cita);
    return estadoResultado === 'ya_confirmada'
        ? `😊 ¡Gracias por avisarnos! Tu cita${frase} ya estaba confirmada. No necesitas hacer nada más. ¡Te esperamos!`
        : `✅ ¡Listo! Tu cita${frase} quedó confirmada. Te esperamos. 😊`;
}

/** 200 de `responder` con 'no_asistira'. */
export function mensajeCitaCancelada(cita: DatosCita, estadoResultado?: string): string {
    const frase = fraseCita(cita);
    const ofrecer = 'Si quieres agendar un nuevo espacio, escribe *hola* y elige *Agendar cita*. 😊';
    return estadoResultado === 'ya_cancelada'
        ? `Tu cita${frase} ya estaba cancelada. ${ofrecer}`
        : `Listo, cancelamos tu cita${frase}. Gracias por avisarnos con tiempo. ${ofrecer}`;
}
