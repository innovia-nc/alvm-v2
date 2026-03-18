/**
 * tRPC Server-Side Client
 *
 * In the monolith, Server Components call tRPC routers directly
 * via createCaller (no HTTP round-trip).
 */

import { createContext } from '@/server/trpc/context';
import { createCaller } from '@/server/trpc/router';

/**
 * Creates a tRPC caller for Server Components.
 * Calls go directly to the router — no HTTP overhead.
 *
 * Usage:
 * ```typescript
 * const trpc = await createServerTRPC();
 * const camps = await trpc.camps.list({ limit: 10 });
 * ```
 */
export async function createServerTRPC() {
  const ctx = await createContext();
  return createCaller(ctx);
}
