import { auth } from '@/lib/auth/config';
import { prisma, type ExtendedPrismaClient } from '@/server/db';

export interface AuthUser {
  id: string;
  email: string;
  role: 'PARENT' | 'STAFF' | 'ADMIN';
  name?: string;
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
        email: session.user.email!,
        role: session.user.role ?? 'PARENT',
        name: session.user.name ?? undefined,
      }
    : null;

  return { user, prisma };
}
