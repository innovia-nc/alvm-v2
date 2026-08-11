import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '@/server/trpc/init';
import { deleteFromStorageBestEffort } from '@/lib/storage/blob-storage';

const childDocumentSchema = z.object({
  id: z.string().uuid(),
  childId: z.string().uuid(),
  filename: z.string(),
  originalFilename: z.string(),
  fileUrl: z.string().url(),
  mimeType: z.literal('application/pdf'),
  fileSize: z.number().int().positive(),
  description: z.string().nullable(),
  uploadedBy: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Checks if a user has access to a child.
 * PARENT: must be linked via children_parents.
 * STAFF/ADMIN: always has access.
 */
async function assertChildAccess(
  prisma: any,
  userId: string,
  role: string,
  childId: string,
): Promise<void> {
  if (role === 'STAFF' || role === 'ADMIN') {
    const child = await prisma.child.findFirst({
      where: { id: childId, deletedAt: null },
      select: { id: true },
    });
    if (!child) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Enfant non trouvé' });
    }
    return;
  }

  // PARENT: check via children_parents
  const link = await prisma.childParent.findFirst({
    where: {
      parentId: userId,
      childId,
      child: { deletedAt: null },
    },
  });

  if (!link) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Enfant non trouvé ou accès refusé' });
  }
}

export const childDocumentsRouter = router({
  list: protectedProcedure
    .input(z.object({ childId: z.string().uuid() }))
    .output(z.array(childDocumentSchema))
    .query(async ({ ctx, input }) => {
      await assertChildAccess(ctx.prisma, ctx.user.id, ctx.user.role, input.childId);

      const docs = await ctx.prisma.childDocument.findMany({
        where: { childId: input.childId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });

      return docs.map((d: any) => ({
        id: d.id,
        childId: d.childId,
        filename: d.filename,
        originalFilename: d.originalFilename,
        fileUrl: d.fileUrl,
        mimeType: d.mimeType as 'application/pdf',
        fileSize: d.fileSize,
        description: d.description,
        uploadedBy: d.uploadedBy,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      }));
    }),

  delete: protectedProcedure
    .input(z.object({ documentId: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.prisma.childDocument.findFirst({
        where: { id: input.documentId, deletedAt: null },
      });

      if (!doc) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Document non trouvé ou déjà supprimé' });
      }

      await assertChildAccess(ctx.prisma, ctx.user.id, ctx.user.role, doc.childId);

      await ctx.prisma.childDocument.update({
        where: { id: input.documentId },
        data: { deletedAt: new Date() },
      });

      // TD-006 : sans cet appel, le PDF reste accessible par son URL publique
      // (et facturé) après sa suppression fonctionnelle. Best effort : un
      // échec côté store ne doit pas ressusciter le document.
      await deleteFromStorageBestEffort(doc.fileUrl, 'document enfant');

      return { success: true };
    }),

  count: protectedProcedure
    .input(z.object({ childId: z.string().uuid() }))
    .output(z.number().int())
    .query(async ({ ctx, input }) => {
      await assertChildAccess(ctx.prisma, ctx.user.id, ctx.user.role, input.childId);

      return ctx.prisma.childDocument.count({
        where: { childId: input.childId, deletedAt: null },
      });
    }),
});
