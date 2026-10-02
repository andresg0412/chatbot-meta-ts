// Registro de paciente nuevo (proyecto-ips/docs/features/2026-10-01-revision-pruebas-reales.md, A3).
import {
    mapearTipoDocumento,
    esRespuestaOmitir,
    normalizarNombre,
    normalizarNombreOpcional,
    normalizarFechaNacimiento,
    normalizarEmail,
    telefonoParaRegistro,
    limpiarNumeroDocumento,
    construirPayloadPacienteNuevo,
    IDS_TIPO_DOCUMENTO,
    IDS_TIPO_DOCUMENTO_RETIRADOS,
    KEYWORDS_TIPO_DOCUMENTO,
    OPCIONES_TIPO_DOCUMENTO,
    LONGITUD_MAX_TITULO_FILA,
} from '../datosPacienteNuevo';

describe('mapearTipoDocumento', () => {
    it.each([
        // ids reales de la lista de step14 (con la grafía "agindar")
        ['agindarcita_tipo_cd', 'CC'],
        ['agindarcita_tipo_cex', 'CE'],
        ['agindarcita_tipo_tid', 'TI'],
        ['agindarcita_tipo_rcv', 'RC'],
        ['agindarcita_tipo_ps', 'PA'],
        ['agindarcita_tipo_pt', 'PT'],
        // grafía "agendar" (la que comparaba el switch viejo)
        ['agendarcita_tipo_cd', 'CC'],
        ['agendarcita_tipo_cex', 'CE'],
        ['agendarcita_tipo_tid', 'TI'],
        ['agendarcita_tipo_rcv', 'RC'],
        ['agendarcita_tipo_ps', 'PA'],
        ['agendarcita_tipo_pt', 'PT'],
        // mayúsculas / espacios
        ['  AGINDARCITA_TIPO_CD ', 'CC'],
        // títulos visibles de la lista y códigos
        ['Cédula de ciudadanía', 'CC'],
        ['cedula de extranjeria', 'CE'],
        ['Tarjeta de identidad', 'TI'],
        ['Registro civil', 'RC'],
        ['Pasaporte', 'PA'],
        ['Permiso Prot. Temporal', 'PT'],
        ['Permiso por Protección Temporal', 'PT'],
        ['PT', 'PT'],
        ['ppt', 'PT'],
        ['cc', 'CC'],
        ['PA', 'PA'],
    ])('%p → %p', (entrada, esperado) => {
        expect(mapearTipoDocumento(entrada)).toBe(esperado);
    });

    it.each([
        [undefined],
        [null],
        [''],
        ['Desconocido'],
        ['agindarcita_tipo_xx'],
        ['agindarcita_tipo_'],
        ['xagindarcita_tipo_cd'],
        ['agindarcita_tipo_cd_extra'],
        // "Otro" se retiró (OT no existe en Globho, el backend responde 400): un _ot de una lista vieja
        // no se reconoce y nunca se envía al backend.
        ['agindarcita_tipo_ot'],
        ['agendarcita_tipo_ot'],
        ['Otro'],
        ['OT'],
        [123],
    ])('no reconocido: %p → null', (entrada) => {
        expect(mapearTipoDocumento(entrada)).toBeNull();
    });

    it('todas las filas de la lista se reconocen, con códigos del enum del backend y títulos de 24 caracteres o menos', () => {
        const ENUM_BACKEND = ['CC', 'CE', 'TI', 'RC', 'PA', 'PT', 'PE', 'DE', 'CN', 'NUIP', 'NIT'];
        expect(OPCIONES_TIPO_DOCUMENTO).toHaveLength(6);
        expect(IDS_TIPO_DOCUMENTO).toEqual(OPCIONES_TIPO_DOCUMENTO.map((o) => o.id));
        const codigos = OPCIONES_TIPO_DOCUMENTO.map((o) => mapearTipoDocumento(o.id));
        expect(codigos).toEqual(['CC', 'CE', 'TI', 'RC', 'PA', 'PT']);
        for (const opcion of OPCIONES_TIPO_DOCUMENTO) {
            expect(ENUM_BACKEND).toContain(mapearTipoDocumento(opcion.id));
            expect(mapearTipoDocumento(opcion.title)).toBe(mapearTipoDocumento(opcion.id));
            expect(opcion.title.length).toBeLessThanOrEqual(LONGITUD_MAX_TITULO_FILA);
        }
    });

    it('los ids retirados se siguen escuchando pero no se reconocen', () => {
        expect(IDS_TIPO_DOCUMENTO_RETIRADOS).toEqual(['agindarcita_tipo_ot']);
        expect(KEYWORDS_TIPO_DOCUMENTO).toEqual([...IDS_TIPO_DOCUMENTO, ...IDS_TIPO_DOCUMENTO_RETIRADOS]);
        for (const id of IDS_TIPO_DOCUMENTO_RETIRADOS) {
            expect(IDS_TIPO_DOCUMENTO).not.toContain(id);
            expect(mapearTipoDocumento(id)).toBeNull();
        }
    });
});

describe('nombres', () => {
    it.each([
        ['ana', 'ANA'],
        ['Li', 'LI'],
        ['  maría   josé ', 'MARÍA JOSÉ'],
        ['Núñez', 'NÚÑEZ'],
        ['García-Pérez', 'GARCÍA-PÉREZ'],
        ['Müller', 'MÜLLER'],
    ])('válido %p → %p', (entrada, esperado) => {
        expect(normalizarNombre(entrada)).toBe(esperado);
    });

    it.each([[''], ['a'], ['123'], ['Ana2'], ['@@'], ['a'.repeat(31)], [undefined]])('inválido %p', (entrada) => {
        expect(normalizarNombre(entrada)).toBeNull();
    });

    it.each([['no'], ['No'], ['NO'], ['-'], ['ninguno'], ['Ninguna'], ['no tengo'], ['N/A'], ['no aplica']])(
        'omisión %p → ""',
        (entrada) => {
            expect(esRespuestaOmitir(entrada)).toBe(true);
            expect(normalizarNombreOpcional(entrada)).toBe('');
        }
    );

    it('opcional: nombre real se normaliza; basura → null', () => {
        expect(normalizarNombreOpcional('Ana')).toBe('ANA');
        expect(normalizarNombreOpcional('Noemí')).toBe('NOEMÍ');
        expect(normalizarNombreOpcional('12')).toBeNull();
    });
});

describe('normalizarFechaNacimiento', () => {
    const hoy = new Date(2026, 9, 1); // 1-oct-2026
    it.each([
        ['24/12/1990', '1990-12-24'],
        ['1/5/1990', '1990-05-01'],
        ['01-05-1990', '1990-05-01'],
        ['29/02/2000', '2000-02-29'],
        ['01/10/2026', '2026-10-01'],
    ])('%p → %p', (entrada, esperado) => {
        expect(normalizarFechaNacimiento(entrada, hoy)).toBe(esperado);
    });

    it.each([['31/02/2000'], ['29/02/2001'], ['02/10/2026'], ['01/01/1899'], ['1990-12-24'], ['24/13/1990'], [''], ['hoy']])(
        'inválida %p',
        (entrada) => {
            expect(normalizarFechaNacimiento(entrada, hoy)).toBeNull();
        }
    );
});

describe('normalizarEmail', () => {
    it('acepta y normaliza', () => {
        expect(normalizarEmail('  Nombre.Apellido@Correo.COM ')).toBe('nombre.apellido@correo.com');
        expect(normalizarEmail('a+b@sub.dominio.co')).toBe('a+b@sub.dominio.co');
    });
    it.each([['sin-arroba'], ['a@b'], ['josé@correo.com'], ['a b@c.com'], ['a@b.com,'], [`${'a'.repeat(95)}@b.com`]])(
        'rechaza %p',
        (entrada) => {
            expect(normalizarEmail(entrada)).toBeNull();
        }
    );
});

describe('telefonoParaRegistro', () => {
    it.each([
        ['573185214214', '3185214214'],
        ['3185214214', '3185214214'],
        ['+57 318 521 4214', '3185214214'],
        ['15551234567', '15551234567'], // extranjero: no se le cortan dígitos
        ['5491123456789', '5491123456789'], // extranjero de 13 dígitos: completo (maxLength 15)
        ['123456789012345', '123456789012345'],
        ['1234567890123456', null], // 16 dígitos: no cabe en E.164
        [undefined, null],
        ['', null],
    ])('%p → %p', (entrada, esperado) => {
        expect(telefonoParaRegistro(entrada)).toBe(esperado);
    });
});

describe('limpiarNumeroDocumento', () => {
    it('quita puntos, espacios y guiones', () => {
        expect(limpiarNumeroDocumento(' 1.234.567-8 ')).toBe('12345678');
        expect(limpiarNumeroDocumento('AB 123456')).toBe('AB123456');
    });
});

describe('construirPayloadPacienteNuevo', () => {
    const estadoBase = {
        tipoDoc: 'agindarcita_tipo_cd',
        numeroDocumentoPaciente: '1234567890',
        nombrePaciente1: 'ANA',
        nombrePaciente2: '',
        apellidoPaciente1: 'GIL',
        apellidoPaciente2: '',
        celular: '573001234567',
        correoElectronico: 'ana@correo.com',
        fechaNacimiento: '1990-12-24',
        idConvenio: '014',
        nombreServicioConvenio: 'SURA',
    };

    it('arma el body con códigos cortos y segundos nombres vacíos', () => {
        const r = construirPayloadPacienteNuevo(estadoBase, '573001234567');
        expect(r).toEqual({
            ok: true,
            payload: {
                tipo_documento: 'CC',
                numero_documento: '1234567890',
                primer_nombre: 'ANA',
                segundo_nombre: '',
                primer_apellido: 'GIL',
                segundo_apellido: '',
                numero_contacto: '3001234567',
                email: 'ana@correo.com',
                convenio: '014',
                administradora: 'SURA',
                fecha_nacimiento: '1990-12-24',
                regimen: 'Particular',
            },
            camposInvalidos: [],
        });
    });

    it('prefiere tipoDocumentoCodigo y usa el número de WhatsApp si no hay celular en el state', () => {
        const r = construirPayloadPacienteNuevo(
            { ...estadoBase, tipoDocumentoCodigo: 'TI', tipoDoc: undefined, celular: undefined },
            '573109998877'
        );
        expect(r.payload?.tipo_documento).toBe('TI');
        expect(r.payload?.numero_contacto).toBe('3109998877');
    });

    it('sin convenio usa particular; teléfono que no cabe en 15 dígitos se omite', () => {
        const r = construirPayloadPacienteNuevo(
            { ...estadoBase, idConvenio: undefined, nombreServicioConvenio: undefined, celular: '1234567890123456' },
            '1234567890123456'
        );
        expect(r.ok).toBe(true);
        expect(r.payload?.convenio).toBe('1787');
        expect(r.payload?.administradora).toBe('PARTICULAR');
        expect(r.payload).not.toHaveProperty('numero_contacto');
    });

    it('tipo de documento no reconocido → no se arma el body (no se llama al backend)', () => {
        const r = construirPayloadPacienteNuevo({ ...estadoBase, tipoDoc: 'Desconocido' }, '573001234567');
        expect(r).toEqual({ ok: false, payload: null, camposInvalidos: ['tipo_documento'] });
    });

    it('state vacío → lista todos los obligatorios', () => {
        const r = construirPayloadPacienteNuevo({}, '573001234567');
        expect(r.ok).toBe(false);
        expect(r.payload).toBeNull();
        expect(r.camposInvalidos).toEqual([
            'tipo_documento',
            'numero_documento',
            'primer_nombre',
            'primer_apellido',
            'email',
            'fecha_nacimiento',
        ]);
    });
});
