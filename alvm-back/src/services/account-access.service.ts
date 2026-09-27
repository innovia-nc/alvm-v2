import { TRPCError } from '@trpc/server';
import type { UserRole } from '@prisma/client';
import type { ExtendedPrismaClient } from '@back/db';
import { lockTenant } from '@back/db-context';
type Tx = Omit<
  ExtendedPrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/** Sérialise les changements de comptes d'un même tenant (règle du dernier admin). */
export async function lockAdministrators(tx: Pick<Tx, '$queryRaw'>) {
  await lockTenant(tx, 'accounts');
}

export async function deactivateAccount(tx: Tx, id: string, actorRole: UserRole) {
  await lockAdministrators(tx);
  const user = await tx.user.findUnique({
    where: { id },
    select: { role: true, disabledAt: true },
  });
  if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'Utilisateur non trouvé' });
  if (user.role === 'SUPER_ADMIN')
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Compte super administrateur protégé' });
  if (!['ADMIN', 'SUPER_ADMIN'].includes(actorRole) && user.role !== 'PARENT')
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
