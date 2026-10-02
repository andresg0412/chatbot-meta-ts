// Normalización y validación de los datos del formulario de paciente nuevo (agendar cita, steps 14-17).
// Ver proyecto-ips/docs/features/2026-10-01-revision-pruebas-reales.md, sección A3: desde sept-2025
// ningún paciente nuevo se registraba porque step17 comparaba el tipo de documento contra ids que no
// coincidían con los de la lista de step14 y enviaba 'Desconocido', que el backend rechaza
// (`tipo_documento` es un enum cerrado en `postCrearPacienteSchema`).
//
// Funciones puras, sin dependencias del framework, para poder probarlas con jest.

import { sanitizeString } from './sanitize';
import { soloDigitos } from './telefono';

/**
 * Códigos de tipo de documento que el bot envía a `POST /chatbot/crearpaciente`. El backend acepta un
 * enum cerrado (`TIPOS_DOCUMENTO_PACIENTE`: CC, CE, TI, RC, PA, PT, PE, DE, CN, NUIP, NIT, igual que
 * Globho); la lista del bot ofrece solo estos seis.
 */
export const TIPO_DOCUMENTO_CC = 'CC';
export const TIPO_DOCUMENTO_CE = 'CE';
export const TIPO_DOCUMENTO_TI = 'TI';
export const TIPO_DOCUMENTO_RC = 'RC';
export const TIPO_DOCUMENTO_PA = 'PA';
/** Permiso por Protección Temporal (reemplaza la antigua opción "Otro", decisión de German 2026-10-01). */
export const TIPO_DOCUMENTO_PT = 'PT';

export type TipoDocumentoCodigo =
    | typeof TIPO_DOCUMENTO_CC
    | typeof TIPO_DOCUMENTO_CE
    | typeof TIPO_DOCUMENTO_TI
    | typeof TIPO_DOCUMENTO_RC
    | typeof TIPO_DOCUMENTO_PA
    | typeof TIPO_DOCUMENTO_PT;

/**
 * Sufijo del id de la fila de la lista de step14 → código. Los ids reales son `agindarcita_tipo_<sufijo>`
 * (con la "errata" agindar, que es intencional en la práctica: `@builderbot` enruta por subcadena y un id
 * que contenga "agendar" abriría el flujo de agendar desde el inicio). Se acepta también la grafía
 * `agendarcita_tipo_<sufijo>` por robustez. El sufijo viejo `_ot` ("Otro") NO está: un `_ot` de una lista
 * enviada antes del cambio se trata como no reconocido (se vuelve a mostrar la lista).
 */
const SUFIJO_A_CODIGO: Record<string, TipoDocumentoCodigo> = {
    cd: TIPO_DOCUMENTO_CC,
    cex: TIPO_DOCUMENTO_CE,
    tid: TIPO_DOCUMENTO_TI,
    rcv: TIPO_DOCUMENTO_RC,
    ps: TIPO_DOCUMENTO_PA,
    pt: TIPO_DOCUMENTO_PT,
};

/** Máximo de caracteres del título de una fila de lista de WhatsApp (Meta). */
export const LONGITUD_MAX_TITULO_FILA = 24;

/**
 * Filas de la lista de tipo de documento (step14). NO cambiar "agindarcita" por "agendarcita":
 * @builderbot enruta por subcadena y un id con "agendar" lo captura el flujo de agendar (keyword
 * 'agendar'), que reinicia la conversación. Ver templates/__tests__/keywordRouting.test.ts.
 */
export const OPCIONES_TIPO_DOCUMENTO: ReadonlyArray<{ id: string; title: string }> = [
    { id: 'agindarcita_tipo_cd', title: 'Cédula de ciudadanía' },
    { id: 'agindarcita_tipo_cex', title: 'Cédula de extranjería' },
    { id: 'agindarcita_tipo_tid', title: 'Tarjeta de identidad' },
    { id: 'agindarcita_tipo_rcv', title: 'Registro civil' },
    { id: 'agindarcita_tipo_ps', title: 'Pasaporte' },
    { id: 'agindarcita_tipo_pt', title: 'Permiso Prot. Temporal' },
];

/** Ids que se muestran hoy en la lista. */
export const IDS_TIPO_DOCUMENTO: string[] = OPCIONES_TIPO_DOCUMENTO.map((opcion) => opcion.id);

/**
 * Ids que ya no se muestran pero pueden llegar de listas enviadas antes del cambio. Se siguen escuchando
 * (para que la respuesta llegue a step14 y no a otro flujo) pero `mapearTipoDocumento` los rechaza, así
 * que step14 vuelve a mostrar la lista. Nunca se envían al backend.
 */
export const IDS_TIPO_DOCUMENTO_RETIRADOS: string[] = ['agindarcita_tipo_ot'];

/** Keywords de step14AgendarCita2: ids vigentes + retirados. */
export const KEYWORDS_TIPO_DOCUMENTO: [string, ...string[]] = [
    IDS_TIPO_DOCUMENTO[0],
    ...IDS_TIPO_DOCUMENTO.slice(1),
    ...IDS_TIPO_DOCUMENTO_RETIRADOS,
];

/** Títulos de la lista (y códigos/escrituras comunes) normalizados sin tildes y en minúscula → código. */
const TEXTO_A_CODIGO: Record<string, TipoDocumentoCodigo> = {
    'cedula de ciudadania': TIPO_DOCUMENTO_CC,
    'cedula': TIPO_DOCUMENTO_CC,
    'cc': TIPO_DOCUMENTO_CC,
    'cedula de extranjeria': TIPO_DOCUMENTO_CE,
    'ce': TIPO_DOCUMENTO_CE,
    'tarjeta de identidad': TIPO_DOCUMENTO_TI,
    'ti': TIPO_DOCUMENTO_TI,
    'registro civil': TIPO_DOCUMENTO_RC,
    'rc': TIPO_DOCUMENTO_RC,
    'pasaporte': TIPO_DOCUMENTO_PA,
    'pa': TIPO_DOCUMENTO_PA,
    'permiso prot. temporal': TIPO_DOCUMENTO_PT,
    'permiso por proteccion temporal': TIPO_DOCUMENTO_PT,
    'ppt': TIPO_DOCUMENTO_PT,
    'pt': TIPO_DOCUMENTO_PT,
};

const REGEX_ID_LISTA = /^ag[ie]ndarcita_tipo_([a-z]+)$/;

function normalizarTexto(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    return raw
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Convierte lo que quedó en `state.tipoDoc` (normalmente el id de la fila de la lista; también acepta
 * el título visible o el código) al código de tipo de documento del backend. `null` si no se reconoce:
 * el llamador NO debe llamar al backend en ese caso.
 */
export function mapearTipoDocumento(raw: unknown): TipoDocumentoCodigo | null {
    const texto = normalizarTexto(raw);
    if (!texto) return null;
    const matchId = REGEX_ID_LISTA.exec(texto);
    if (matchId) {
        return SUFIJO_A_CODIGO[matchId[1]] ?? null;
    }
    return TEXTO_A_CODIGO[texto] ?? null;
}

/** Respuestas que significan "no tengo segundo nombre/apellido". */
const RESPUESTAS_OMITIR = new Set(['no', '-', 'ninguno', 'ninguna', 'no tengo', 'n/a', 'no aplica']);

/** true si el paciente indicó que no tiene ese dato opcional (segundo nombre / segundo apellido). */
export function esRespuestaOmitir(raw: unknown): boolean {
    return RESPUESTAS_OMITIR.has(normalizarTexto(raw));
}

const LONGITUD_MAX_NOMBRE = 30; // maxLength de primer/segundo nombre y apellidos en postCrearPacienteSchema
const LONGITUD_MIN_NOMBRE = 2;
// Letras (con tildes, ü y ñ), espacios y guion (apellidos compuestos). Sin dígitos.
const REGEX_NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:[ -][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*$/;

/**
 * Valida y normaliza (mayúsculas, espacios colapsados) un nombre o apellido.
 * `null` si no es válido (vacío, con dígitos/símbolos, menos de 2 o más de 30 caracteres).
 */
export function normalizarNombre(raw: unknown): string | null {
    const limpio = sanitizeString(raw, 200).replace(/\s+/g, ' ').trim();
    if (limpio.length < LONGITUD_MIN_NOMBRE || limpio.length > LONGITUD_MAX_NOMBRE) return null;
    if (!REGEX_NOMBRE.test(limpio)) return null;
    return limpio.toUpperCase();
}

/**
 * Nombre/apellido opcional: si el paciente responde "no", "-", "ninguno"… devuelve `''` (el backend
 * acepta cadena vacía y la guarda como NULL; `null` lo rechazaría porque el schema es `type: 'string'`).
 * `null` si no es una omisión ni un nombre válido.
 */
export function normalizarNombreOpcional(raw: unknown): string | null {
    if (esRespuestaOmitir(raw)) return '';
    return normalizarNombre(raw);
}

/**
 * Fecha de nacimiento DD/MM/AAAA (acepta también D/M/AAAA y separadores - o .) → `YYYY-MM-DD`.
 * `null` si la fecha no existe en el calendario (31/02), es futura o es anterior a 1900.
 * `hoy` es inyectable para pruebas.
 */
export function normalizarFechaNacimiento(raw: unknown, hoy: Date = new Date()): string | null {
    if (typeof raw !== 'string') return null;
    const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw.trim());
    if (!match) return null;
    const dia = Number(match[1]);
    const mes = Number(match[2]);
    const anio = Number(match[3]);
    if (anio < 1900 || mes < 1 || mes > 12 || dia < 1) return null;
    const fecha = new Date(Date.UTC(anio, mes - 1, dia));
    if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) {
        return null;
    }
    const hoyUtc = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    if (fecha.getTime() > hoyUtc) return null;
    return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

const LONGITUD_MAX_EMAIL = 100; // maxLength de email en postCrearPacienteSchema
// Misma forma que el formato `email` de ajv-formats (modo fast) que usa Fastify para validar el body:
// un correo que pase aquí no debe ser rechazado por el backend.
const REGEX_EMAIL =
    /^[a-z0-9!#$%&*+/=?^_{|}~-]+(?:\.[a-z0-9!#$%&*+/=?^_{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

/** Correo en minúscula y sin espacios; `null` si no es válido o supera 100 caracteres (no se trunca). */
export function normalizarEmail(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const correo = raw.trim().toLowerCase();
    if (!correo || correo.length > LONGITUD_MAX_EMAIL) return null;
    return REGEX_EMAIL.test(correo) ? correo : null;
}

const LONGITUD_MAX_TELEFONO = 15; // maxLength de numero_contacto en postCrearPacienteSchema (E.164)

/**
 * Teléfono de contacto para registrar al paciente. Mantiene la convención que ya existe en la BD
 * (celular colombiano en 10 dígitos, sin `57`). A diferencia del antiguo `numeroContacto.slice(2)`:
 * - solo quita el `57` si el número es colombiano (12 dígitos que empiezan por 57);
 * - un número extranjero se envía completo, con su indicativo (no se le cortan dos dígitos);
 * - devuelve `null` si no hay número o si supera 15 dígitos (E.164; el campo es opcional en el
 *   backend: el llamador lo omite en vez de provocar un 400).
 */
export function telefonoParaRegistro(raw: unknown): string | null {
    const digitos = soloDigitos(raw);
    if (digitos.length < 7) return null;
    if (digitos.length === 12 && digitos.startsWith('57')) return digitos.slice(2);
    if (digitos.length > LONGITUD_MAX_TELEFONO) return null;
    return digitos;
}

/** Número de documento sin espacios, puntos ni guiones (p. ej. "1.234.567" → "1234567"). */
export function limpiarNumeroDocumento(raw: unknown): string {
    return sanitizeString(raw, 40).replace(/[\s.\-]/g, '');
}

/** Body de `POST /chatbot/crearpaciente` (ver `postCrearPacienteSchema` en proyecto-ips/backend). */
export interface PayloadCrearPaciente {
    tipo_documento: TipoDocumentoCodigo;
    numero_documento: string;
    primer_nombre: string;
    segundo_nombre: string;
    primer_apellido: string;
    segundo_apellido: string;
    numero_contacto?: string;
    email: string;
    convenio: string;
    administradora: string;
    fecha_nacimiento: string;
    regimen: string;
}

/** Lo que el formulario dejó en el state de builderbot (más el número de WhatsApp como respaldo). */
export interface EstadoFormularioPaciente {
    tipoDoc?: unknown;
    tipoDocumentoCodigo?: unknown;
    numeroDocumentoPaciente?: unknown;
    nombrePaciente1?: unknown;
    nombrePaciente2?: unknown;
    apellidoPaciente1?: unknown;
    apellidoPaciente2?: unknown;
    celular?: unknown;
    correoElectronico?: unknown;
    fechaNacimiento?: unknown;
    idConvenio?: unknown;
    nombreServicioConvenio?: unknown;
}

/** `ok` true ⇒ `payload` lleno y `camposInvalidos` vacío; `ok` false ⇒ `payload` null. */
export interface ResultadoPayloadPaciente {
    ok: boolean;
    payload: PayloadCrearPaciente | null;
    camposInvalidos: string[];
}

const CONVENIO_PARTICULAR_ID = '1787';
const CONVENIO_PARTICULAR_NOMBRE = 'PARTICULAR';

function textoNoVacio(valor: unknown): string | null {
    return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

/**
 * Arma el body de crearpaciente a partir del state. Revalida todo (el state puede venir de una sesión
 * anterior al despliegue o haberse perdido); si algo obligatorio falta o no es válido NO se llama al
 * backend y se devuelve la lista de campos con problema.
 */
export function construirPayloadPacienteNuevo(
    estado: EstadoFormularioPaciente,
    telefonoWhatsApp: unknown
): ResultadoPayloadPaciente {
    const camposInvalidos: string[] = [];

    const tipoDocumento =
        mapearTipoDocumento(estado.tipoDocumentoCodigo) ?? mapearTipoDocumento(estado.tipoDoc);
    if (!tipoDocumento) camposInvalidos.push('tipo_documento');

    const numeroDocumento = limpiarNumeroDocumento(estado.numeroDocumentoPaciente);
    if (!/^[a-zA-Z0-9]{5,20}$/.test(numeroDocumento)) camposInvalidos.push('numero_documento');

    const primerNombre = normalizarNombre(estado.nombrePaciente1);
    if (!primerNombre) camposInvalidos.push('primer_nombre');
    const primerApellido = normalizarNombre(estado.apellidoPaciente1);
    if (!primerApellido) camposInvalidos.push('primer_apellido');

    // Opcionales: ausentes o vacíos se envían como '' (el backend los guarda como NULL).
    const segundoNombre = textoNoVacio(estado.nombrePaciente2) ? normalizarNombreOpcional(estado.nombrePaciente2) : '';
    if (segundoNombre === null) camposInvalidos.push('segundo_nombre');
    const segundoApellido = textoNoVacio(estado.apellidoPaciente2) ? normalizarNombreOpcional(estado.apellidoPaciente2) : '';
    if (segundoApellido === null) camposInvalidos.push('segundo_apellido');

    const email = normalizarEmail(estado.correoElectronico);
    if (!email) camposInvalidos.push('email');

    const fechaNacimiento =
        typeof estado.fechaNacimiento === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(estado.fechaNacimiento)
            ? estado.fechaNacimiento
            : null;
    if (!fechaNacimiento) camposInvalidos.push('fecha_nacimiento');

    if (camposInvalidos.length > 0) {
        return { ok: false, payload: null, camposInvalidos };
    }

    const numeroContacto = telefonoParaRegistro(textoNoVacio(estado.celular) ?? telefonoWhatsApp);
    const convenio = estado.idConvenio !== undefined && estado.idConvenio !== null && String(estado.idConvenio).trim()
        ? String(estado.idConvenio).trim()
        : CONVENIO_PARTICULAR_ID;
    const administradora = textoNoVacio(estado.nombreServicioConvenio) ?? CONVENIO_PARTICULAR_NOMBRE;

    return {
        ok: true,
        payload: {
            tipo_documento: tipoDocumento as TipoDocumentoCodigo,
            numero_documento: numeroDocumento,
            primer_nombre: primerNombre as string,
            segundo_nombre: segundoNombre as string,
            primer_apellido: primerApellido as string,
            segundo_apellido: segundoApellido as string,
            ...(numeroContacto ? { numero_contacto: numeroContacto } : {}),
            email: email as string,
            convenio,
            administradora,
            fecha_nacimiento: fechaNacimiento as string,
            regimen: 'Particular',
        },
        camposInvalidos: [],
    };
}
