import { auth } from '@/lib/auth/config';
import { prisma, type ExtendedPrismaClient } from '@/server/db';
import { withDbContext } from '@/server/db-context';

export type UserRole = 'PARENT' | 'STAFF' | 'ADMIN' | 'SUPER_ADMIN';

/**
 * Identité portée par le contexte tRPC.
 *
 * Strictement ce que les procédures lisent : `id` (propriété des données),
 * `role` (habilitation) et `organizationId` (tenant de la session, posé dans
 * la transaction RLS par les procédures authentifiées).
 */
export interface AuthUser {
  id: string;
  role: UserRole;
  organizationId: string;
}

export interface Context {
  user: AuthUser | null;
  /**
   * Hors procédure authentifiée : client SANS contexte RLS (aucune ligne
   * métier visible). Dans une procédure authentifiée, remplacé par le client
   * de la transaction du tenant (voir `server/trpc/init.ts`).
   */
  prisma: ExtendedPrismaClient;
  /** Tenant de la procédure ; défini pour les procédures tenant. */
  organizationId?: string;
  /**
   * Exécuteur des transactions de contexte RLS (`withDbContext` en production ;
   * remplacé par le client simulé dans les tests unitaires).
   */
  withDb: typeof withDbContext;
}

/**
 * Creates the tRPC context for each request.
 * Uses NextAuth session (no more JWT decryption from cookies).
 */
export async function createContext(): Promise<Context> {
  const session = await auth();

  const user: AuthUser | null =
    session?.user?.id && session.user.organizationId
      ? {
          id: session.user.id,
          role: session.user.role ?? 'PARENT',
          organizationId: session.user.organizationId,
        }
      : null;

  return { user, prisma, withDb: withDbContext };
}
