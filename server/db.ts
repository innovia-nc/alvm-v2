import { PrismaClient } from '@prisma/client';
import { softDeleteExtension } from './extensions/soft-delete';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * En production sur Vercel + Supabase session-mode pooler (port 5432) :
 * chaque client Prisma garde sa connexion réservée pendant toute la durée
 * de l'instance. Vercel spawn beaucoup de fonctions serverless en parallèle ;
 * sans limite par client, on sature vite le pool (15 clients sur le tier
 * gratuit Supabase). On force connection_limit=1 par instance pour servir
 * jusqu'à pool_size requêtes concurrentes.
 */
function buildDatasourceUrl(): string | undefined {
  const baseUrl =
    process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_PRISMA_URL;
  if (!baseUrl) return undefined;
  try {
    const url = new URL(baseUrl);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '1');
    }
    return url.toString();
  } catch {
    return baseUrl;
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
