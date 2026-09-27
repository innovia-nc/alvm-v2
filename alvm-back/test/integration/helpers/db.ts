/**
 * Accès base des tests d'intégration.
 *
 * Deux familles de clients, à ne jamais confondre :
 *   - le code TESTÉ passe par le client applicatif (`@back/db`, rôle
 *     NOSUPERUSER NOBYPASSRLS) et `withDbContext` : la RLS s'applique ;
 *   - la VUE DE CONTRÔLE (`createOwnerClient`) se connecte avec le
 *     propriétaire du schéma, superuser : elle contourne la RLS et sert
 *     UNIQUEMENT à constater l'état réel de la base (une ligne a-t-elle
 *     vraiment été modifiée ?), jamais à préparer ou exercer le code.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { expect } from 'vitest';
import { prisma } from '@back/db';
import { withDbContext, type Db } from '@back/db-context';

export { prisma as appPrisma };

/** Client propriétaire (superuser, hors RLS) — lectures de contrôle uniquement. */
export function createOwnerClient(): PrismaClient {
  const url = process.env.TEST_DATABASE_MIGRATION_URL;
  if (!url) throw new Error('TEST_DATABASE_MIGRATION_URL absent (vitest.integration.config.ts).');
  return new PrismaClient({ datasourceUrl: url, log: [] });
}

export const inTenant = <T>(organizationId: string, fn: (db: Db) => Promise<T>) =>
  withDbContext({ scope: 'tenant', organizationId }, fn);

export const inPlatform = <T>(fn: (db: Db) => Promise<T>) =>
  withDbContext({ scope: 'platform' }, fn);

export const inAuth = <T>(fn: (db: Db) => Promise<T>) => withDbContext({ scope: 'auth' }, fn);

/** Exécuteur de transaction de contexte (pour itérer sur plusieurs scopes). */
export type ContextRunner = <T>(fn: (db: Db) => Promise<T>) => Promise<T>;

export const tenantRunner =
  (organizationId: string): ContextRunner =>
  (fn) =>
    inTenant(organizationId, fn);

/** Message d'erreur d'une promesse rejetée (Prisma, PostgreSQL, tRPC). */
export async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  throw new Error('La requête devait être refusée, elle a réussi.');
}

/**
 * Erreur telle que la base l'a produite, SANS l'extrait de code source que
 * Prisma insère dans ses messages (« Invalid `db.x.create()` invocation in
 * … → 12 db.x.create( »). Sans ce nettoyage, un commentaire du test voisin de
 * l'appel pourrait satisfaire l'assertion à la place de la vraie erreur.
 */
export function databaseError(error: Error): { sqlState: string | null; message: string } {
  const message = error.message
    .split('\n')
    .filter(
      (line) =>
        !/^Invalid `.*` invocation/.test(line) &&
        !/^\S+\.(ts|tsx|js|mjs):\d+:\d+$/.test(line) &&
        !/^\s*(→\s*)?\d+\s/.test(line),
    )
    .join('\n')
    .trim();
  const { code, meta } = error as { code?: string; meta?: { code?: unknown } };
  const fromPrisma: Record<string, string> = { P2002: '23505', P2003: '23503' };
  const sqlState =
    (typeof meta?.code === 'string' ? meta.code : null) ??
    (code && fromPrisma[code]) ??
    /code: "([0-9A-Z]{5})"/.exec(message)?.[1] ??
    null;
  return { sqlState, message };
}

/** Rejet attendu avec un SQLSTATE donné (et, au besoin, un message PostgreSQL). */
export async function expectDatabaseError(
  promise: Promise<unknown>,
  sqlState: string,
  message?: RegExp,
) {
  const error = databaseError(await rejectionOf(promise));
  expect(error.sqlState, error.message).toBe(sqlState);
  if (message) expect(error.message).toMatch(message);
}

/** Écriture refusée par un `WITH CHECK` de policy RLS (SQLSTATE 42501). */
export async function expectRlsViolation(promise: Promise<unknown>) {
  await expectDatabaseError(promise, '42501', /violates row-level security policy/);
}

/** Violation d'unicité (SQLSTATE 23505). */
export async function expectUniqueViolation(promise: Promise<unknown>) {
  await expectDatabaseError(promise, '23505');
}

/** Code d'une erreur tRPC levée par un caller (`UNAUTHORIZED`, `NOT_FOUND`…). */
export async function trpcCodeOf(promise: Promise<unknown>): Promise<string> {
  const error = await rejectionOf(promise);
  const code = (error as { code?: string }).code;
  if (!code) throw error;
  return code;
}

/** Identifiant de table/colonne pour le SQL de contrôle (liste fermée, jamais saisie). */
export const ident = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Identifiant SQL invalide : ${name}`);
  return Prisma.raw(`"${name}"`);
};

/** `count(*)` → nombre JS (PostgreSQL renvoie un bigint). */
export const toCount = (rows: Array<{ n: bigint | number }>) => Number(rows[0]?.n ?? 0);
