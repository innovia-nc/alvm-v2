import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  router,
  protectedProcedure,
  staffProcedure,
  adminProcedure,
} from '@/server/trpc/init';
import type { Prisma } from '@prisma/client';
import { getTaxRateDecimal, getDefaultDueDate, getCreditExpiryDate } from '@/server/helpers/settings';
import { toNum } from '@/server/helpers/decimal';
import { createCreditNoteAccountingEntries } from '@/server/services/accounting.service';

type CreditNoteStatus = 'DRAFT' | 'SENT' | 'CANCELLED';

// ============================================================================
// SCHEMAS
// ============================================================================

const creditNoteStatusEnum = z.enum(['DRAFT', 'SENT', 'CANCELLED']);
const refundMethodEnum = z.enum(['IMMEDIATE_REFUND', 'FUTURE_CREDIT']);

const creditNoteLineSchema = z.object({
  id: z.string().uuid(),
  creditNoteId: z.string().uuid(),
  registrationId: z.string().uuid().nullable(),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  totalHt: z.number(),
});

const creditNoteSchema = z.object({
  id: z.string().uuid(),
  creditNoteNumber: z.string(),
  creditedInvoiceId: z.string().uuid().nullable(),
  parentId: z.string().uuid(),
  issueDate: z.date(),
  subtotalHt: z.number(),
  taxRate: z.number(),
  taxAmount: z.number(),
  totalAmount: z.number(),
  refundMethod: refundMethodEnum.nullable(),
  status: creditNoteStatusEnum,
  isFutureCredit: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const creditNoteWithDetailsSchema = creditNoteSchema.extend({
  originalInvoice: z.object({
    invoiceNumber: z.string(),
    totalAmount: z.number(),
    status: z.string(),
  }).nullable(),
  parent: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
  }),
  lines: z.array(creditNoteLineSchema),
  availableCredit: z.number().nullable(),
});

const creditNoteInclude = {
  creditedInvoice: {
    select: { invoiceNumber: true, totalAmount: true, status: true },
  },
  parent: {
    select: { firstName: true, lastName: true, email: true },
  },
  lines: {
    select: {
      id: true,
      invoiceId: true,
      registrationId: true,
      description: true,
      quantity: true,
      unitPrice: true,
      totalHt: true,
    },
  },
  parentCredits: {
    select: { amountRemaining: true },
    take: 1,
  },
} as const;

function mapCreditNoteWithDetails(cn: any) {
  return {
    id: cn.id,
    creditNoteNumber: cn.invoiceNumber,
    creditedInvoiceId: cn.creditedInvoiceId,
    parentId: cn.parentId,
    issueDate: cn.issueDate,
    subtotalHt: toNum(cn.subtotalHt),
    taxRate: toNum(cn.taxRate),
    taxAmount: toNum(cn.taxAmount),
    totalAmount: toNum(cn.totalAmount),
    refundMethod: cn.refundMethod as 'IMMEDIATE_REFUND' | 'FUTURE_CREDIT' | null,
    status: cn.status as CreditNoteStatus,
    isFutureCredit: cn.isFutureCredit ?? false,
    notes: cn.notes,
    createdAt: cn.createdAt,
    updatedAt: cn.updatedAt,
    originalInvoice: cn.creditedInvoice
      ? {
          invoiceNumber: cn.creditedInvoice.invoiceNumber,
          totalAmount: toNum(cn.creditedInvoice.totalAmount),
          status: cn.creditedInvoice.status as string,
        }
      : null,
    parent: cn.parent,
    lines: (cn.lines || []).map((l: any) => ({
      id: l.id,
      creditNoteId: l.invoiceId,
      registrationId: l.registrationId,
      description: l.description,
      quantity: l.quantity,
      unitPrice: toNum(l.unitPrice),
      totalHt: toNum(l.totalHt),
    })),
    availableCredit: cn.parentCredits?.[0]
      ? toNum(cn.parentCredits[0].amountRemaining)
      : null,
  };
}

function mapCreditNote(cn: any) {
  return {
    id: cn.id,
    creditNoteNumber: cn.invoiceNumber,
    creditedInvoiceId: cn.creditedInvoiceId,
    parentId: cn.parentId,
    issueDate: cn.issueDate,
    subtotalHt: toNum(cn.subtotalHt),
    taxRate: toNum(cn.taxRate),
    taxAmount: toNum(cn.taxAmount),
    totalAmount: toNum(cn.totalAmount),
    refundMethod: cn.refundMethod as 'IMMEDIATE_REFUND' | 'FUTURE_CREDIT' | null,
    status: cn.status as CreditNoteStatus,
    isFutureCredit: cn.isFutureCredit ?? false,
    notes: cn.notes,
    createdAt: cn.createdAt,
    updatedAt: cn.updatedAt,
  };
}

// ============================================================================
// ROUTER
// ============================================================================

export const creditNotesRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
      creditedInvoiceId: z.string().uuid().optional(),
      parentId: z.string().uuid().optional(),
      status: creditNoteStatusEnum.optional(),
      refundMethod: refundMethodEnum.optional(),
      sortBy: z.enum(['creditNoteNumber', 'issueDate', 'totalAmount']).default('issueDate'),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
    }))
    .output(z.object({
      creditNotes: z.array(creditNoteWithDetailsSchema),
      total: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const { limit, offset, creditedInvoiceId, parentId, status, refundMethod, sortBy, sortOrder } = input;

      const where: Prisma.InvoiceWhereInput = {
        invoiceType: 'CREDIT_NOTE',
        deletedAt: null,
      };

      if (ctx.user.role === 'PARENT') {
        where.parentId = ctx.user.id;
      } else if (parentId) {
        where.parentId = parentId;
      }

      if (creditedInvoiceId) where.creditedInvoiceId = creditedInvoiceId;
      if (status) where.status = status;
      if (refundMethod) where.refundMethod = refundMethod;

      const sortMap: Record<string, string> = {
        creditNoteNumber: 'invoiceNumber',
        issueDate: 'issueDate',
        totalAmount: 'totalAmount',
      };

      const [creditNotes, total] = await Promise.all([
        ctx.prisma.invoice.findMany({
          where,
          include: creditNoteInclude,
          orderBy: { [sortMap[sortBy]]: sortOrder },
          take: limit,
          skip: offset,
        }),
        ctx.prisma.invoice.count({ where }),
      ]);

      return {
        creditNotes: creditNotes.map(mapCreditNoteWithDetails),
        total,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(creditNoteWithDetailsSchema.nullable())
    .query(async ({ ctx, input }) => {
      const where: Prisma.InvoiceWhereInput = {
        id: input.id,
        invoiceType: 'CREDIT_NOTE',
        deletedAt: null,
      };

      if (ctx.user.role === 'PARENT') {
        where.parentId = ctx.user.id;
      }

      const cn = await ctx.prisma.invoice.findFirst({
        where,
        include: creditNoteInclude,
      });

      return cn ? mapCreditNoteWithDetails(cn) : null;
    }),

  create: staffProcedure
    .input(z.object({
      creditedInvoiceId: z.string().uuid().optional(),
      parentId: z.string().uuid(),
      refundMethod: refundMethodEnum,
      reason: z.string().min(10),
      lines: z.array(z.object({
        registrationId: z.string().uuid().nullable(),
        description: z.string().min(3),
        quantity: z.number().min(1),
        unitPrice: z.number().min(0),
      })).min(1, 'Au moins une ligne requise'),
    }))
    .output(creditNoteSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        // Verify original invoice if provided
        if (input.creditedInvoiceId) {
          const origInvoice = await tx.invoice.findFirst({
            where: { id: input.creditedInvoiceId, invoiceType: 'INVOICE', deletedAt: null },
          });
          if (!origInvoice) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Facture originale non trouvee' });
          }
          if (origInvoice.parentId !== input.parentId) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: "Le parent de l'avoir doit correspondre a celui de la facture",
            });
          }
        }

        // Calculate amounts
        let subtotalHt = 0;
        for (const line of input.lines) {
          subtotalHt += line.quantity * line.unitPrice;
        }
        const taxRate = await getTaxRateDecimal(tx);
        const taxAmount = subtotalHt * taxRate;
        const totalAmount = subtotalHt + taxAmount;

        // Create the credit note (invoiceNumber generated by DB trigger)
        const dueDate = await getDefaultDueDate(tx);
        const cn = await tx.invoice.create({
          data: {
            parentId: input.parentId,
            invoiceType: 'CREDIT_NOTE',
            status: 'DRAFT',
            creditedInvoiceId: input.creditedInvoiceId || null,
            issueDate: new Date(),
            dueDate,
            subtotalHt: -Math.abs(subtotalHt),
            taxRate,
            taxAmount: -Math.abs(taxAmount),
            totalAmount: -Math.abs(totalAmount),
            refundMethod: input.refundMethod,
            isFutureCredit: input.refundMethod === 'FUTURE_CREDIT',
            notes: input.reason,
          },
        });

        // Create lines
        for (const line of input.lines) {
          const lineTotal = line.quantity * line.unitPrice;
          await tx.invoiceLine.create({
            data: {
              invoiceId: cn.id,
              registrationId: line.registrationId,
              description: line.description,
              quantity: line.quantity,
              unitPrice: Math.abs(line.unitPrice),
              totalPrice: Math.abs(lineTotal),
              totalHt: -Math.abs(lineTotal),
            },
          });
        }

        return mapCreditNote(cn);
      });
    }),

  updateStatus: staffProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: creditNoteStatusEnum,
    }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const cn = await tx.invoice.findFirst({
          where: { id: input.id, invoiceType: 'CREDIT_NOTE', deletedAt: null },
        });
        if (!cn) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Avoir non trouve' });
        }

        const validTransitions: Record<string, string[]> = {
          DRAFT: ['SENT', 'CANCELLED'],
          SENT: ['CANCELLED'],
          CANCELLED: [],
        };

        if (!validTransitions[cn.status]?.includes(input.status)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Transition de ${cn.status} vers ${input.status} non autorisee`,
          });
        }

        await tx.invoice.update({
          where: { id: input.id },
          data: { status: input.status },
        });

        // If transitioning to SENT, create accounting entries (VE)
        if (input.status === 'SENT') {
          // Resolve accountingCode from the first line's registration → camp → campType
          let accountingCode = '706000';
          const firstLine = await tx.invoiceLine.findFirst({
            where: { invoiceId: input.id, registrationId: { not: null } },
            select: {
              registration: {
                select: {
                  camp: {
                    select: {
                      campType: {
                        select: { accountingCode: true },
                      },
                    },
                  },
                },
              },
            },
          });
          if (firstLine?.registration?.camp?.campType?.accountingCode) {
            accountingCode = firstLine.registration.camp.campType.accountingCode;
          }

          await createCreditNoteAccountingEntries(tx, {
            creditNoteId: cn.id,
            parentId: cn.parentId,
            creditNoteNumber: cn.invoiceNumber,
            issueDate: cn.issueDate,
            subtotalHt: Math.abs(toNum(cn.subtotalHt)),
            taxAmount: Math.abs(toNum(cn.taxAmount)),
            totalAmount: Math.abs(toNum(cn.totalAmount)),
            taxRate: toNum(cn.taxRate),
            accountingCode,
            isFutureCredit: cn.isFutureCredit ?? false,
            userId: ctx.user.id,
          });
        }

        // If transitioning to SENT and is future credit, create parent_credits entry
        if (input.status === 'SENT' && cn.isFutureCredit) {
          const existing = await tx.parentCredit.findFirst({
            where: { creditNoteId: input.id },
          });

          if (!existing) {
            const expiresAt = await getCreditExpiryDate(tx);

            await tx.parentCredit.create({
              data: {
                parentId: cn.parentId,
                creditNoteId: input.id,
                amountOriginal: Math.abs(toNum(cn.totalAmount)),
                amountRemaining: Math.abs(toNum(cn.totalAmount)),
                expiresAt,
                notes: 'Credit disponible suite a avoir',
              },
            });
          }
        }

        return { success: true };
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const cn = await ctx.prisma.invoice.findFirst({
        where: { id: input.id, invoiceType: 'CREDIT_NOTE', deletedAt: null },
      });
      if (!cn) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Avoir non trouve' });
      }
      if (cn.status !== 'DRAFT') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Seuls les avoirs en brouillon peuvent etre supprimes',
        });
      }

      await ctx.prisma.invoice.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });

      return { success: true };
    }),
});
