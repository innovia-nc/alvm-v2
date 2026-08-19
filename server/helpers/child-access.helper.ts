import type { ExtendedPrismaClient } from '@/server/db';

/**
 * Droit d'acces a un enfant, partage par les procedures tRPC
 * (`server/routers/child-documents.ts`) et par la route d'upload
 * (`app/api/upload/child-documents/route.ts`).
 *
 * - STAFF / ADMIN : acces a tout enfant actif.
 * - PARENT : uniquement les enfants auxquels il est rattache par
 *   `children_parents`.
 *
 * Retourne un booleen plutot que de lever : l'appelant tRPC en fait un
 * `TRPCError`, la route HTTP un 404. Deux appelants, une seule regle.
 */
export async function hasChildAccess(
  prisma: ExtendedPrismaClient,
  userId: string,
  role: string,
  childId: string,
): Promise<boolean> {
  if (role === 'STAFF' || role === 'ADMIN') {
    const child = await prisma.child.findFirst({
      where: { id: childId, deletedAt: null },
      select: { id: true },
    });
    return child !== null;
  }

  const link = await prisma.childParent.findFirst({
    where: {
      parentId: userId,
      childId,
      child: { deletedAt: null },
    },
  });

  return link !== null;
}
