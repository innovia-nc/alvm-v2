import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  router,
  protectedProcedure,
  staffProcedure,
} from '@/server/trpc/init';
import type { Prisma, RegistrationStatus } from '@prisma/client';
import { getCreditExpiryDate } from '@/server/helpers/settings';
import { computeDaysCount } from '@/server/helpers/date';
import { toNum } from '@/server/helpers/decimal';
import { createCreditNoteAccountingEntries } from '@/server/services/accounting.service';
import { generateInvoiceNumber, generateDocumentNumber } from '@/server/helpers/invoice-number';

type RegStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'WAITLIST';
type CampStat = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED';

// ============================================================================
// SCHEMAS
// ============================================================================

const registrationStatusEnum = z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'WAITLIST']);
const campStatusEnum = z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED']);

const registrationSchema = z.object({
  id: z.string().uuid(),
  campId: z.string().uuid(),
  childId: z.string().uuid(),
  parentId: z.string().uuid(),
  status: registrationStatusEnum,
  registrationDate: z.date(),
  specialRequirements: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const registrationWithDetailsSchema = registrationSchema.extend({
  camp: z.object({
    id: z.string().uuid(),
    name: z.string(),
    location: z.string(),
    startDate: z.date().nullable(),
    endDate: z.date().nullable(),
    daysCount: z.number(),
    pricePerDay: z.number(),
    registrationDeadline: z.date(),
    status: campStatusEnum,
  }),
  child: z.object({
    id: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
    birthDate: z.date(),
  }),
  parent: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    phone: z.string(),
  }),
  totalAmount: z.number(),
  invoiceId: z.string().uuid().nullable(),
  invoiceNumber: z.string().nullable(),
  invoiceStatus: z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED', 'CREDITED']).nullable(),
});

const registrationInclude = {
  camp: {
    select: {
      id: true,
      name: true,
      location: true,
      startDate: true,
      endDate: true,
      pricePerDay: true,
      registrationDeadline: true,
      status: true,
    },
  },
  child: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      birthDate: true,
    },
  },
  parent: {
    select: {
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    },
  },
  invoiceLines: {
    where: { deletedAt: null, invoice: { deletedAt: null } },
    select: {
      invoiceId: true,
      invoice: { select: { status: true, invoiceNumber: true } },
    },
    take: 1,
  },
} as const;

function mapRegistrationWithDetails(r: any) {
  const daysCount = computeDaysCount(r.camp.startDate, r.camp.endDate);
  const pricePerDay = toNum(r.camp.pricePerDay);
  return {
    id: r.id,
    campId: r.campId,
    childId: r.childId,
    parentId: r.parentId,
    status: r.status as RegStatus,
    registrationDate: r.registrationDate,
    specialRequirements: r.specialRequirements,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    camp: {
      id: r.camp.id,
      name: r.camp.name,
      location: r.camp.location,
      startDate: r.camp.startDate,
      endDate: r.camp.endDate,
      daysCount,
      pricePerDay,
      registrationDeadline: r.camp.registrationDeadline,
      status: r.camp.status as CampStat,
    },
    child: {
      id: r.child.id,
      firstName: r.child.firstName,
      lastName: r.child.lastName,
      birthDate: r.child.birthDate,
    },
    parent: {
      firstName: r.parent.firstName,
      lastName: r.parent.lastName,
      email: r.parent.email,
      phone: r.parent.phone,
    },
    totalAmount: daysCount * pricePerDay,
    invoiceId: r.invoiceLines?.[0]?.invoiceId ?? null,
    invoiceNumber: r.invoiceLines?.[0]?.invoice?.invoiceNumber ?? null,
    invoiceStatus: r.invoiceLines?.[0]?.invoice?.status ?? null,
  };
}

function mapRegistration(r: any) {
  return {
    id: r.id,
    campId: r.campId,
    childId: r.childId,
    parentId: r.parentId,
    status: r.status as RegStatus,
    registrationDate: r.registrationDate,
    specialRequirements: r.specialRequirements,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ============================================================================
// ROUTER
// ============================================================================

export const registrationsRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
      campId: z.string().uuid().optional(),
      childId: z.string().uuid().optional(),
      status: registrationStatusEnum.optional(),
      search: z.string().optional(),
      sortBy: z.enum(['registrationDate', 'childName', 'status']).default('registrationDate'),
      sortOrder: z.enum(['asc', 'desc']).default('asc'),
    }))
    .output(z.object({
      registrations: z.array(registrationWithDetailsSchema),
      total: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const { limit, offset, campId, childId, status, search, sortBy, sortOrder } = input;

      const where: Prisma.RegistrationWhereInput = { deletedAt: null };

      if (ctx.user.role === 'PARENT') {
        where.parentId = ctx.user.id;
      }

      if (campId) where.campId = campId;
      if (childId) where.childId = childId;
      if (status) where.status = status;

      if (search) {
        where.OR = [
          { child: { firstName: { contains: search, mode: 'insensitive' } } },
          { child: { lastName: { contains: search, mode: 'insensitive' } } },
          { parent: { firstName: { contains: search, mode: 'insensitive' } } },
          { parent: { lastName: { contains: search, mode: 'insensitive' } } },
          { parent: { email: { contains: search, mode: 'insensitive' } } },
          { camp: { name: { contains: search, mode: 'insensitive' } } },
        ];
      }

      const orderByMap: Record<string, Prisma.RegistrationOrderByWithRelationInput> = {
        registrationDate: { registrationDate: sortOrder },
        childName: { child: { lastName: sortOrder } },
        status: { status: sortOrder },
      };

      const [registrations, total] = await Promise.all([
        ctx.prisma.registration.findMany({
          where,
          include: registrationInclude,
          orderBy: orderByMap[sortBy],
          take: limit,
          skip: offset,
        }),
        ctx.prisma.registration.count({ where }),
      ]);

      return {
        registrations: registrations.map(mapRegistrationWithDetails),
        total,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(registrationWithDetailsSchema.nullable())
    .query(async ({ ctx, input }) => {
      const where: Prisma.RegistrationWhereInput = {
        id: input.id,
        deletedAt: null,
      };

      if (ctx.user.role === 'PARENT') {
        where.parentId = ctx.user.id;
      }

      const registration = await ctx.prisma.registration.findFirst({
        where,
        include: registrationInclude,
      });

      return registration ? mapRegistrationWithDetails(registration) : null;
    }),

  create: protectedProcedure
    .input(z.object({
      campId: z.string().uuid(),
      childId: z.string().uuid(),
      parentId: z.string().uuid().optional(),
      specialRequirements: z.string().optional(),
    }))
    .output(registrationSchema)
    .mutation(async ({ ctx, input }) => {
      const parentId = input.parentId || ctx.user.id;

      // 1. Verify child exists and belongs to parent
      const childLink = await ctx.prisma.childParent.findFirst({
        where: {
          childId: input.childId,
          parentId,
          child: { deletedAt: null },
        },
      });
      if (!childLink) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Enfant non trouvé ou ne correspond pas au parent spécifié',
        });
      }

      // 2. Verify camp is published and open for registration
      const camp = await ctx.prisma.camp.findFirst({
        where: { id: input.campId, deletedAt: null },
        select: {
          id: true,
          status: true,
          registrationDeadline: true,
          maxCapacity: true,
          _count: {
            select: {
              registrations: {
                where: { status: 'CONFIRMED', deletedAt: null },
              },
            },
          },
        },
      });
      if (!camp) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Camp non trouvé' });
      }

      if (camp.status !== 'PUBLISHED') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: "Ce camp n'est pas encore ouvert aux inscriptions",
        });
      }

      if (camp.registrationDeadline < new Date()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: "La date limite d'inscription est dépassée",
        });
      }

      // 3. Check no existing registration for this child at this camp
      const existing = await ctx.prisma.registration.findFirst({
        where: { campId: input.campId, childId: input.childId, deletedAt: null },
      });
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Cet enfant est déjà inscrit à ce camp',
        });
      }

      // 4. Get all camp_days for selected_days
      const campDays = await ctx.prisma.campDay.findMany({
        where: { campId: input.campId },
        select: { id: true },
        orderBy: { date: 'asc' },
      });
      const selectedDays = campDays.map((d) => d.id);

      // 5. Determine initial status
      const initialStatus: RegistrationStatus =
        camp._count.registrations >= camp.maxCapacity ? 'WAITLIST' : 'PENDING';

      // 6. Create registration
      const registration = await ctx.prisma.registration.create({
        data: {
          campId: input.campId,
          childId: input.childId,
          parentId,
          status: initialStatus,
          specialRequirements: input.specialRequirements || null,
          selectedDays,
          paymentStatus: 'UNPAID',
        },
      });

      return mapRegistration(registration);
    }),

  createByStaff: staffProcedure
    .input(z.object({
      campId: z.string().uuid(),
      childId: z.string().uuid(),
      parentId: z.string().uuid(),
      specialRequirements: z.string().optional(),
      status: z.enum(['PENDING', 'CONFIRMED', 'WAITLIST']).default('PENDING'),
    }))
    .output(registrationSchema)
    .mutation(async ({ ctx, input }) => {
      // 1. Verify child belongs to parent
      const childLink = await ctx.prisma.childParent.findFirst({
        where: {
          childId: input.childId,
          parentId: input.parentId,
          child: { deletedAt: null },
        },
      });
      if (!childLink) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Enfant non trouvé ou ne correspond pas au parent spécifié',
        });
      }

      // 2. Verify camp exists
      const camp = await ctx.prisma.camp.findFirst({
        where: { id: input.campId, deletedAt: null },
      });
      if (!camp) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Camp non trouvé' });
      }

      // 3. Check no duplicate
      const existing = await ctx.prisma.registration.findFirst({
        where: { campId: input.campId, childId: input.childId, deletedAt: null },
      });
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Cet enfant est déjà inscrit à ce camp',
        });
      }

      // 4. Get camp_days for selected_days
      const campDays = await ctx.prisma.campDay.findMany({
        where: { campId: input.campId },
        select: { id: true },
        orderBy: { date: 'asc' },
      });
      const selectedDays = campDays.map((d) => d.id);

      // 5. Create with staff-specified status
      const registration = await ctx.prisma.registration.create({
        data: {
          campId: input.campId,
          childId: input.childId,
          parentId: input.parentId,
          status: input.status,
          specialRequirements: input.specialRequirements || null,
          selectedDays,
          paymentStatus: 'UNPAID',
        },
      });

      return mapRegistration(registration);
    }),

  updateByStaff: staffProcedure
    .input(z.object({
      id: z.string().uuid(),
      specialRequirements: z.string().optional(),
      status: registrationStatusEnum.optional(),
    }))
    .output(registrationSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const existing = await ctx.prisma.registration.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscription non trouvée' });
      }

      if (existing.paymentStatus === 'PAID') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Cette inscription a déjà été payée et ne peut plus être modifiée',
        });
      }

      const data: Prisma.RegistrationUpdateInput = {};
      if (updates.specialRequirements !== undefined) data.specialRequirements = updates.specialRequirements || null;
      if (updates.status !== undefined) data.status = updates.status;

      if (Object.keys(data).length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucune modification fournie' });
      }

      const registration = await ctx.prisma.registration.update({
        where: { id },
        data,
      });

      return mapRegistration(registration);
    }),

  updateStatus: staffProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(['CONFIRMED', 'CANCELLED', 'WAITLIST']),
    }))
    .output(registrationSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.registration.findFirst({
        where: { id: input.id, deletedAt: null },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscription non trouvée' });
      }

      // Confirmer une inscription payée est légitime (le paiement vaut
      // engagement) — sans quoi une inscription facturée en PENDING ne peut
      // plus jamais être confirmée ni pointée en présence (deadlock détecté
      // par la campagne smoke 2026-07-06). Annulation/waitlist restent
      // bloquées ici : l'annulation d'une inscription payée passe par
      // cancelWithAccounting (remboursement/avoir).
      if (existing.paymentStatus === 'PAID' && input.status !== 'CONFIRMED') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Cette inscription a déjà été payée : seule la confirmation est possible (annulation via le parcours remboursement)',
        });
      }

      const registration = await ctx.prisma.registration.update({
        where: { id: input.id },
        data: { status: input.status },
      });

      // Promote waitlisted registration when a spot opens
      if (input.status === 'CANCELLED') {
        const nextInLine = await ctx.prisma.registration.findFirst({
          where: {
            campId: existing.campId,
            status: 'WAITLIST',
            deletedAt: null,
          },
          orderBy: { createdAt: 'asc' },
        });
        if (nextInLine) {
          await ctx.prisma.registration.update({
            where: { id: nextInLine.id },
            data: { status: 'PENDING' },
          });
        }
      }

      return mapRegistration(registration);
    }),

  analyzeRegistrationStatus: staffProcedure
    .input(z.object({ registrationId: z.string().uuid() }))
    .output(z.object({
      hasInvoice: z.boolean(),
      invoiceStatus: z.string().nullable(),
      totalAmount: z.number(),
      paidAmount: z.number(),
      suggestedCase: z.enum([
        'NO_INVOICE',
        'DRAFT_INVOICE',
        'SENT_UNPAID',
        'PARTIALLY_PAID',
        'FULLY_PAID',
      ]),
      requiredSteps: z.number(),
      requiresRefundChoice: z.boolean(),
      requiresPaymentMethod: z.boolean(),
    }))
    .query(async ({ ctx, input }) => {
      const reg = await ctx.prisma.registration.findFirst({
        where: { id: input.registrationId, deletedAt: null },
      });
      if (!reg) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscription non trouvée' });
      }

      if (reg.status !== 'CONFIRMED') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Seules les inscriptions confirmées peuvent être analysées pour annulation',
        });
      }

      // Find associated invoice via invoice_lines
      const invoice = await ctx.prisma.invoice.findFirst({
        where: {
          invoiceType: 'INVOICE',
          deletedAt: null,
          lines: {
            some: { registrationId: input.registrationId },
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          totalAmount: true,
          paidAmount: true,
        },
      });

      if (!invoice) {
        return {
          hasInvoice: false,
          invoiceStatus: null,
          totalAmount: 0,
          paidAmount: 0,
          suggestedCase: 'NO_INVOICE' as const,
          requiredSteps: 2,
          requiresRefundChoice: false,
          requiresPaymentMethod: false,
        };
      }

      const totalAmount = toNum(invoice.totalAmount);
      const paidAmount = toNum(invoice.paidAmount);

      if (invoice.status === 'DRAFT') {
        return {
          hasInvoice: true,
          invoiceStatus: 'DRAFT',
          totalAmount,
          paidAmount: 0,
          suggestedCase: 'DRAFT_INVOICE' as const,
          requiredSteps: 2,
          requiresRefundChoice: false,
          requiresPaymentMethod: false,
        };
      }

      if (invoice.status === 'SENT' && paidAmount === 0) {
        return {
          hasInvoice: true,
          invoiceStatus: 'SENT',
          totalAmount,
          paidAmount: 0,
          suggestedCase: 'SENT_UNPAID' as const,
          requiredSteps: 2,
          requiresRefundChoice: false,
          requiresPaymentMethod: false,
        };
      }

      if (paidAmount > 0 && paidAmount < totalAmount) {
        return {
          hasInvoice: true,
          invoiceStatus: invoice.status as string,
          totalAmount,
          paidAmount,
          suggestedCase: 'PARTIALLY_PAID' as const,
          requiredSteps: 3,
          requiresRefundChoice: true,
          requiresPaymentMethod: false,
        };
      }

      if (paidAmount >= totalAmount) {
        return {
          hasInvoice: true,
          invoiceStatus: invoice.status as string,
          totalAmount,
          paidAmount,
          suggestedCase: 'FULLY_PAID' as const,
          requiredSteps: 4,
          requiresRefundChoice: true,
          requiresPaymentMethod: true,
        };
      }

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'État de facture incohérent',
      });
    }),

  cancelWithAccounting: staffProcedure
    .input(z.object({
      registrationId: z.string().uuid(),
      reason: z.string().min(10, 'Le motif doit contenir au moins 10 caractères'),
      refundChoice: z.enum(['IMMEDIATE_REFUND', 'FUTURE_CREDIT']).optional(),
    }))
    .output(z.object({
      success: z.boolean(),
      case: z.enum([
        'NO_INVOICE',
        'DRAFT_INVOICE',
        'SENT_UNPAID',
        'PARTIALLY_PAID',
        'FULLY_PAID_REFUND',
        'FULLY_PAID_CREDIT',
      ]),
      invoice: z.object({
        id: z.string().uuid(),
        invoiceNumber: z.string(),
        status: z.string(),
        totalAmount: z.number(),
        paidAmount: z.number(),
      }).nullable(),
      creditNote: z.object({
        id: z.string().uuid(),
        invoiceNumber: z.string(),
        amount: z.number(),
      }).nullable(),
      refund: z.object({
        id: z.string().uuid(),
        amount: z.number(),
        method: z.string(),
      }).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      return ctx.prisma.$transaction(async (tx) => {
        // 1. Get the registration with camp -> campType for accountingCode
        const reg = await tx.registration.findFirst({
          where: { id: input.registrationId, deletedAt: null },
          include: {
            camp: {
              select: {
                campType: {
                  select: { accountingCode: true },
                },
              },
            },
          },
        });
        if (!reg) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscription non trouvée' });
        }
        if (reg.status !== 'CONFIRMED') {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Seules les inscriptions confirmées peuvent être annulées avec gestion comptable',
          });
        }

        const accountingCode = reg.camp.campType.accountingCode || '706000';

        // 2. Find associated invoice
        const invoice = await tx.invoice.findFirst({
          where: {
            invoiceType: 'INVOICE',
            deletedAt: null,
            lines: { some: { registrationId: input.registrationId } },
          },
          orderBy: { createdAt: 'desc' },
        });

        let caseType: string;
        let invoiceData: { id: string; invoiceNumber: string; status: string; totalAmount: number; paidAmount: number } | null = null;
        let creditNoteData: { id: string; invoiceNumber: string; amount: number } | null = null;
        let refundData: { id: string; amount: number; method: string } | null = null;

        // Helper: cancel the registration and promote waitlisted
        async function cancelRegistration() {
          const cancelled = await tx.registration.update({
            where: { id: input.registrationId },
            data: {
              status: 'CANCELLED',
              cancellationDate: new Date(),
              cancellationReason: input.reason,
              cancelledBy: userId,
            },
            select: { campId: true },
          });

          // Promote the oldest WAITLIST registration to PENDING
          const nextInLine = await tx.registration.findFirst({
            where: {
              campId: cancelled.campId,
              status: 'WAITLIST',
              deletedAt: null,
            },
            orderBy: { createdAt: 'asc' },
          });
          if (nextInLine) {
            await tx.registration.update({
              where: { id: nextInLine.id },
              data: { status: 'PENDING' },
            });
          }
        }

        // Helper: create credit note from invoice
        async function createCreditNote(inv: typeof invoice, amount?: number) {
          if (!inv) return null;
          const creditAmount = amount ?? toNum(inv.totalAmount);
          const taxRate = toNum(inv.taxRate);
          const subtotalHt = taxRate > 0 ? creditAmount / (1 + taxRate) : creditAmount;
          const taxAmount = creditAmount - subtotalHt;

          const invoiceNumber = await generateInvoiceNumber(tx, 'CREDIT_NOTE');
          const cn = await tx.invoice.create({
            data: {
              invoiceNumber,
              parentId: inv.parentId,
              invoiceType: 'CREDIT_NOTE',
              creditedInvoiceId: inv.id,
              issueDate: new Date(),
              dueDate: new Date(),
              totalAmount: -creditAmount,
              subtotalHt: -subtotalHt,
              taxAmount: -taxAmount,
              taxRate: inv.taxRate,
              status: 'SENT',
              isFutureCredit: false,
            },
          });

          // Generate VE accounting entries for the credit note
          await createCreditNoteAccountingEntries(tx, {
            creditNoteId: cn.id,
            parentId: inv.parentId,
            creditNoteNumber: cn.invoiceNumber,
            issueDate: cn.issueDate,
            subtotalHt,
            taxAmount,
            totalAmount: creditAmount,
            taxRate,
            accountingCode,
            isFutureCredit: false,
            userId,
          });

          return {
            id: cn.id,
            invoiceNumber: cn.invoiceNumber,
            amount: creditAmount,
          };
        }

        // Helper: create future credit note
        async function createFutureCreditNote(inv: typeof invoice, amount: number) {
          if (!inv) return null;
          const taxRate = toNum(inv.taxRate);
          const subtotalHt = taxRate > 0 ? amount / (1 + taxRate) : amount;
          const taxAmount = amount - subtotalHt;

          const expiresAt = await getCreditExpiryDate(tx);

          const invoiceNumber = await generateInvoiceNumber(tx, 'CREDIT_NOTE');
          const cn = await tx.invoice.create({
            data: {
              invoiceNumber,
              parentId: inv.parentId,
              invoiceType: 'CREDIT_NOTE',
              creditedInvoiceId: inv.id,
              issueDate: new Date(),
              dueDate: expiresAt,
              totalAmount: -amount,
              subtotalHt: -subtotalHt,
              taxAmount: -taxAmount,
              taxRate: inv.taxRate,
              status: 'SENT',
              isFutureCredit: true,
            },
          });

          // Generate VE accounting entries for the future credit note
          await createCreditNoteAccountingEntries(tx, {
            creditNoteId: cn.id,
            parentId: inv.parentId,
            creditNoteNumber: cn.invoiceNumber,
            issueDate: cn.issueDate,
            subtotalHt,
            taxAmount,
            totalAmount: amount,
            taxRate,
            accountingCode,
            isFutureCredit: true,
            userId,
          });

          // Create parent credit (trigger no longer does this)
          await tx.parentCredit.create({
            data: {
              parentId: inv.parentId,
              creditNoteId: cn.id,
              amountOriginal: amount,
              amountRemaining: amount,
              expiresAt,
              notes: 'Crédit automatique suite à annulation',
            },
          });

          return {
            id: cn.id,
            invoiceNumber: cn.invoiceNumber,
            amount,
          };
        }

        // Helper: create refunds distributed across payments (most recent first)
        async function createRefund(invoiceId: string, amount: number) {
          const payments = await tx.payment.findMany({
            where: { invoiceId },
            orderBy: { paymentDate: 'desc' },
            include: {
              refunds: { select: { amount: true } },
            },
          });
          if (payments.length === 0) return null;

          let remaining = amount;
          let firstRefund: { id: string; amount: number; method: string } | null = null;

          for (const payment of payments) {
            if (remaining <= 0) break;

            const alreadyRefunded = payment.refunds.reduce(
              (sum, r) => sum + toNum(r.amount), 0,
            );
            const refundable = toNum(payment.amount) - alreadyRefunded;
            if (refundable <= 0) continue;

            const refundAmount = Math.min(remaining, refundable);
            const refundNumber = await generateDocumentNumber(tx, 'REFUND');
            const refund = await tx.refund.create({
              data: {
                refundNumber,
                paymentId: payment.id,
                amount: refundAmount,
                refundDate: new Date(),
                refundMethod: 'IMMEDIATE_REFUND',
                reason: input.reason,
                recordedBy: userId,
              },
            });

            if (!firstRefund) {
              firstRefund = {
                id: refund.id,
                amount: toNum(refund.amount),
                method: refund.refundMethod,
              };
            }

            remaining -= refundAmount;
          }

          return firstRefund;
        }

        // Case 1: No invoice
        if (!invoice) {
          caseType = 'NO_INVOICE';
          await cancelRegistration();
        } else {
          const totalAmount = toNum(invoice.totalAmount);
          const paidAmount = toNum(invoice.paidAmount);

          invoiceData = {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            status: invoice.status,
            totalAmount,
            paidAmount,
          };

          // Case 2: Draft invoice
          if (invoice.status === 'DRAFT') {
            caseType = 'DRAFT_INVOICE';
            await tx.invoice.update({
              where: { id: invoice.id },
              data: { deletedAt: new Date() },
            });
            await cancelRegistration();
          }
          // Case 3: Sent unpaid
          else if (invoice.status === 'SENT' && paidAmount === 0) {
            caseType = 'SENT_UNPAID';
            await tx.invoice.update({
              where: { id: invoice.id },
              data: { status: 'CANCELLED' },
            });
            await cancelRegistration();
          }
          // Case 4: Partially paid
          else if (paidAmount > 0 && paidAmount < totalAmount) {
            caseType = 'PARTIALLY_PAID';
            creditNoteData = await createCreditNote(invoice);
            refundData = await createRefund(invoice.id, paidAmount);
            await cancelRegistration();
          }
          // Case 5: Fully paid
          else if (paidAmount >= totalAmount) {
            const choice = input.refundChoice || 'IMMEDIATE_REFUND';

            if (choice === 'IMMEDIATE_REFUND') {
              caseType = 'FULLY_PAID_REFUND';
              creditNoteData = await createCreditNote(invoice);
              refundData = await createRefund(invoice.id, paidAmount);
            } else {
              caseType = 'FULLY_PAID_CREDIT';
              creditNoteData = await createFutureCreditNote(invoice, paidAmount);
            }
            await cancelRegistration();
          } else {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'État de paiement de la facture incohérent',
            });
          }
        }

        return {
          success: true,
          case: caseType as any,
          invoice: invoiceData,
          creditNote: creditNoteData,
          refund: refundData,
        };
      });
    }),

  delete: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.registration.findFirst({
        where: { id: input.id, deletedAt: null },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscription non trouvée' });
      }

      if (existing.paymentStatus === 'PAID') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Cette inscription a déjà été payée et ne peut plus être supprimée',
        });
      }

      // Check for associated invoices
      const hasInvoice = await ctx.prisma.invoiceLine.findFirst({
        where: {
          registrationId: input.id,
          deletedAt: null,
          invoice: { deletedAt: null },
        },
      });
      if (hasInvoice) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Impossible de supprimer cette inscription : une facture existe',
        });
      }

      await ctx.prisma.registration.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });

      return { success: true };
    }),

  getAvailableCredits: protectedProcedure
    .input(z.object({ parentId: z.string().uuid() }))
    .output(z.object({
      credits: z.array(z.object({
        creditId: z.string().uuid(),
        creditNoteId: z.string().uuid(),
        creditNoteNumber: z.string(),
        amountOriginal: z.number(),
        amountRemaining: z.number(),
        createdAt: z.date(),
        expiresAt: z.date().nullable(),
        daysUntilExpiry: z.number().nullable(),
      })),
      totalAvailable: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const now = new Date();

      const credits = await ctx.prisma.parentCredit.findMany({
        where: {
          parentId: input.parentId,
          amountRemaining: { gt: 0 },
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
          creditNote: { deletedAt: null },
        },
        include: {
          creditNote: { select: { invoiceNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const mapped = credits.map((pc) => {
        let daysUntilExpiry: number | null = null;
        if (pc.expiresAt) {
          daysUntilExpiry = Math.floor(
            (pc.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          );
        }
        return {
          creditId: pc.id,
          creditNoteId: pc.creditNoteId,
          creditNoteNumber: pc.creditNote.invoiceNumber,
          amountOriginal: toNum(pc.amountOriginal),
          amountRemaining: toNum(pc.amountRemaining),
          createdAt: pc.createdAt,
          expiresAt: pc.expiresAt,
          daysUntilExpiry,
        };
      });

      const totalAvailable = mapped.reduce((sum, c) => sum + c.amountRemaining, 0);

      return { credits: mapped, totalAvailable };
    }),

});
