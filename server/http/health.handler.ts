import { prisma } from '@/server/db';

/**
 * Sonde de déploiement (Coolify / Docker HEALTHCHECK).
 *
 * Sans paramètre : liveness — le processus répond, aucune dépendance. C'est
 * elle que vise le HEALTHCHECK de l'image : une base indisponible ne doit pas
 * faire redémarrer en boucle un serveur sain.
 * `?db=1` : readiness — ajoute un `SELECT 1` et répond 503 si la base est KO.
 */
export async function handleHealth(request: Request): Promise<Response> {
  const version = process.env.SOURCE_COMMIT ?? process.env.GIT_COMMIT_SHA ?? null;
  const headers = { 'Cache-Control': 'no-store' };

  if (new URL(request.url).searchParams.get('db') !== '1')
    return Response.json({ status: 'ok', version }, { headers });

  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok', database: 'ok', version }, { headers });
  } catch {
    return Response.json(
      { status: 'error', database: 'unreachable', version },
      { status: 503, headers },
    );
  }
}
