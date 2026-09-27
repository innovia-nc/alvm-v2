import { overdueWhere } from '@back/helpers/invoice-status';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, staffProcedure, adminProcedure } from '@back/trpc/trpc.init';
import type { Prisma } from '@prisma/client';
import {
  createPaymentEntries,
  cancelAccountingEntries,
} from '@back/services/accounting.service';
import { restoreCreditOnPaymentDeletion } from '@back/services/credit-application.service';
import { toNum } from '@back/helpers/decimal';
import { generateDocumentNumber } from '@back/helpers/invoice-number';
import { lockTenant } from '@back/db-context';

type InvStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'CREDITED';

// ============================================================================
// SCHEMAS
// ============================================================================

const invoiceStatusEnum = z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED', 'CREDITED']);

const paymentSchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  amount: z.number(),
  paymentDate: z.date(),
  paymentMethodId: z.string().uuid(),
  paymentMethodName: z.string(),
  paymentMethodCode: z.string(),
  creditNoteId: z.string().uuid().nullable(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const paymentWithDetailsSchema = paymentSchema.extend({
  invoice: z.object({
    id: z.string(),
    invoiceNumber: z.string(),
    totalAmount: z.number(),
    paidAmount: z.number(),
    remainingAmount: z.number(),
    status: invoiceStatusEnum,
    parent: z.object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      email: z.string(),
    }),
  }),
  parent: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
  }),
});

const paymentInclude = {
  paymentMethod: { select: { name: true, code: true } },
  invoice: {
    select: {
      id: true,
      invoiceNumber: true,
      totalAmount: true,
      paidAmount: true,
      creditedAmount: true,
      status: true,
      parentId: true,
      parent: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
  },
} as const;

function mapPaymentWithDetails(p: any) {
  const totalAmount = toNum(p.invoice.totalAmount);
  const paidAmount = toNum(p.invoice.paidAmount);
  return {
    id: p.id,
    invoiceId: p.invoiceId,
    amount: toNum(p.amount),
    paymentDate: p.paymentDate,
    paymentMethodId: p.paymentMethodId,
    paymentMethodName: p.paymentMethod?.name || 'Unknown',
    paymentMethodCode: p.paymentMethod?.code || '',
    creditNoteId: p.creditNoteId,
    reference: p.reference,
    notes: p.notes,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    invoice: {
      id: p.invoice.id,
      invoiceNumber: p.invoice.invoiceNumber,
      totalAmount,
      paidAmount,
      remainingAmount: Math.max(0, totalAmount - paidAmount - toNum(p.invoice.creditedAmount)),
      status: p.invoice.status as InvStatus,
      parent: {
        id: p.invoice.parentId,
        firstName: p.invoice.parent.firstName,
        lastName: p.invoice.parent.lastName,
        email: p.invoice.parent.email,
      },
    },
    parent: {
      firstName: p.invoice.parent.firstName,
      lastName: p.invoice.parent.lastName,
      email: p.invoice.parent.email,
    },
  };
}

function mapPayment(p: any) {
  return {
    id: p.id,
    invoiceId: p.invoiceId,
    amount: toNum(p.amount),
    paymentDate: p.paymentDate,
    paymentMethodId: p.paymentMethodId,
    paymentMethodName: p.paymentMethod?.name || 'Unknown',
    paymentMethodCode: p.paymentMethod?.code || '',
    creditNoteId: p.creditNoteId,
    reference: p.reference,
    notes: p.notes,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ============================================================================
// ROUTER
// ============================================================================

export const paymentsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        invoiceId: z.string().uuid().optional(),
        parentId: z.string().uuid().optional(),
        paymentMethodId: z.string().uuid().optional(),
        search: z.string().optional(),
        sortBy: z.enum(['paymentDate', 'amount']).default('paymentDate'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
      }),
    )
    .output(
      z.object({
        payments: z.array(paymentWithDetailsSchema),
        total: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { limit, offset, invoiceId, parentId, paymentMethodId, search, sortBy, sortOrder } =
        input;

      const where: Prisma.PaymentWhereInput = {};

      if (ctx.user.role === 'PARENT') {
        where.invoice = { parentId: ctx.user.id };
      } else if (parentId) {
        where.invoice = { parentId };
      }

      if (invoiceId) where.invoiceId = invoiceId;
      if (paymentMethodId) where.paymentMethodId = paymentMethodId;

      if (search && search.trim().length > 0) {
        const q = search.trim();
        where.OR = [
          { paymentNumber: { contains: q, mode: 'insensitive' } },
          { reference: { contains: q, mode: 'insensitive' } },
          { invoice: { invoiceNumber: { contains: q, mode: 'insensitive' } } },
          { invoice: { parent: { firstName: { contains: q, mode: 'insensitive' } } } },
          { invoice: { parent: { lastName: { contains: q, mode: 'insensitive' } } } },
        ];
      }

      const [payments, total] = await Promise.all([
        ctx.prisma.payment.findMany({
          where,
          include: paymentInclude,
          orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
          take: limit,
          skip: offset,
        }),
        ctx.prisma.payment.count({ where }),
      ]);

      return {
        payments: payments.map(mapPaymentWithDetails),
        total,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(paymentWithDetailsSchema.nullable())
    .query(async ({ ctx, input }) => {
      const where: Prisma.PaymentWhereInput = { id: input.id };

      if (ctx.user.role === 'PARENT') {
        where.invoice = { parentId: ctx.user.id };
      }

      const payment = await ctx.prisma.payment.findFirst({
        where,
        include: paymentInclude,
      });

      return payment ? mapPaymentWithDetails(payment) : null;
    }),

  create: staffProcedure
    .input(
      z.object({
        invoiceId: z.string().uuid(),
        amount: z.number().min(0.01, 'Montant doit être positif'),
        paymentDate: z.string().date(),
        paymentMethodId: z.string().uuid(),
        creditNoteId: z.string().uuid().optional(),
        reference: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .output(paymentSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      return ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');
        // 1. Verify invoice
        const invoice = await tx.invoice.findFirst({
          where: { id: input.invoiceId, invoiceType: 'INVOICE', deletedAt: null },
        });
        if (!invoice) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Facture non trouvée' });
        }

        if (invoice.status === 'CANCELLED') {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: "Impossible d'ajouter un paiement à une facture annulée",
          });
        }
        if (invoice.status === 'DRAFT') {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: "Impossible d'ajouter un paiement à une facture en brouillon",
          });
        }

        // 2. Check remaining amount
        const totalAmount = toNum(invoice.totalAmount);
        const paidAmount = toNum(invoice.paidAmount);
        const remainingAmount = totalAmount - paidAmount - toNum(invoice.creditedAmount);

        if (input.amount > remainingAmount) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Le montant dépasse le reste à payer (${remainingAmount} XPF)`,
          });
        }

        // 3. Handle credit note payment
        const paymentMethod = await tx.paymentMethod.findUnique({
          where: { id: input.paymentMethodId },
          select: { code: true, accountingCode: true, active: true },
        });

        if (!paymentMethod || !paymentMethod.active)
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Méthode de paiement inactive ou inconnue',
          });
        if ((paymentMethod.code === 'CREDIT_NOTE') !== Boolean(input.creditNoteId))
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Un règlement par avoir exige un avoir, réservé à cette méthode',
          });
        if (!['SENT', 'OVERDUE'].includes(invoice.status))
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Facture non payable' });
        let creditNoteIsFutureCredit: boolean | undefined;

        if (paymentMethod?.code === 'CREDIT_NOTE' && input.creditNoteId) {
          const creditNote = await tx.invoice.findFirst({
            where: { id: input.creditNoteId, invoiceType: 'CREDIT_NOTE', deletedAt: null },
          });

          if (!creditNote) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Avoir non trouvé' });
          }
          if (creditNote.status !== 'SENT') {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: "Impossible d'utiliser un avoir annulé",
            });
          }
          if (creditNote.parentId !== invoice.parentId) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: "L'avoir et la facture doivent appartenir au même parent",
            });
          }

          const usableCredit = await tx.parentCredit.findFirst({
            where: { creditNoteId: input.creditNoteId },
          });
          if (usableCredit?.expiresAt && usableCredit.expiresAt <= new Date())
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Avoir expiré' });
          if (usableCredit && toNum(usableCredit.amountRemaining) < input.amount)
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Solde de crédit insuffisant' });
          // Check available balance
          const allocations = await tx.creditNoteAllocation.aggregate({
            where: { creditNoteId: input.creditNoteId },
            _sum: { amount: true },
          });
          const usedAmount = toNum(allocations._sum.amount);
          const availableBalance = Math.abs(toNum(creditNote.totalAmount)) - usedAmount;

          if (input.amount > availableBalance) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Le montant dépasse le solde disponible de l'avoir (${availableBalance} XPF)`,
            });
          }

          await tx.creditNoteAllocation.upsert({
            where: {
              creditNoteId_appliedToInvoiceId: {
                creditNoteId: input.creditNoteId,
                appliedToInvoiceId: input.invoiceId,
              },
            },
            update: { amount: { increment: input.amount } },
            create: {
              creditNoteId: input.creditNoteId,
              appliedToInvoiceId: input.invoiceId,
              amount: input.amount,
              notes: input.notes || null,
              recordedBy: userId,
            },
          });

          // Le solde d'un avoir se lisait jusqu'ici de DEUX façons divergentes :
          // ce chemin manuel agrégeait les `CreditNoteAllocation`, tandis que
          // l'imputation automatique (US-FACT-02) s'appuie sur
          // `ParentCredit.amountRemaining` — que ce chemin ne décrémentait pas.
          // Un avoir consommé à la main restait donc « plein » pour le FIFO, qui
          // pouvait le réimputer sur une autre facture : le compte 4191 se
          // retrouvait débité de plus qu'il n'avait été crédité.
          // Les deux vues sont désormais tenues à jour par les deux chemins.
          const parentCredit = await tx.parentCredit.findFirst({
            where: { creditNoteId: input.creditNoteId },
          });

          if (parentCredit) {
            const remaining = toNum(parentCredit.amountRemaining);

            await tx.parentCredit.update({
              where: { id: parentCredit.id },
              // Plancher à 0 plutôt qu'une erreur : le garde-fou du chemin
              // manuel reste le solde calculé sur les allocations (ci-dessus,
              // comportement inchangé). Ce plancher évite qu'un écart hérité
              // ne bloque une saisie légitime.
              data: { amountRemaining: Math.max(0, remaining - input.amount) },
            });

            // Historique uniforme quel que soit le chemin d'imputation.
            await tx.creditApplication.create({
              data: {
                parentCreditId: parentCredit.id,
                invoiceId: input.invoiceId,
                amountUsed: input.amount,
                appliedBy: userId,
                notes: input.notes || `Imputation manuelle sur la facture ${invoice.invoiceNumber}`,
              },
            });
          }

          creditNoteIsFutureCredit = creditNote.isFutureCredit ?? false;
        }

        // 4. Create payment
        const paymentNumber = await generateDocumentNumber(tx, 'PAYMENT');
        const payment = await tx.payment.create({
          data: {
            paymentNumber,
            invoiceId: input.invoiceId,
            amount: input.amount,
            paymentDate: new Date(input.paymentDate),
            paymentMethodId: input.paymentMethodId,
            creditNoteId: input.creditNoteId || null,
            reference: input.reference || null,
            notes: input.notes || null,
            recordedBy: userId,
          },
          include: { paymentMethod: { select: { name: true, code: true } } },
        });

        // 5. Update invoice paid_amount and status
        const newPaidAmount = paidAmount + input.amount;
        const newStatus =
          newPaidAmount >= totalAmount - toNum(invoice.creditedAmount) ? 'PAID' : invoice.status;

        await tx.invoice.update({
          where: { id: input.invoiceId },
          data: {
            paidAmount: newPaidAmount,
            status: newStatus,
            pdfUrl: null,
            version: { increment: 1 },
          },
        });

        // 6. Generate accounting entries (journal BQ)
        await createPaymentEntries(tx, {
          paymentId: payment.id,
          invoiceId: input.invoiceId,
          parentId: invoice.parentId,
          amount: input.amount,
          paymentDate: new Date(input.paymentDate),
          paymentMethodCode: paymentMethod?.code || '',
          paymentMethodAccountingCode: paymentMethod?.accountingCode || '512000',
          invoiceNumber: invoice.invoiceNumber ?? '',
          creditNoteIsFutureCredit,
          userId,
        });

        return mapPayment(payment);
      });
    }),

  delete: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');
        const payment = await tx.payment.findUnique({
          where: { id: input.id },
        });
        if (!payment) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Paiement non trouvé' });
        }

        // Check for refunds
        const refundCount = await tx.refund.count({
          where: { paymentId: input.id, deletedAt: null },
        });
        if (refundCount > 0) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: `Impossible de supprimer ce paiement car il est lié à ${refundCount} remboursement(s)`,
          });
        }

        // Cancel associated accounting entries
        await cancelAccountingEntries(tx, { paymentId: input.id }, ctx.user.id);

        // TD-003 — restituer le crédit avant de supprimer le paiement.
        // Supprimer un règlement par avoir annulait bien les écritures, mais
        // laissait l'avoir compté comme consommé : ni l'allocation, ni
        // l'application, ni le solde n'étaient repris.
        if (payment.creditNoteId) {
          await restoreCreditOnPaymentDeletion(tx, {
            creditNoteId: payment.creditNoteId,
            invoiceId: payment.invoiceId,
            amount: toNum(payment.amount),
          });
        }

        // Delete payment
        await tx.payment.delete({ where: { id: input.id } });

        // Recalculate invoice paid_amount
        const sumResult = await tx.payment.aggregate({
          where: { invoiceId: payment.invoiceId },
          _sum: { amount: true },
        });

        const invoice = await tx.invoice.findUniqueOrThrow({
          where: { id: payment.invoiceId },
        });

        const refundSum = await tx.refund.aggregate({
          where: { payment: { invoiceId: payment.invoiceId }, deletedAt: null },
          _sum: { amount: true },
        });
        const newPaidAmount = toNum(sumResult._sum.amount) - toNum(refundSum._sum.amount);
        const totalAmount = toNum(invoice.totalAmount);
        const newStatus =
          newPaidAmount >= totalAmount - toNum(invoice.creditedAmount)
            ? 'PAID'
            : invoice.status === 'OVERDUE'
              ? 'OVERDUE'
              : 'SENT';

        await tx.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            paidAmount: newPaidAmount,
            status: newStatus,
            pdfUrl: null,
            version: { increment: 1 },
          },
        });

        return { success: true };
      });
    }),

  statistics: adminProcedure
    .input(
      z.object({
        startDate: z.string().date().optional(),
        endDate: z.string().date().optional(),
      }),
    )
    .output(
      z.object({
        totalPaid: z.number(),
        totalPending: z.number(),
        totalOverdue: z.number(),
        paymentsByMethod: z.array(
          z.object({
            method: z.string(),
            total: z.number(),
            count: z.number(),
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      const dateWhere: Prisma.PaymentWhereInput = {};
      if (input.startDate) dateWhere.paymentDate = { gte: new Date(input.startDate) };
      if (input.endDate) {
        dateWhere.paymentDate = {
          ...(dateWhere.paymentDate as any),
          lte: new Date(input.endDate),
        };
      }

      // Total paid
      const paidResult = await ctx.prisma.payment.aggregate({
        where: dateWhere,
        _sum: { amount: true },
      });

      // Total pending
      const pendingResult = await ctx.prisma.invoice.aggregate({
        where: { status: { in: ['SENT', 'DRAFT'] }, deletedAt: null },
        _sum: { totalAmount: true, paidAmount: true, creditedAmount: true },
      });

      // Total overdue
      const overdueResult = await ctx.prisma.invoice.aggregate({
        where: { ...overdueWhere(), invoiceType: 'INVOICE', deletedAt: null },
        _sum: { totalAmount: true, paidAmount: true, creditedAmount: true },
      });

      // By payment method
      const payments = await ctx.prisma.payment.findMany({
        where: dateWhere,
        include: { paymentMethod: { select: { name: true } } },
      });

      const byMethodMap = new Map<string, { total: number; count: number }>();
      for (const p of payments) {
        const method = p.paymentMethod.name;
        const existing = byMethodMap.get(method) || { total: 0, count: 0 };
        existing.total += toNum(p.amount);
        existing.count++;
        byMethodMap.set(method, existing);
      }

      const paymentsByMethod = Array.from(byMethodMap.entries())
        .map(([method, data]) => ({ method, ...data }))
        .sort((a, b) => b.total - a.total);

      return {
        totalPaid: toNum(paidResult._sum.amount),
        totalPending:
          toNum(pendingResult._sum.totalAmount) -
          toNum(pendingResult._sum.paidAmount) -
          toNum(pendingResult._sum.creditedAmount),
        totalOverdue:
          toNum(overdueResult._sum.totalAmount) -
          toNum(overdueResult._sum.paidAmount) -
          toNum(overdueResult._sum.creditedAmount),
        paymentsByMethod,
      };
    }),
});
