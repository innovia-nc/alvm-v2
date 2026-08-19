import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '@/server/trpc/init';
import { deleteFromStorageBestEffort } from '@/lib/storage/blob-storage';
import { hasChildAccess } from '@/server/helpers/child-access.helper';

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
 * Refus uniforme (404) : un parent ne doit pas pouvoir distinguer « enfant
 * inexistant » de « enfant qui n'est pas le sien ». La regle d'acces elle-meme
 * vit dans `server/helpers/child-access.helper.ts` — la route d'upload
 * `/api/upload/child-documents` applique exactement la meme.
 */
async function assertChildAccess(
  prisma: any,
  userId: string,
  role: string,
  childId: string,
): Promise<void> {
  const allowed = await hasChildAccess(prisma, userId, role, childId);
  if (!allowed) {
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
