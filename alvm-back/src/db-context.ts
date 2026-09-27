/**
 * Contexte de base de données par transaction — isolation multi-tenant.
 *
 * Chaque requête métier s'exécute dans une transaction qui pose deux GUC
 * transactionnelles (`set_config(…, true)`, jamais au niveau session : le
 * contexte ne peut pas fuir vers la requête suivante qui réutiliserait la
 * connexion du pool) :
 *   app.scope  — 'tenant' | 'platform' | 'auth'
 *   app.org_id — uuid du tenant
 * Les policies RLS (prisma/migrations/*_row_level_security) filtrent sur ces
 * valeurs ; `organization_id` est rempli par défaut depuis `app.org_id`.
 *
 * Voir docs/adr/0002-multi-tenant-rls.md.
 */
import { prisma, type ExtendedPrismaClient } from './db';

export type DbScope = 'tenant' | 'platform' | 'auth';

export type DbContext =
  | { scope: 'tenant'; organizationId: string }
  | { scope: 'platform'; organizationId?: null }
  | { scope: 'auth'; organizationId?: null };

/** Client lié à la transaction de contexte (même API que le client Prisma). */
export type Db = ExtendedPrismaClient;

type TxClient = Parameters<Parameters<ExtendedPrismaClient['$transaction']>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Expose le client transactionnel avec un `$transaction` « aplati » : les
 * services existants ouvrent leurs propres transactions (`db.$transaction(fn)`
 * ou `db.$transaction([...])`) ; elles s'exécutent dans la transaction de
 * contexte, dont elles héritent le tenant et l'atomicité.
 */
function flatten(tx: TxClient): Db {
  const proxy: Db = new Proxy(tx as object, {
    get(target, property, receiver) {
      if (property === '$transaction') {
        return async (operation: unknown) => {
          if (typeof operation === 'function') return operation(proxy);
          if (Array.isArray(operation)) {
            const results: unknown[] = [];
            for (const pending of operation) results.push(await pending);
            return results;
          }
          throw new TypeError('$transaction attend une fonction ou un tableau de requêtes.');
        };
      }
      return Reflect.get(target, property, receiver);
    },
  }) as Db;
  return proxy;
}

/**
 * Exécute `fn` dans une transaction dont le contexte RLS est `context`.
 * Point d'entrée unique vers les données métier : procédures tRPC, routes
 * HTTP, NextAuth, scripts.
 */
export async function withDbContext<T>(context: DbContext, fn: (db: Db) => Promise<T>): Promise<T> {
  const organizationId = context.organizationId ?? '';
  if (context.scope === 'tenant' && !UUID.test(organizationId))
    throw new Error('Contexte tenant sans organisation valide.');
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.scope', ${context.scope}, true), set_config('app.org_id', ${organizationId}, true)`;
    return fn(flatten(tx));
  });
}

/**
 * Bascule la transaction de plateforme sur un tenant (provisionnement, réglage
 * des modules d'une association). Réservé au scope `platform` : l'appelant
 * reste super administrateur, seules les écritures métier ciblent le tenant.
 */
export async function actAsOrganization(db: Db, organizationId: string | null): Promise<void> {
  if (organizationId !== null && !UUID.test(organizationId))
    throw new Error('Organisation invalide.');
  await db.$executeRaw`SELECT set_config('app.org_id', ${organizationId ?? ''}, true)`;
}

export type TenantLock = 'billing' | 'accounts' | 'features';

/**
 * Verrou transactionnel sérialisant une famille d'écritures au sein d'UN
 * tenant (deux associations ne s'attendent jamais). Remplace les verrous
 * globaux `pg_advisory_xact_lock(20260922, n)` de l'installation mono-tenant.
 */
export async function lockTenant(db: Pick<Db, '$queryRaw'>, lock: TenantLock): Promise<void> {
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(COALESCE(app_current_org_id()::text, 'platform') || ':' || ${lock}, 0))::text`;
}

/**
 * Vérifie au démarrage que le rôle de connexion est soumis à la RLS.
 * Fail-closed en production : un rôle superuser ou BYPASSRLS rendrait
 * l'isolation des tenants illusoire.
 */
export async function assertRestrictedDatabaseRole(): Promise<void> {
  const [role] = await prisma.$queryRaw<Array<{ rolsuper: boolean; rolbypassrls: boolean }>>`
    SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
  if (!role || role.rolsuper || role.rolbypassrls) {
    const message =
      'DATABASE_URL utilise un rôle superuser ou BYPASSRLS : la Row Level Security ne s’applique pas.';
    if (process.env.NODE_ENV === 'production') throw new Error(message);
    console.warn(`[db] ${message}`);
  }
}
