import { TRPCError } from '@trpc/server';
import type { UserRole } from '@prisma/client';
import type { ExtendedPrismaClient } from '@/server/db';
type Tx = Omit<
  ExtendedPrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export async function lockAdministrators(tx: Tx) {
  await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(20260922, 1)::text');
}

export async function deactivateAccount(tx: Tx, id: string, actorRole: UserRole) {
  await lockAdministrators(tx);
  const user = await tx.user.findUnique({ where: { id } });
  if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'Utilisateur non trouvé' });
  if (actorRole !== 'ADMIN' && user.role !== 'PARENT')
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Seul un administrateur peut désactiver ce compte',
    });
  if (
    user.role === 'ADMIN' &&
    !user.disabledAt &&
    (await tx.user.count({ where: { role: 'ADMIN', disabledAt: null } })) <= 1
  ) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Impossible de supprimer le dernier administrateur',
    });
  }
  await tx.user.update({
    where: { id },
    data: { disabledAt: new Date(), sessionVersion: { increment: 1 } },
  });
}
