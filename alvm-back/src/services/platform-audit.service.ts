import type { Prisma } from '@prisma/client';

type AuditWriter = {
  platformAuditLog: {
    createMany: (args: { data: Prisma.PlatformAuditLogCreateManyInput[] }) => Promise<unknown>;
  };
};
/**
 * Journal d'audit de la plateforme (ajout seul : la RLS refuse UPDATE/DELETE).
 * Only allowlisted event metadata; never passwords, tokens, request bodies or business data.
 *
 * `organizationId` : tenant de l'événement. Omis, il est renseigné par la base
 * depuis le contexte de la transaction (`app.org_id`).
 *
 * `createMany` et non `create` : Prisma ajoute `RETURNING` à un `create`, et
 * PostgreSQL impose alors la policy SELECT à la ligne insérée — réservée à la
 * plateforme sur ce journal. L'écriture reste donc possible en scope `auth`
 * ou `tenant` sans ouvrir la lecture du journal.
 */
export async function recordPlatformAudit(
  db: AuditWriter,
  actorId: string | null,
  action: string,
  target?: string,
  outcome = 'SUCCESS',
  organizationId?: string,
) {
  await db.platformAuditLog.createMany({
    data: [{ actorId, action, target, outcome, ...(organizationId ? { organizationId } : {}) }],
  });
}
