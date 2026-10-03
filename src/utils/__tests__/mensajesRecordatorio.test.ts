// Límites de Meta y formato de la lista/mensajes de la respuesta a recordatorios (TB-05 / TBOT-03).
import * as M from '../mensajesRecordatorio';

const cita = (i: number, profesional = 'Ana Pérez') => ({
    cita_id: `C${i}`, agenda_id_externa: 100 + i, fecha_cita: `2026-10-${String(10 + i).padStart(2, '0')}`, hora_cita: '07:50',
    profesional, tipo_recordatorio: null, estado_agenda: 'Pendiente' as const,
});

describe('lista de citas', () => {
    it('10 citas → 9 filas de cita + "Ninguna de estas" (máximo 10 filas de Meta) y aviso en el cuerpo', () => {
        const lista = M.construirListaCitasRecordatorio(Array.from({ length: 10 }, (_, i) => cita(i)));
        const filas = lista.action.sections[0].rows;
        expect(filas).toHaveLength(M.LIMITES_META.filasLista);
        expect(filas[filas.length - 1]).toEqual({ id: M.ID_FILA_NINGUNA, title: 'Ninguna de estas', description: 'No hacer ningún cambio' });
        expect(lista.body.text).toBe('Tienes más de una cita programada. ¿A cuál te refieres?\n\nTe mostramos las 9 más próximas.');
        expect(new Set(filas.map((f) => f.id)).size).toBe(filas.length);
    });

    it('títulos, descripciones, sección y botón dentro de los límites, aun con nombres largos o sucios', () => {
        const largo = 'María\tFernanda\n  de los Ángeles   Rodríguez Castañeda de la Santísima Trinidad y Más Apellidos';
        const lista = M.construirListaCitasRecordatorio([cita(0, largo), cita(1, '')]);
        for (const fila of lista.action.sections[0].rows) {
            expect(fila.title.length).toBeLessThanOrEqual(M.LIMITES_META.tituloFila);
            expect(fila.description.length).toBeLessThanOrEqual(M.LIMITES_META.descripcionFila);
        }
        const [primera, segunda] = lista.action.sections[0].rows;
        expect(primera.title).toBe('sáb 10 oct · 07:50');
        expect(primera.description).not.toMatch(/[\t\n]|\s{2}/);
        expect(primera.description.endsWith('…')).toBe(true);
        expect(segunda.description).toBe('Con el profesional que te atiende');
        expect(lista.action.sections[0].title.length).toBeLessThanOrEqual(M.LIMITES_META.tituloSeccion);
        expect(lista.action.button.length).toBeLessThanOrEqual(M.LIMITES_META.textoBotonLista);
    });

    it('id de fila ↔ índice', () => {
        expect(M.indiceDesdeIdFila(M.idFilaCita(0))).toBe(0);
        expect(M.indiceDesdeIdFila(M.idFilaCita(8))).toBe(8);
        expect(M.indiceDesdeIdFila(M.ID_FILA_NINGUNA)).toBeNull();
        expect(M.indiceDesdeIdFila('rcdcita_z')).toBeNull();
        expect(M.indiceDesdeIdFila('1')).toBeNull();
        expect(M.esFilaNinguna(M.ID_FILA_NINGUNA)).toBe(true);
    });
});

describe('mensajes', () => {
    it('botones de confirmación ≤ 20 caracteres', () => {
        for (const b of M.BOTONES_CONFIRMAR_CANCELACION) expect(b.body.length).toBeLessThanOrEqual(M.LIMITES_META.tituloBoton);
    });

    it('omite lo que falte de la cita', () => {
        expect(M.fraseCita({ fecha_cita: '2026-10-10', hora_cita: '07:50:00', profesional: '' })).toBe(' del 10 de octubre de 2026 a las 07:50');
        expect(M.mensajeConfirmarCancelacion({ fecha_cita: '2026-10-10', hora_cita: '', profesional: 'Ana' }))
            .toBe('Vas a cancelar esta cita:\n📅 10 de octubre de 2026\n👤 Ana\n\n¿Confirmas que deseas cancelarla?');
    });

    it('privacidad: ningún texto menciona especialidad ni términos clínicos', () => {
        const todos = [
            ...(Object.values(M) as unknown[]).filter((v): v is string => typeof v === "string"),
            M.mensajeErrorGlobhoRecordatorio('confirma'), M.mensajeErrorGlobhoRecordatorio('no_asistira'),
            M.mensajeErrorTecnicoRecordatorio('confirma'), M.mensajeErrorTecnicoRecordatorio('no_asistira'),
            M.mensajeCitaConfirmada({}), M.mensajeCitaConfirmada({}, 'ya_confirmada'),
            M.mensajeCitaCancelada({}), M.mensajeCitaCancelada({}, 'ya_cancelada'),
            M.mensajeConfirmarCancelacion({}),
        ];
        for (const texto of todos) expect(texto).not.toMatch(/psic|terapia|sesi[oó]n|proceso|especialidad|psiqu/i);
    });
});
