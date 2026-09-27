import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Intégration de la file `alvm-email` contre un vrai Redis (hors suite
 * unitaire) : `pnpm --filter @alvm/back test:integration:email-queue`.
 * Redis requis (`docker compose up -d redis`, REDIS_URL sinon
 * redis://127.0.0.1:6380) — absent, le run échoue.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/integration/email-queue.integration.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: { '@back': path.resolve(__dirname, 'src') },
  },
});
