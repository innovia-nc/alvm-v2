import { defineConfig } from 'vitest/config';
import path from 'node:path';

/** Tests unitaires du back : Prisma simulé, aucun accès base (voir vitest.integration.config.ts). */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/unit/**/*.spec.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
    },
  },
  resolve: {
    alias: { '@back': path.resolve(__dirname, 'src') },
  },
});
