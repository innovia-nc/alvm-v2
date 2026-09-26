/**
 * Socle des routes HTTP métier (documents, PDF, téléversements).
 *
 * Les handlers de `server/http/` ne dépendent d'aucun framework : ils prennent
 * une `Request` Fetch et l'utilisateur authentifié, et rendent une `Response`.
 * L'hôte HTTP (contrôleurs NestJS de `alvm-back`) ne fait que les brancher.
 *
 * Chaque accès aux données passe par `tenant.run()` : une transaction dont le
 * contexte RLS est le tenant de la session. Plusieurs transactions courtes
 * plutôt qu'une longue : un téléversement vers le stockage ne doit jamais
 * tenir une connexion ouverte.
 */
import { TRPCError } from '@trpc/server';
import type { FeatureKey } from '@/lib/features/catalog';
import { withDbContext, type Db } from '@/server/db-context';
import { assertFeaturesEnabled } from '@/server/helpers/features';
import type { UserRole } from '@/server/trpc/context';

export interface RequestUser {
  id: string;
  role: UserRole;
  organizationId: string;
}

export interface TenantRequest {
  user: RequestUser;
  run<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export function textError(message: string, status: number): Response {
  return new Response(message, { status });
}

/**
 * Ouvre une requête métier : authentifiée, hors super administration, espace
 * actif, modules `features` activés. Renvoie la `Response` d'erreur à rendre
 * telle quelle, ou le contexte de travail.
 */
export async function openTenantRequest(
  user: RequestUser | null,
  features: FeatureKey[],
  respond: (message: string, status: number) => Response = jsonError,
): Promise<Response | TenantRequest> {
  if (!user) return respond('Non authentifié', 401);
  const run = <T>(fn: (db: Db) => Promise<T>) =>
    withDbContext({ scope: 'tenant', organizationId: user.organizationId }, fn);
  try {
    await run(async (db) => {
      const organization = await db.organization.findUnique({
        where: { id: user.organizationId },
        select: { status: true },
      });
      if (organization?.status !== 'ACTIVE')
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cet espace est suspendu. Contactez le support de la plateforme.',
        });
      await assertFeaturesEnabled(db, user.role, features);
    });
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'FORBIDDEN')
      return respond(error.message, 403);
    throw error;
  }
  return { user, run };
}

export const PDF_HEADERS = {
  'Content-Type': 'application/pdf',
  'Cache-Control': 'private, no-store',
} as const;
