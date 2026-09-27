/**
 * Accès au back NestJS depuis le serveur Next (route de relais, NextAuth,
 * Server Components). Le front ne touche jamais la base (CLAUDE.md §5.4).
 */
import { CLIENT_IP_HEADER, INTERNAL_SECRET_HEADER } from '@alvm/shared/internal-api';
import { env } from '@/lib/env';
import { getClientIp } from '@/lib/client-ip';

export function backUrl(path: string): URL {
  return new URL(path, env.API_INTERNAL_URL);
}

/** En-têtes internes : secret partagé + adresse du client calculée ici. */
export function internalHeaders(incoming: Headers): Record<string, string> {
  return {
    [INTERNAL_SECRET_HEADER]: env.INTERNAL_API_SECRET,
    [CLIENT_IP_HEADER]: getClientIp(incoming, {
      TRUSTED_PROXY_HOPS: env.TRUSTED_PROXY_HOPS?.toString(),
    }),
  };
}

/** POST JSON vers une route interne du back (`/api/internal/...`). */
export async function postInternal<T>(
  path: string,
  body: unknown,
  incoming: Headers,
): Promise<T | null> {
  const response = await fetch(backUrl(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...internalHeaders(incoming) },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  return (await response.json()) as T;
}
