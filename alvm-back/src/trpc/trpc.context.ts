import type { IncomingHttpHeaders } from 'node:http';
import { prisma, type ExtendedPrismaClient } from '@back/db';
import { withDbContext } from '@back/db-context';
import { clientIp, resolveRequestUser } from '@back/auth/request-auth';

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
  /** Adresse du client calculée par le front (limitation de débit). */
  clientIp: string;
}

/**
 * Contexte tRPC d'une requête HTTP : l'utilisateur vient du cookie de session
 * relayé par le front, revalidé en base (`resolveRequestUser`).
 */
export async function createContext(headers: IncomingHttpHeaders): Promise<Context> {
  return {
    user: await resolveRequestUser(headers),
    prisma,
    withDb: withDbContext,
    clientIp: clientIp(headers),
  };
}
