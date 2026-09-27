/**
 * Base PostgreSQL des tests d'intégration (CLAUDE.md InnovIA §6.2).
 *
 * Base DÉDIÉE (`alvm_integration`), jamais `alvm_dev` ni une base partagée :
 * elle est remise à zéro (DROP SCHEMA public CASCADE) à chaque exécution.
 *
 * Deux connexions, comme en production (docs/adr/0002-multi-tenant-rls.md) :
 *   TEST_DATABASE_URL           — rôle applicatif NOSUPERUSER NOBYPASSRLS : la
 *                                 RLS s'applique à toutes les requêtes testées ;
 *   TEST_DATABASE_MIGRATION_URL — propriétaire du schéma : remise à zéro,
 *                                 migrations et lectures de contrôle.
 * Les valeurs par défaut visent le PostgreSQL de `compose.yml` (127.0.0.1:5436) ;
 * la CI les surcharge.
 */

export const DEFAULT_APP_URL = 'postgresql://alvm_app:alvm_app@127.0.0.1:5436/alvm_integration';
export const DEFAULT_MIGRATION_URL =
  'postgresql://postgres:postgres@127.0.0.1:5436/alvm_integration';

/** Identifiant SQL simple (nom de base ou de rôle) : jamais d'interpolation arbitraire. */
const SQL_IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

export interface IntegrationDatabase {
  /** Rôle applicatif (DATABASE_URL du code testé). */
  appUrl: string;
  /** Propriétaire du schéma sur la base d'intégration. */
  migrationUrl: string;
  /** Propriétaire sur la base d'administration `postgres` (création de la base). */
  adminUrl: string;
  database: string;
  appRole: string;
  appPassword: string;
}

function parse(name: string, raw: string): URL {
  try {
    return new URL(raw);
  } catch {
    throw new Error(`${name} n'est pas une URL PostgreSQL valide.`);
  }
}

export function integrationDatabase(env: NodeJS.ProcessEnv = process.env): IntegrationDatabase {
  const appUrl = env.TEST_DATABASE_URL || DEFAULT_APP_URL;
  const migrationUrl = env.TEST_DATABASE_MIGRATION_URL || DEFAULT_MIGRATION_URL;
  const app = parse('TEST_DATABASE_URL', appUrl);
  const owner = parse('TEST_DATABASE_MIGRATION_URL', migrationUrl);

  const database = decodeURIComponent(owner.pathname.replace(/^\//, ''));
  const appDatabase = decodeURIComponent(app.pathname.replace(/^\//, ''));
  const appRole = decodeURIComponent(app.username);
  if (!SQL_IDENTIFIER.test(database))
    throw new Error(`Nom de base d'intégration invalide : « ${database} ».`);
  if (!SQL_IDENTIFIER.test(appRole))
    throw new Error(`Nom du rôle applicatif invalide : « ${appRole} ».`);
  if (database !== appDatabase)
    throw new Error('TEST_DATABASE_URL et TEST_DATABASE_MIGRATION_URL doivent viser la même base.');
  // Garde-fou : la base est détruite à chaque exécution.
  if (!/(^|_)(integration|test)(_|$)/.test(database))
    throw new Error(
      `La base « ${database} » n'a pas l'air d'une base de test (…_integration / …_test) : refus de la remettre à zéro.`,
    );
  if (appRole === decodeURIComponent(owner.username))
    throw new Error(
      'Le rôle applicatif doit être distinct du propriétaire du schéma, sinon la RLS ne serait pas éprouvée.',
    );

  const admin = new URL(owner.toString());
  admin.pathname = '/postgres';

  return {
    appUrl,
    migrationUrl,
    adminUrl: admin.toString(),
    database,
    appRole,
    appPassword: decodeURIComponent(app.password),
  };
}
