import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // JSX « automatic » comme Next : un composant n'a pas à importer React pour
  // être rendu dans un test (sinon « React is not defined »).
  esbuild: { jsx: 'automatic' },
  test: {
    globals: true,
    environment: 'node',
    // .tsx autorisé pour les tests de composants React (docblock jsdom en tête
    // de fichier — cf. CLAUDE.md § Tests). L'environnement global reste `node`.
    include: ['test/**/*.spec.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['components/**/*.tsx', 'hooks/**/*.ts', 'lib/**/*.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
