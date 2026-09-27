/**
 * Préparation de la base des tests d'intégration — exécutée UNE fois, avant
 * tous les fichiers de test (processus principal de Vitest).
 *
 *   1. crée la base dédiée et le rôle applicatif s'ils manquent (CI) ;
 *   2. remet le schéma à zéro (DROP SCHEMA public CASCADE) ;
 *   3. applique les VRAIES migrations via `scripts/db-migrate.ts` (celles de la
 *      production, droits du rôle applicatif compris) ;
 *   4. vérifie que le rôle d'exécution n'est ni superuser ni BYPASSRLS.
 *
 * Tout échec FAIT ÉCHOUER la campagne — PostgreSQL absent compris : un test
 * d'isolation qui ne s'exécute pas n'est pas un test vert (CLAUDE.md §6.5).
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { integrationDatabase } from './database-urls';

const BACK_DIR = path.resolve(__dirname, '../../..');
const BIN_DIR = path.join(BACK_DIR, 'node_modules/.bin');

async function connect(url: string, label: string): Promise<PrismaClient> {
  const client = new PrismaClient({ datasourceUrl: url, log: [] });
  try {
    await client.$queryRaw`SELECT 1`;
    return client;
  } catch (error) {
    await client.$disconnect().catch(() => undefined);
    const host = new URL(url);
    throw new Error(
      `[integration] PostgreSQL injoignable (${label}, ${host.hostname}:${host.port}${host.pathname}). ` +
        'Démarrez-le (`docker compose up -d` à la racine) ou renseignez TEST_DATABASE_URL / ' +
        'TEST_DATABASE_MIGRATION_URL. Les tests d’intégration ne sont jamais ignorés : ' +
        'sans base, la campagne échoue (CLAUDE.md §6.5).\n' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

async function ensureDatabaseAndRole(
  adminUrl: string,
  database: string,
  role: string,
  password: string,
) {
  const admin = await connect(adminUrl, 'administration');
  try {
    const roles = await admin.$queryRaw<Array<{ rolname: string }>>`
      SELECT rolname FROM pg_roles WHERE rolname = ${role}`;
    if (roles.length === 0) {
      // Nom et mot de passe passent par des GUC transactionnelles puis
      // format(%I / %L) : jamais concaténés dans le SQL.
      await admin.$transaction([
        admin.$executeRaw`SELECT set_config('alvm.app_role', ${role}, true), set_config('alvm.app_password', ${password}, true)`,
        admin.$executeRaw`DO $$ BEGIN
          EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE',
            current_setting('alvm.app_role'), current_setting('alvm.app_password'));
        END $$`,
      ]);
    }
    const databases = await admin.$queryRaw<Array<{ datname: string }>>`
      SELECT datname FROM pg_database WHERE datname = ${database}`;
    // Identifiants validés par `integrationDatabase()` ([a-z_][a-z0-9_]*).
    if (databases.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
    await admin.$executeRawUnsafe(`GRANT CONNECT ON DATABASE "${database}" TO "${role}"`);
  } finally {
    await admin.$disconnect();
  }
}

async function resetSchema(migrationUrl: string) {
  const owner = await connect(migrationUrl, 'propriétaire du schéma');
  try {
    await owner.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await owner.$executeRawUnsafe('CREATE SCHEMA public');
  } finally {
    await owner.$disconnect();
  }
}

function migrate(appUrl: string, migrationUrl: string) {
  try {
    execFileSync(path.join(BIN_DIR, 'tsx'), ['scripts/db-migrate.ts'], {
      cwd: BACK_DIR,
      stdio: 'pipe',
      env: {
        ...process.env,
        PATH: `${BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
        DATABASE_URL: appUrl,
        DATABASE_MIGRATION_URL: migrationUrl,
      },
    });
  } catch (error) {
    const failure = error as { stdout?: Buffer; stderr?: Buffer; message: string };
    throw new Error(
      `[integration] Échec des migrations (scripts/db-migrate.ts) :\n${failure.stdout ?? ''}${failure.stderr ?? failure.message}`,
    );
  }
}

async function assertRestrictedRuntimeRole(appUrl: string) {
  const app = await connect(appUrl, 'rôle applicatif');
  try {
    const [role] = await app.$queryRaw<
      Array<{ name: string; rolsuper: boolean; rolbypassrls: boolean }>
    >`SELECT rolname AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    if (!role) throw new Error('[integration] Rôle applicatif introuvable.');
    if (role.rolsuper || role.rolbypassrls)
      throw new Error(
        `[integration] Le rôle d'exécution « ${role.name} » est superuser ou BYPASSRLS : la RLS ne serait pas éprouvée.`,
      );
    // Toutes les tables métier doivent être sous RLS forcée (ENABLE + FORCE).
    const unprotected = await app.$queryRaw<Array<{ relname: string }>>`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname NOT IN ('_prisma_migrations', 'login_attempts')
        AND NOT (c.relrowsecurity AND c.relforcerowsecurity)`;
    if (unprotected.length > 0)
      throw new Error(
        `[integration] Tables sans RLS forcée : ${unprotected.map((t) => t.relname).join(', ')}.`,
      );
  } finally {
    await app.$disconnect();
  }
}

export default async function setup() {
  const db = integrationDatabase();
  await ensureDatabaseAndRole(db.adminUrl, db.database, db.appRole, db.appPassword);
  await resetSchema(db.migrationUrl);
  migrate(db.appUrl, db.migrationUrl);
  await assertRestrictedRuntimeRole(db.appUrl);
}
