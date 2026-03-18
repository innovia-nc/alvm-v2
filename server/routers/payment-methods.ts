import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, adminProcedure } from '@/server/trpc/init';
import { getPricingSetting } from '@/server/helpers/settings';

const paymentMethodSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  accountingCode: z.string().nullable(),
  active: z.boolean(),
  displayOrder: z.number(),
  isSystem: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const paymentMethodsRouter = router({
  list: publicProcedure
    .output(z.array(paymentMethodSchema))
    .query(async ({ ctx }) => {
      return ctx.prisma.paymentMethod.findMany({
        where: { active: true },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      });
    }),

  listAll: adminProcedure
    .output(z.array(paymentMethodSchema))
    .query(async ({ ctx }) => {
      return ctx.prisma.paymentMethod.findMany({
        orderBy: [{ active: 'desc' }, { displayOrder: 'asc' }, { name: 'asc' }],
      });
    }),

  getById: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(paymentMethodSchema.nullable())
    .query(async ({ ctx, input }) => {
      return ctx.prisma.paymentMethod.findUnique({
        where: { id: input.id },
      });
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(2).max(100),
      description: z.string().optional(),
      accountingCode: z.string().regex(/^\d{6,10}$/).optional(),
    }))
    .output(paymentMethodSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.paymentMethod.findFirst({
        where: { name: input.name },
      });
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Une méthode de paiement avec ce nom existe déjà',
        });
      }

      const code = input.name
        .toUpperCase()
        .replace(/\s+/g, '_')
        .replace(/[^A-Z0-9_]/g, '');

      return ctx.prisma.paymentMethod.create({
        data: {
          code,
          name: input.name,
          description: input.description ?? null,
          accountingCode: input.accountingCode ?? null,
          active: true,
          displayOrder: 99,
          isSystem: false,
        },
      });
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(2).max(100).optional(),
      description: z.string().nullable().optional(),
      accountingCode: z.string().regex(/^\d{6,10}$/).nullable().optional(),
      active: z.boolean().optional(),
    }))
    .output(paymentMethodSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.paymentMethod.findUnique({
        where: { id: input.id },
      });
      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Méthode de paiement non trouvée',
        });
      }

      if (input.name && input.name !== existing.name) {
        const nameExists = await ctx.prisma.paymentMethod.findFirst({
          where: { name: input.name, id: { not: input.id } },
        });
        if (nameExists) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Une méthode de paiement avec ce nom existe déjà',
          });
        }
      }

      const { id, ...data } = input;
      return ctx.prisma.paymentMethod.update({
        where: { id },
        data,
      });
    }),

  toggleActive: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(paymentMethodSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.paymentMethod.findUnique({
        where: { id: input.id },
      });
      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Méthode de paiement non trouvée',
        });
      }

      if (existing.active) {
        const inactiveDays = await getPricingSetting(ctx.prisma, 'payment_method_inactive_days');
        const recentPayments = await ctx.prisma.payment.count({
          where: {
            paymentMethodId: input.id,
            createdAt: { gte: new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000) },
          },
        });
        if (recentPayments > 0) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: `Impossible de désactiver une méthode utilisée récemment (${inactiveDays} jours)`,
          });
        }
      }

      return ctx.prisma.paymentMethod.update({
        where: { id: input.id },
        data: { active: !existing.active },
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.paymentMethod.findUnique({
        where: { id: input.id },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Méthode de paiement non trouvée' });
      }
      if (existing.isSystem) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Impossible de supprimer une méthode de paiement système',
        });
      }

      const paymentsCount = await ctx.prisma.payment.count({
        where: { paymentMethodId: input.id },
      });
      if (paymentsCount > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Impossible de supprimer une méthode utilisée par des paiements',
        });
      }

      await ctx.prisma.paymentMethod.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
