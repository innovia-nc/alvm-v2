import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '@/server/trpc/init';
import { deleteFromStorageBestEffort } from '@/lib/storage/blob-storage';

const staffDocumentSchema = z.object({
    id: z.string().uuid(),
    staffId: z.string().uuid(),
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
 * STAFF/ADMIN: always has access.
 */
async function assertStaffAccess(
    prisma: any,
    role: string,
    staffId: string,
): Promise<void> {
    if (role !== 'ADMIN' && role !== 'STAFF') {
        throw new TRPCError({
            code: 'FORBIDDEN',
            message: "Accès réservé au personnel. Vous n'avez pas les droits nécessaires."
        });
    }

    const staffExists = await prisma.staffMember.findFirst({
        where: { userId: staffId, deletedAt: null },
        select: { userId: true },
    });

    if (!staffExists) {
        throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Membre du personnel introuvable.'
        });
    }
}
export const staffDocumentsRouter = router({
    list: protectedProcedure
        .input(z.object({ staffId: z.string().uuid() }))
        .output(z.array(staffDocumentSchema))
        .query(async ({ ctx, input }) => {
            await assertStaffAccess(ctx.prisma, ctx.user.role, input.staffId);

            const docs = await ctx.prisma.staffDocument.findMany({
                where: { staffId: input.staffId, deletedAt: null },
                orderBy: { createdAt: 'desc' },
            });

            return docs.map((d: any) => ({
                ...d,
                mimeType: d.mimeType as 'application/pdf',
            }));
        }),

    getById: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .output(staffDocumentSchema.nullable())
        .query(async ({ ctx, input }) => {
            const doc = await ctx.prisma.staffDocument.findFirst({
                where: { id: input.id, deletedAt: null },
            });

            if (!doc) return null;

            await assertStaffAccess(ctx.prisma, ctx.user.role, doc.staffId);

            return {
                ...doc,
                mimeType: doc.mimeType as 'application/pdf',
            };
        }),

    delete: protectedProcedure
        .input(z.object({ documentId: z.string().uuid() }))
        .output(z.object({ success: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            const doc = await ctx.prisma.staffDocument.findFirst({
                where: { id: input.documentId, deletedAt: null },
            });

            if (!doc) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Document non trouvé' });
            }

            await assertStaffAccess(ctx.prisma, ctx.user.role, doc.staffId);

            await ctx.prisma.staffDocument.update({
                where: { id: input.documentId },
                data: { deletedAt: new Date() },
            });

            // TD-006 : idem documents enfants — le blob doit suivre la ligne
            // en base, sinon un document personnel supprimé reste lisible par
            // quiconque connaît son URL.
            await deleteFromStorageBestEffort(doc.fileUrl, 'document personnel');

            return { success: true };
        }),

    count: protectedProcedure
        .input(z.object({ staffId: z.string().uuid() }))
        .output(z.number().int())
        .query(async ({ ctx, input }) => {
            await assertStaffAccess(ctx.prisma, ctx.user.role, input.staffId);

            return ctx.prisma.staffDocument.count({
                where: { staffId: input.staffId, deletedAt: null },
            });
        }),
});