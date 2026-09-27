import { createCompensationCredit } from '@back/services/registration-cancellation.service';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, staffProcedure } from '@back/trpc/trpc.init';
import type { Prisma, RefundMethod } from '@prisma/client';
import { createRefundEntries, cancelAccountingEntries } from '@back/services/accounting.service';
import { toNum } from '@back/helpers/decimal';
import { generateDocumentNumber } from '@back/helpers/invoice-number';
import { lockTenant } from '@back/db-context';

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

/**
 * Colonnes d'un remboursement exposées (§5.9) : ni `organizationId`, ni
 * `recordedBy`, ni `refundNumber`/`creditNoteId` (liens internes).
 */
const refundSelect = {
  id: true,
  paymentId: true,
  amount: true,
  refundDate: true,
  refundMethod: true,
  reason: true,
  reference: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.RefundSelect;

const refundDetailsSelect = {
  ...refundSelect,
  payment: {
    select: {
      id: true,
      amount: true,
      paymentDate: true,
      paymentMethodId: true,
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
} as const satisfies Prisma.RefundSelect;

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
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        sortBy: z.enum(['refundDate', 'amount', 'createdAt']).default('refundDate'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
        search: z.string().optional(),
        paymentId: z.string().uuid().optional(),
      }),
    )
    .output(
      z.object({
        refunds: z.array(refundWithRelationsSchema),
        total: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { limit, offset, sortBy, sortOrder, search, paymentId } = input;

      const where: Prisma.RefundWhereInput = { deletedAt: null };

      if (paymentId) where.paymentId = paymentId;

      if (search && search.trim().length > 0) {
        const q = search.trim();
        where.OR = [
          { refundNumber: { contains: q, mode: 'insensitive' } },
          { reference: { contains: q, mode: 'insensitive' } },
          { reason: { contains: q, mode: 'insensitive' } },
          { payment: { invoice: { invoiceNumber: { contains: q, mode: 'insensitive' } } } },
          { payment: { invoice: { parent: { firstName: { contains: q, mode: 'insensitive' } } } } },
          { payment: { invoice: { parent: { lastName: { contains: q, mode: 'insensitive' } } } } },
        ];
      }

      const [refunds, total] = await Promise.all([
        ctx.prisma.refund.findMany({
          where,
          select: refundDetailsSelect,
          orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
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
        select: refundDetailsSelect,
      });

      return refund ? mapRefundWithRelations(refund) : null;
    }),

  create: staffProcedure
    .input(
      z.object({
        paymentId: z.string().uuid(),
        amount: z.number().min(0.01),
        refundDate: z.string().min(1),
        refundMethod: refundMethodEnum,
        reason: z.string().min(3),
        reference: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .output(refundSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');
        // Verify payment exists with its method and invoice
        const payment = await tx.payment.findUnique({
          where: { id: input.paymentId },
          select: {
            amount: true,
            creditNoteId: true,
            paymentMethod: { select: { accountingCode: true } },
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                parentId: true,
                totalAmount: true,
                paidAmount: true,
                creditedAmount: true,
                taxRate: true,
                status: true,
              },
            },
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
            message: `Le montant total des remboursements (${totalRefunded + input.amount} XPF) dépasse le montant du paiement (${paymentAmount} XPF)`,
          });
        }

        if (payment.creditNoteId)
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Un règlement par avoir doit être restitué par suppression de son imputation',
          });
        let creditNoteId: string | null = null;
        if (input.refundMethod === 'FUTURE_CREDIT') {
          const remainingCharge =
            toNum(payment.invoice.totalAmount) - toNum(payment.invoice.creditedAmount);
          if (input.amount > remainingCharge)
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Montant supérieur à la prestation non compensée',
            });
          const credit = await createCompensationCredit(tx, {
            invoiceId: payment.invoice.id,
            parentId: payment.invoice.parentId,
            amount: input.amount,
            taxRate: toNum(payment.invoice.taxRate),
            future: true,
            userId: ctx.user.id,
            reason: input.reason,
          });
          creditNoteId = credit.id;
        }
        const refundNumber = await generateDocumentNumber(tx, 'REFUND');
        const refund = await tx.refund.create({
          data: {
            refundNumber,
            paymentId: input.paymentId,
            creditNoteId,
            amount: input.amount,
            refundDate: new Date(input.refundDate),
            refundMethod: input.refundMethod as RefundMethod,
            reason: input.reason,
            reference: input.reference || null,
            notes: input.notes || null,
            recordedBy: ctx.user.id,
          },
          select: refundSelect,
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

        // Un remboursement immédiat rend de l'argent : la facture est moins
        // payée (même recalcul que payments.create/delete). Un FUTURE_CREDIT
        // devient un avoir — le paiement reste acquis sur cette facture.
        {
          const newPaidAmount = Math.max(0, toNum(payment.invoice.paidAmount) - input.amount);
          const newStatus =
            newPaidAmount >=
            toNum(payment.invoice.totalAmount) -
              toNum(payment.invoice.creditedAmount) -
              (creditNoteId ? input.amount : 0)
              ? 'PAID'
              : payment.invoice.status === 'OVERDUE'
                ? 'OVERDUE'
                : 'SENT';
          await tx.invoice.update({
            where: { id: payment.invoice.id },
            data: {
              paidAmount: newPaidAmount,
              status: newStatus,
              pdfUrl: null,
              version: { increment: 1 },
              ...(creditNoteId ? { creditedAmount: { increment: input.amount } } : {}),
            },
          });
        }

        return mapRefund(refund);
      });
    }),

  delete: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');
        const refund = await tx.refund.findUnique({
          where: { id: input.id },
          select: {
            amount: true,
            notes: true,
            creditNoteId: true,
            payment: {
              select: {
                invoice: {
                  select: {
                    id: true,
                    totalAmount: true,
                    creditedAmount: true,
                    paidAmount: true,
                    status: true,
                  },
                },
              },
            },
          },
        });
        if (!refund) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Remboursement non trouvé' });
        }

        if (refund.notes?.startsWith('Avoir '))
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'Ce remboursement clôt une annulation d’inscription et ne peut pas être supprimé isolément',
          });
        if (refund.creditNoteId) {
          const credit = await tx.parentCredit.findFirst({
            where: { creditNoteId: refund.creditNoteId },
            select: { id: true, amountRemaining: true, amountOriginal: true },
          });
          const used = await tx.creditNoteAllocation.count({
            where: { creditNoteId: refund.creditNoteId },
          });
          if (!credit || used > 0 || toNum(credit.amountRemaining) !== toNum(credit.amountOriginal))
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message:
                'Cet avoir a déjà été utilisé : annulez ses imputations avant le remboursement',
            });
          await cancelAccountingEntries(tx, { creditNoteId: refund.creditNoteId }, ctx.user.id);
          await tx.parentCredit.update({ where: { id: credit.id }, data: { amountRemaining: 0 } });
          await tx.invoice.update({
            where: { id: refund.creditNoteId },
            data: { status: 'CANCELLED', pdfUrl: null, version: { increment: 1 } },
          });
        }
        // Cancel associated accounting entries
        await cancelAccountingEntries(tx, { refundId: input.id }, ctx.user.id);

        await tx.refund.delete({ where: { id: input.id } });

        // Symétrique de refunds.create : annuler un remboursement immédiat
        // restitue le montant au payé de la facture.
        if (refund.payment?.invoice) {
          const inv = refund.payment.invoice;
          const newPaidAmount = toNum(inv.paidAmount) + toNum(refund.amount);
          const credited =
            toNum(inv.creditedAmount) - (refund.creditNoteId ? toNum(refund.amount) : 0);
          const newStatus =
            newPaidAmount >= toNum(inv.totalAmount) - credited
              ? 'PAID'
              : inv.status === 'OVERDUE'
                ? 'OVERDUE'
                : 'SENT';
          await tx.invoice.update({
            where: { id: inv.id },
            data: {
              paidAmount: newPaidAmount,
              creditedAmount: credited,
              status: newStatus,
              pdfUrl: null,
              version: { increment: 1 },
            },
          });
        }

        return { success: true };
      });
    }),
});
