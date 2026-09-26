import type { Prisma } from '@prisma/client';

type AuditWriter = {
  platformAuditLog: {
    create: (args: { data: Prisma.PlatformAuditLogUncheckedCreateInput }) => Promise<unknown>;
  };
};
/**
 * Journal d'audit de la plateforme (ajout seul : la RLS refuse UPDATE/DELETE).
 * Only allowlisted event metadata; never passwords, tokens, request bodies or business data.
 *
 * `organizationId` : tenant de l'événement. Omis, il est renseigné par la base
 * depuis le contexte de la transaction (`app.org_id`).
 */
export async function recordPlatformAudit(
  db: AuditWriter,
  actorId: string | null,
  action: string,
  target?: string,
  outcome = 'SUCCESS',
  organizationId?: string,
) {
  await db.platformAuditLog.create({
    data: { actorId, action, target, outcome, ...(organizationId ? { organizationId } : {}) },
  });
}
