import { NextResponse } from 'next/server';
import { prisma } from '@/server/db';

export const dynamic = 'force-dynamic';

/**
 * Sonde de déploiement (Coolify / Docker HEALTHCHECK).
 *
 * Sans paramètre : liveness — le processus répond, aucune dépendance. C'est
 * elle que vise le HEALTHCHECK de l'image : une base indisponible ne doit pas
 * faire redémarrer en boucle un serveur sain.
 * `?db=1` : readiness — ajoute un `SELECT 1` et répond 503 si la base est KO.
 */
export async function GET(request: Request) {
  const version = process.env.SOURCE_COMMIT ?? process.env.GIT_COMMIT_SHA ?? null;
  const headers = { 'Cache-Control': 'no-store' };

  if (new URL(request.url).searchParams.get('db') !== '1') {
    return NextResponse.json({ status: 'ok', version }, { headers });
  }

  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    return NextResponse.json({ status: 'ok', database: 'ok', version }, { headers });
  } catch {
    return NextResponse.json(
      { status: 'error', database: 'unreachable', version },
      { status: 503, headers },
    );
  }
}
