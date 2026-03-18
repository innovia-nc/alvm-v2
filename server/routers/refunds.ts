import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, staffProcedure, adminProcedure } from '@/server/trpc/init';
import type { Prisma, RefundMethod } from '@prisma/client';
import { createRefundEntries, cancelAccountingEntries } from '@/server/services/accounting.service';
import { toNum } from '@/server/helpers/decimal';

// ============================================================================
// SCHEMAS
// ============================================================================

const refundMethodEnum = z.enum(['IMMEDIATE_REFUND', 'FUTURE_CREDIT']);

const refundSchema = z.object({
  id: z.string().uuid(),
  paymentId: z.string().uuid(),
  amount: z.number(),
  refundDate: z.date(),
  refundMethod: refundMethodEnum,
  reason: z.string(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const refundWithRelationsSchema = refundSchema.extend({
  payment: z.object({
    id: z.string().uuid(),
    amount: z.number(),
    paymentDate: z.date(),
    paymentMethodId: z.string().uuid().optional(),
    paymentMethodName: z.string().optional(),
    paymentMethodCode: z.string().optional(),
    invoice: z.object({
      id: z.string().uuid(),
      invoiceNumber: z.string(),
      parent: z.object({
        id: z.string().uuid(),
        firstName: z.string(),
        lastName: z.string(),
        email: z.string(),
      }),
    }),
  }),
});

const refundInclude = {
  payment: {
    include: {
      paymentMethod: { select: { name: true, code: true } },
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          parentId: true,
          parent: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      },
    },
  },
} as const;

function mapRefundWithRelations(r: any) {
  return {
    id: r.id,
    paymentId: r.paymentId,
    amount: toNum(r.amount),
    refundDate: r.refundDate,
    refundMethod: r.refundMethod as 'IMMEDIATE_REFUND' | 'FUTURE_CREDIT',
    reason: r.reason,
    reference: r.reference,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    payment: {
      id: r.payment.id,
      amount: toNum(r.payment.amount),
      paymentDate: r.payment.paymentDate,
      paymentMethodId: r.payment.paymentMethodId,
      paymentMethodName: r.payment.paymentMethod?.name,
      paymentMethodCode: r.payment.paymentMethod?.code,
      invoice: {
        id: r.payment.invoice.id,
        invoiceNumber: r.payment.invoice.invoiceNumber,
        parent: {
          id: r.payment.invoice.parentId,
          firstName: r.payment.invoice.parent.firstName,
          lastName: r.payment.invoice.parent.lastName,
          email: r.payment.invoice.parent.email,
        },
      },
    },
  };
}

function mapRefund(r: any) {
  return {
    id: r.id,
    paymentId: r.paymentId,
    amount: toNum(r.amount),
    refundDate: r.refundDate,
    refundMethod: r.refundMethod as 'IMMEDIATE_REFUND' | 'FUTURE_CREDIT',
    reason: r.reason,
    reference: r.reference,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ============================================================================
// ROUTER
// ============================================================================

export const refundsRouter = router({
  list: staffProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
      sortBy: z.enum(['refundDate', 'amount', 'createdAt']).default('refundDate'),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
      search: z.string().optional(),
      paymentId: z.string().uuid().optional(),
    }))
    .output(z.object({
      refunds: z.array(refundWithRelationsSchema),
      total: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const { limit, offset, sortBy, sortOrder, search, paymentId } = input;

      const where: Prisma.RefundWhereInput = { deletedAt: null };

      if (paymentId) where.paymentId = paymentId;

      if (search) {
        where.OR = [
          { payment: { invoice: { invoiceNumber: { contains: search, mode: 'insensitive' } } } },
          { payment: { invoice: { parent: { firstName: { contains: search, mode: 'insensitive' } } } } },
          { payment: { invoice: { parent: { lastName: { contains: search, mode: 'insensitive' } } } } },
          { reason: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [refunds, total] = await Promise.all([
        ctx.prisma.refund.findMany({
          where,
          include: refundInclude,
          orderBy: { [sortBy]: sortOrder },
          take: limit,
          skip: offset,
        }),
        ctx.prisma.refund.count({ where }),
      ]);

      return {
        refunds: refunds.map(mapRefundWithRelations),
        total,
      };
    }),

  getById: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(refundWithRelationsSchema.nullable())
    .query(async ({ ctx, input }) => {
      const refund = await ctx.prisma.refund.findFirst({
        where: { id: input.id },
        include: refundInclude,
      });

      return refund ? mapRefundWithRelations(refund) : null;
    }),

  create: staffProcedure
    .input(z.object({
      paymentId: z.string().uuid(),
      amount: z.number().min(0.01),
      refundDate: z.string().min(1),
      refundMethod: refundMethodEnum,
      reason: z.string().min(3),
      reference: z.string().optional(),
      notes: z.string().optional(),
    }))
    .output(refundSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        // Verify payment exists with its method and invoice
        const payment = await tx.payment.findUnique({
          where: { id: input.paymentId },
          include: {
            paymentMethod: { select: { accountingCode: true } },
            invoice: { select: { invoiceNumber: true, parentId: true } },
          },
        });
        if (!payment) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Paiement non trouvé' });
        }

        const paymentAmount = toNum(payment.amount);

        // Check total refunds don't exceed payment
        const existingRefunds = await tx.refund.aggregate({
          where: { paymentId: input.paymentId },
          _sum: { amount: true },
        });
        const totalRefunded = toNum(existingRefunds._sum.amount);

        if (totalRefunded + input.amount > paymentAmount) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Le montant total des remboursements (${(totalRefunded + input.amount)} XPF) dépasse le montant du paiement (${paymentAmount} XPF)`,
          });
        }

        const refund = await tx.refund.create({
          data: {
            paymentId: input.paymentId,
            amount: input.amount,
            refundDate: new Date(input.refundDate),
            refundMethod: input.refundMethod as RefundMethod,
            reason: input.reason,
            reference: input.reference || null,
            notes: input.notes || null,
            recordedBy: ctx.user.id,
          },
        });

        // Generate accounting entries (journal BQ) for immediate refunds
        await createRefundEntries(tx, {
          refundId: refund.id,
          paymentId: input.paymentId,
          parentId: payment.invoice.parentId,
          amount: input.amount,
          refundDate: new Date(input.refundDate),
          refundMethod: input.refundMethod as 'IMMEDIATE_REFUND' | 'FUTURE_CREDIT',
          originalPaymentMethodAccountingCode: payment.paymentMethod.accountingCode || '512000',
          invoiceNumber: payment.invoice.invoiceNumber ?? '',
          userId: ctx.user.id,
        });

        return mapRefund(refund);
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const refund = await tx.refund.findUnique({
          where: { id: input.id },
        });
        if (!refund) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Remboursement non trouvé' });
        }

        // Cancel associated accounting entries
        await cancelAccountingEntries(tx, { refundId: input.id }, ctx.user.id);

        await tx.refund.delete({ where: { id: input.id } });

        return { success: true };
      });
    }),
});
