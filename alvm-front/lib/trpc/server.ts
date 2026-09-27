/**
 * Client tRPC des Server Components.
 *
 * Le front ne connaît pas la base : les Server Components interrogent le back
 * en HTTP sur le réseau interne, avec le cookie de session de la requête
 * (le back le déchiffre et revalide la session) et les en-têtes internes.
 *
 * Usage :
 * ```typescript
 * const trpc = await createServerTRPC();
 * const camps = await trpc.camps.list.query({ limit: 10 });
 * ```
 */
import { TRPCClientError, createTRPCClient, httpBatchLink } from '@trpc/client';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import superjson from 'superjson';
import type { AppRouter } from '@alvm/back/trpc';
import { backUrl, internalHeaders } from '@/lib/api/back';

export async function createServerTRPC() {
  const cookieStore = await cookies();
  const incoming = await headers();
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: backUrl('/api/trpc').toString(),
        transformer: superjson,
        headers: () => ({ cookie: cookieStore.toString(), ...internalHeaders(incoming) }),
        fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }),
      }),
    ],
  });
}

/**
 * `NOT_FOUND` renvoyé par le back → page 404 de Next ; toute autre erreur
 * remonte à la frontière d'erreur. Usage : `.query(input).catch(notFoundOnMissing)`.
 */
export function notFoundOnMissing(error: unknown): never {
  if (error instanceof TRPCClientError && error.data?.code === 'NOT_FOUND') notFound();
  throw error;
}
