import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { integrationDatabase } from './test/integration/setup/database-urls';

/**
 * Tests d'intégration du back : VRAIE base PostgreSQL, RLS active, rôle
 * applicatif non-superuser (CLAUDE.md InnovIA §6.2 / §6.5).
 *
 *   pnpm --filter @alvm/back test:integration
 *
 * La base dédiée est recréée et migrée par `globalSetup` ; sans PostgreSQL la
 * campagne ÉCHOUE (jamais ignorée). Les fichiers s'exécutent un par un, dans un
 * seul processus : ils partagent la base (espaces créés avec des identifiants
 * uniques) et le pool de connexions du client Prisma applicatif.
 */
const db = integrationDatabase();

// Secrets factices, propres à cette campagne : ils ne protègent rien.
const TEST_AUTH_SECRET = 'integration-auth-secret-0123456789abcdef';
const TEST_INTERNAL_SECRET = 'integration-internal-secret-0123456789ab';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/integration/**/*.integration.spec.ts'],
    globalSetup: ['test/integration/setup/global-setup.ts'],
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    sequence: { concurrent: false, shuffle: false },
    // bcrypt (12 tours) et rendu PDF réels : des tests plus lents que les unitaires ;
    // les beforeAll écrivent des jeux de données complets par le vrai code.
    testTimeout: 60_000,
    hookTimeout: 300_000,
    // Les refus attendus (RLS, unicité, triggers) sont vérifiés par les tests ;
    // le journal `prisma:error` qu'ils déclenchent ne ferait que noyer la
    // sortie. Une erreur inattendue échoue quand même, avec son message complet.
    onConsoleLog: (log) => !log.startsWith('prisma:error'),
    env: {
      NODE_ENV: 'test',
      // Le code testé se connecte avec le rôle applicatif (RLS active).
      DATABASE_URL: db.appUrl,
      TEST_DATABASE_URL: db.appUrl,
      TEST_DATABASE_MIGRATION_URL: db.migrationUrl,
      AUTH_SECRET: TEST_AUTH_SECRET,
      INTERNAL_API_SECRET: TEST_INTERNAL_SECRET,
      // Aucun service externe : pas de clé héritée du shell du développeur.
      RESEND_API_KEY: '',
      BLOB_READ_WRITE_TOKEN: '',
      BLOB_PRIVATE_READ_WRITE_TOKEN: '',
      PLATFORM_ENCRYPTION_KEY: '',
      AUTH_URL: '',
      REDIS_URL: '',
    },
  },
  resolve: {
    alias: { '@back': path.resolve(__dirname, 'src') },
  },
});
