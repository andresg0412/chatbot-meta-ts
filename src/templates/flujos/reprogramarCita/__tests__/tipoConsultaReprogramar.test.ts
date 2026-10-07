import { esCatalogoSoloAsesor } from '../../../../constants/catalogosSoloAsesor';
import { tipoConsultaParaReprogramar } from '../tipoConsultaReprogramar';

describe('tipoConsultaParaReprogramar', () => {
    it('mantiene primera vez', () => {
        expect(tipoConsultaParaReprogramar('PRIMERA VEZ PSICOLOGÍA', 'E1')).toBe('Primera vez');
    });
    it.each(['CONTROL PSICOLOGÍA', 'INTERVENCION EN CRISIS SOD', 'PSICOTERAPIA INDIVIDUAL'])(
        'usa control y el mismo profesional para %s', (catalogo) => {
            expect(tipoConsultaParaReprogramar(catalogo, 'E1')).toBe('Control');
        }
    );
    it('sin profesional no permite buscar', () => {
        expect(tipoConsultaParaReprogramar('PSICOTERAPIA INDIVIDUAL', '')).toBeNull();
    });
});

describe('CATALOGOS_SOLO_ASESOR', () => {
    it.each([
        'INTERVENCIÓN EN CRISIS SOD',
        'ADMINISTRACION DE PRUEBA NEUROPSICOLOGICA',
        'APLICACION DE PRUEBA NEUROPSICOLOGICA',
        'ADMINISTRACIÓN [APLICACIÓN] DE PRUEBA NEUROPSICOLÓGICA',
        'PRUEBA COGNITIVA WISC V',
        'PAQUETE DE NEUROPSICOLOGIA',
        'ADMINISTRACION DE PRUEBA DE INTELIGENCIA',
        'APLICACION DE PRUEBA DE INTELIGENCIA',
        'ADMINISTRACIÓN [APLICACIÓN] DE PRUEBA DE INTELIGENCIA',
        'TALLER DE ORIENTACION PSICOLOGICA EMPRESARIAL',
    ])('deriva %s', (catalogo) => expect(esCatalogoSoloAsesor(catalogo)).toBe(true));

    it.each([
        'PSICOTERAPIA INDIVIDUAL', 'TERAPIA DE PAREJA', 'REHABILITACION COGNITIVA',
        'REUNIONES DIRECCION DE SERVICIOS',
    ])('no deriva automaticamente %s', (catalogo) => expect(esCatalogoSoloAsesor(catalogo)).toBe(false));
});
