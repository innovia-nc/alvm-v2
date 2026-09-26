import type { Prisma } from '@prisma/client';

type AuditWriter = {
  platformAuditLog: {
    create: (args: { data: Prisma.PlatformAuditLogUncheckedCreateInput }) => Promise<unknown>;
  };
};
// Only allowlisted event metadata; never passwords, tokens, request bodies or business data.
export async function recordPlatformAudit(
  db: AuditWriter,
  actorId: string | null,
  action: string,
  target?: string,
  outcome = 'SUCCESS',
) {
  await db.platformAuditLog.create({ data: { actorId, action, target, outcome } });
}
