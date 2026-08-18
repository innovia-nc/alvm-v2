import { auth } from '@/lib/auth/config';
import { prisma, type ExtendedPrismaClient } from '@/server/db';

/**
 * Identité portée par le contexte tRPC.
 *
 * Strictement ce que les procédures lisent : `id` (propriété des données) et
 * `role` (habilitation). Tout champ ajouté ici traverse chaque requête sans
 * qu'aucune garde ne le consulte tant qu'un routeur ne le lit pas.
 */
export interface AuthUser {
  id: string;
  role: 'PARENT' | 'STAFF' | 'ADMIN';
}

export interface Context {
  user: AuthUser | null;
  prisma: ExtendedPrismaClient;
}

/**
 * Creates the tRPC context for each request.
 * Uses NextAuth session (no more JWT decryption from cookies).
 */
export async function createContext(): Promise<Context> {
  const session = await auth();

  const user: AuthUser | null = session?.user
    ? {
        id: session.user.id,
        role: session.user.role ?? 'PARENT',
      }
    : null;

  return { user, prisma };
}
