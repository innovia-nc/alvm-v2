import { PrismaClient } from '@prisma/client';
import { softDeleteExtension } from './extensions/soft-delete';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * En production sur Vercel + Neon : le runtime passe par le pooler pgbouncer
 * (POSTGRES_PRISMA_URL), qui multiplexe les connexions des fonctions
 * serverless. POSTGRES_URL_NON_POOLING (connexion directe) ne sert que de
 * secours ; dans ce cas chaque client Prisma garde sa connexion réservée,
 * donc on force connection_limit=1 par instance pour ne pas saturer le pool.
 */
function buildDatasourceUrl(): string | undefined {
  const pooledUrl = process.env.POSTGRES_PRISMA_URL;
  if (pooledUrl) return pooledUrl;

  const directUrl = process.env.POSTGRES_URL_NON_POOLING;
  if (!directUrl) return undefined;
  try {
    const url = new URL(directUrl);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '1');
    }
    return url.toString();
  } catch {
    return directUrl;
  }
}

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasourceUrl: buildDatasourceUrl(),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = basePrisma;
}

export const prisma = basePrisma.$extends(softDeleteExtension);

export type ExtendedPrismaClient = typeof prisma;
