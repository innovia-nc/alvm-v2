import { defineConfig } from 'tsup';

/**
 * Build du back : un bundle par point d'entrée (API, worker, scripts de
 * l'image). Les dépendances npm restent externes (installées dans l'image) ;
 * `@alvm/shared` (sources TypeScript du monorepo) est embarqué.
 */
export default defineConfig({
  entry: {
    main: 'src/main.ts',
    'scripts/db-migrate': 'scripts/db-migrate.ts',
    'scripts/create-super-admin': 'scripts/create-super-admin.ts',
  },
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@alvm\/shared/],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
