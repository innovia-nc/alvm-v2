import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, staffProcedure, adminProcedure } from '@/server/trpc/init';

const campTypeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  active: z.boolean(),
  accountingCode: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const campTypesRouter = router({
  list: publicProcedure
    .output(z.array(campTypeSchema))
    .query(async ({ ctx }) => {
      return ctx.prisma.campType.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
      });
    }),

  listAll: staffProcedure
    .output(z.array(campTypeSchema))
    .query(async ({ ctx }) => {
      return ctx.prisma.campType.findMany({
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
      });
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(2).max(100),
      description: z.string().optional(),
      accountingCode: z.string().regex(/^\d{6}$/, 'Code comptable invalide (6 chiffres)').optional(),
    }))
    .output(campTypeSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.campType.findUnique({
        where: { name: input.name },
      });
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Un type de camp avec ce nom existe déjà',
        });
      }

      if (input.accountingCode) {
        const codeExists = await ctx.prisma.campType.findFirst({
          where: { accountingCode: input.accountingCode },
        });
        if (codeExists) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Ce code comptable est déjà utilisé par un autre type de camp',
          });
        }
      }

      return ctx.prisma.campType.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          accountingCode: input.accountingCode ?? null,
          active: true,
        },
      });
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(2).max(100).optional(),
      description: z.string().optional(),
      accountingCode: z.string().regex(/^\d{6}$/).nullable().optional(),
      active: z.boolean().optional(),
    }))
    .output(campTypeSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.campType.findUnique({
        where: { id: input.id },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Type de camp non trouvé' });
      }

      if (input.name && input.name !== existing.name) {
        const nameExists = await ctx.prisma.campType.findUnique({
          where: { name: input.name },
        });
        if (nameExists) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Un type de camp avec ce nom existe déjà',
          });
        }
      }

      if (input.accountingCode) {
        const codeExists = await ctx.prisma.campType.findFirst({
          where: { accountingCode: input.accountingCode, id: { not: input.id } },
        });
        if (codeExists) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Ce code comptable est déjà utilisé',
          });
        }
      }

      const { id, ...data } = input;
      return ctx.prisma.campType.update({
        where: { id },
        data,
      });
    }),

  toggleActive: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(campTypeSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.campType.findUnique({
        where: { id: input.id },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Type de camp non trouvé' });
      }

      if (existing.active) {
        const activeCamps = await ctx.prisma.camp.count({
          where: {
            campTypeId: input.id,
            status: { in: ['PUBLISHED', 'DRAFT'] },
            deletedAt: null,
          },
        });
        if (activeCamps > 0) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Impossible de désactiver un type utilisé par des camps actifs',
          });
        }
      }

      return ctx.prisma.campType.update({
        where: { id: input.id },
        data: { active: !existing.active },
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.campType.findUnique({
        where: { id: input.id },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Type de camp non trouvé' });
      }

      const campsCount = await ctx.prisma.camp.count({
        where: { campTypeId: input.id, deletedAt: null },
      });
      if (campsCount > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Impossible de supprimer un type utilisé par des camps',
        });
      }

      await ctx.prisma.campType.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
