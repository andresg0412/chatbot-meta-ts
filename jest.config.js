module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  roots: ['<rootDir>/src'],
  // Mismo alias que "paths" de tsconfig.json (algunos flujos importan '~/services/...').
  moduleNameMapper: { '^~/(.*)$': '<rootDir>/src/$1' },
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.jest.json',
      useESM: false,
      // Solo se reportan errores de tipos de los archivos de prueba: tsconfig.jest.json es `strict` y el
      // código fuente (que ya se verifica con `npx tsc --noEmit` y tsconfig.json) tiene errores
      // estrictos preexistentes que impedirían importar los flujos reales desde las pruebas.
      diagnostics: { exclude: ['**/!(*.test|*.spec).ts'] }
    }
  }
};
