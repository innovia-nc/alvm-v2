import { PrismaClient } from '@prisma/client';
import { softDeleteExtension } from './extensions/soft-delete';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * Client Prisma racine, connecté avec le rôle applicatif (DATABASE_URL) :
 * NOSUPERUSER, NOBYPASSRLS. Utilisé HORS contexte, il ne voit aucune ligne
 * métier — la RLS n'a pas de tenant à comparer (fail-closed).
 *
 * Toute lecture ou écriture métier passe par `withDbContext()`
 * (`server/db-context.ts`), qui ouvre une transaction et y pose le tenant.
 */
const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    transactionOptions: { maxWait: 15000, timeout: 30000 },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = basePrisma;
}

export const prisma = basePrisma.$extends(softDeleteExtension);

export type ExtendedPrismaClient = typeof prisma;
