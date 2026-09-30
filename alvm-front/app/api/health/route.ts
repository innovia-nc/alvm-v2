export const dynamic = 'force-dynamic';

/** Liveness du front (HEALTHCHECK de l'image). La readiness base est celle du back. */
export function GET() {
  const version = process.env.SOURCE_COMMIT ?? process.env.GIT_COMMIT_SHA ?? null;
  return Response.json({ status: 'ok', version }, { headers: { 'Cache-Control': 'no-store' } });
}
