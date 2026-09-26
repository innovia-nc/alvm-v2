import { cancelRegistrationWithAccounting } from '@/server/services/registration-cancellation.service';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, staffProcedure } from '@/server/trpc/init';
import type { Prisma, RegistrationStatus } from '@prisma/client';
import { getCreditExpiryDate } from '@/server/helpers/settings';
import { computeDaysCount } from '@/server/helpers/date';
import { toNum } from '@/server/helpers/decimal';
import { createCreditNoteAccountingEntries } from '@/server/services/accounting.service';
import { generateDocumentNumber } from '@/server/helpers/invoice-number';
import { lockTenant } from '@/server/db-context';

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
  cancellationRequestedAt: z.date().nullable(),
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
      totalPrice: true,
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
    cancellationRequestedAt: r.cancellationRequestedAt ?? null,
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
    totalAmount: r.camp.totalPrice == null ? daysCount * pricePerDay : toNum(r.camp.totalPrice),
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
    cancellationRequestedAt: r.cancellationRequestedAt ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ============================================================================
// ROUTER
// ============================================================================

export const registrationsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        campId: z.string().uuid().optional(),
        childId: z.string().uuid().optional(),
        status: registrationStatusEnum.optional(),
        search: z.string().optional(),
        sortBy: z.enum(['registrationDate', 'childName', 'status']).default('registrationDate'),
        sortOrder: z.enum(['asc', 'desc']).default('asc'),
      }),
    )
    .output(
      z.object({
        registrations: z.array(registrationWithDetailsSchema),
        total: z.number(),
      }),
    )
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
          orderBy: [orderByMap[sortBy], { id: 'asc' }],
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
    .input(
      z.object({
        campId: z.string().uuid(),
        childId: z.string().uuid(),
        parentId: z.string().uuid().optional(),
        specialRequirements: z.string().optional(),
      }),
    )
    .output(registrationSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');

        if (ctx.user.role === 'PARENT' && input.parentId && input.parentId !== ctx.user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Inscription réservée à votre famille',
          });
        }
        const parentId = ctx.user.role === 'PARENT' ? ctx.user.id : input.parentId || ctx.user.id;

        // 1. Verify child exists and belongs to parent
        const childLink = await tx.childParent.findFirst({
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
        const camp = await tx.camp.findFirst({
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
        const existing = await tx.registration.findFirst({
          where: {
            campId: input.campId,
            childId: input.childId,
            deletedAt: null,
            status: { not: 'CANCELLED' },
          },
        });
        if (existing) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Cet enfant est déjà inscrit à ce camp',
          });
        }

        // 4. Get all camp_days for selected_days
        const campDays = await tx.campDay.findMany({
          where: { campId: input.campId },
          select: { id: true },
          orderBy: { date: 'asc' },
        });
        const selectedDays = campDays.map((d) => d.id);

        // 5. Determine initial status
        const initialStatus: RegistrationStatus =
          camp._count.registrations >= camp.maxCapacity ? 'WAITLIST' : 'PENDING';

        // 6. Create registration
        const registration = await tx.registration.create({
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
      });
    }),

  createByStaff: staffProcedure
    .input(
      z.object({
        campId: z.string().uuid(),
        childId: z.string().uuid(),
        parentId: z.string().uuid(),
        specialRequirements: z.string().optional(),
        status: z.enum(['PENDING', 'CONFIRMED', 'WAITLIST']).default('PENDING'),
      }),
    )
    .output(registrationSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');

        // 1. Verify child belongs to parent
        const childLink = await tx.childParent.findFirst({
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
        const camp = await tx.camp.findFirst({
          where: { id: input.campId, deletedAt: null },
        });
        if (!camp) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Camp non trouvé' });
        }

        // 3. Check no duplicate
        const existing = await tx.registration.findFirst({
          where: {
            campId: input.campId,
            childId: input.childId,
            deletedAt: null,
            status: { not: 'CANCELLED' },
          },
        });
        if (existing) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Cet enfant est déjà inscrit à ce camp',
          });
        }

        // 4. Get camp_days for selected_days
        const campDays = await tx.campDay.findMany({
          where: { campId: input.campId },
          select: { id: true },
          orderBy: { date: 'asc' },
        });
        const selectedDays = campDays.map((d) => d.id);

        // 5. Create with staff-specified status
        if (
          input.status === 'CONFIRMED' &&
          (await tx.registration.count({
            where: { campId: input.campId, status: 'CONFIRMED', deletedAt: null },
          })) >= camp.maxCapacity
        )
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Capacité du camp atteinte',
          });
        const registration = await tx.registration.create({
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
      });
    }),

  updateByStaff: staffProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        specialRequirements: z.string().optional(),
        status: registrationStatusEnum.optional(),
      }),
    )
    .output(registrationSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');

        const { id, ...updates } = input;

        const existing = await tx.registration.findFirst({
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
        if (updates.specialRequirements !== undefined)
          data.specialRequirements = updates.specialRequirements || null;
        if (updates.status !== undefined) data.status = updates.status;

        if (Object.keys(data).length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucune modification fournie' });
        }

        if (input.status === 'CONFIRMED' && existing.status !== 'CONFIRMED') {
          const camp = await tx.camp.findFirst({ where: { id: existing.campId, deletedAt: null } });
          const count = await tx.registration.count({
            where: { campId: existing.campId, status: 'CONFIRMED', deletedAt: null },
          });
          if (!camp || count >= camp.maxCapacity)
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'Capacité du camp atteinte',
            });
        }
        if (
          input.status &&
          input.status !== 'CONFIRMED' &&
          (await tx.invoiceLine.count({
            where: {
              registrationId: existing.id,
              deletedAt: null,
              invoice: { deletedAt: null, status: { notIn: ['CANCELLED', 'CREDITED'] } },
            },
          })) > 0
        )
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Utilisez le parcours d’annulation avec traitement de la facture',
          });
        const registration = await tx.registration.update({
          where: { id },
          data,
        });

        return mapRegistration(registration);
      });
    }),

  updateStatus: staffProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(['CONFIRMED', 'CANCELLED', 'WAITLIST']),
      }),
    )
    .output(registrationSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');

        const existing = await tx.registration.findFirst({
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
            message:
              'Cette inscription a déjà été payée : seule la confirmation est possible (annulation via le parcours remboursement)',
          });
        }

        if (input.status === 'CONFIRMED' && existing.status !== 'CONFIRMED') {
          const camp = await tx.camp.findFirst({ where: { id: existing.campId, deletedAt: null } });
          const count = await tx.registration.count({
            where: { campId: existing.campId, status: 'CONFIRMED', deletedAt: null },
          });
          if (!camp || count >= camp.maxCapacity)
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'Capacité du camp atteinte',
            });
        }
        if (
          input.status &&
          input.status !== 'CONFIRMED' &&
          (await tx.invoiceLine.count({
            where: {
              registrationId: existing.id,
              deletedAt: null,
              invoice: { deletedAt: null, status: { notIn: ['CANCELLED', 'CREDITED'] } },
            },
          })) > 0
        )
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Utilisez le parcours d’annulation avec traitement de la facture',
          });
        const registration = await tx.registration.update({
          where: { id: input.id },
          data: { status: input.status },
        });

        // Promote waitlisted registration when a spot opens
        if (input.status === 'CANCELLED') {
          const nextInLine = await tx.registration.findFirst({
            where: {
              campId: existing.campId,
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

        return mapRegistration(registration);
      });
    }),

  analyzeRegistrationStatus: staffProcedure
    .input(z.object({ registrationId: z.string().uuid() }))
    .output(
      z.object({
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
      }),
    )
    .query(async ({ ctx, input }) => {
      const reg = await ctx.prisma.registration.findFirst({
        where: { id: input.registrationId, deletedAt: null },
      });
      if (!reg) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscription non trouvée' });
      }

      if (reg.status === 'CANCELLED') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Inscription déjà annulée',
        });
      }

      // Find associated invoice via invoice_lines
      const invoice = await ctx.prisma.invoice.findFirst({
        where: {
          invoiceType: 'INVOICE',
          status: { notIn: ['CANCELLED', 'CREDITED'] },
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
          creditedAmount: true,
          taxRate: true,
          lines: {
            where: { registrationId: input.registrationId, deletedAt: null },
            select: { totalPrice: true },
          },
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

      const totalAmount =
        Math.round(
          invoice.lines.reduce((sum, line) => sum + toNum(line.totalPrice), 0) *
            (1 + toNum(invoice.taxRate)) *
            100,
        ) / 100;
      const effective = toNum(invoice.totalAmount) - toNum(invoice.creditedAmount);
      const paidAmount =
        effective > 0
          ? Math.round(
              Math.min(totalAmount, (toNum(invoice.paidAmount) * totalAmount) / effective) * 100,
            ) / 100
          : 0;

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

      if (paidAmount === 0) {
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
          requiredSteps: 4,
          requiresRefundChoice: true,
          requiresPaymentMethod: true,
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
    .input(
      z.object({
        registrationId: z.string().uuid(),
        reason: z.string().min(10, 'Le motif doit contenir au moins 10 caractères'),
        refundChoice: z.enum(['IMMEDIATE_REFUND', 'FUTURE_CREDIT']).optional(),
        paymentMethodCode: z.enum(['CASH', 'CHECK', 'BANK_TRANSFER']).optional(),
      }),
    )
    .output(
      z.object({
        success: z.boolean(),
        case: z.enum([
          'NO_INVOICE',
          'DRAFT_INVOICE',
          'SENT_UNPAID',
          'PARTIALLY_PAID',
          'FULLY_PAID_REFUND',
          'FULLY_PAID_CREDIT',
        ]),
        invoice: z
          .object({
            id: z.string().uuid(),
            invoiceNumber: z.string(),
            status: z.string(),
            totalAmount: z.number(),
            paidAmount: z.number(),
          })
          .nullable(),
        creditNote: z
          .object({
            id: z.string().uuid(),
            invoiceNumber: z.string(),
            amount: z.number(),
          })
          .nullable(),
        refund: z
          .object({
            id: z.string().uuid(),
            amount: z.number(),
            method: z.string(),
          })
          .nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.prisma.$transaction(
        async (tx) => {
          await lockTenant(tx, 'billing');
          return cancelRegistrationWithAccounting(tx, input, ctx.user.id);
        },
        { timeout: 20000 },
      ),
    ),

  delete: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');

        const existing = await tx.registration.findFirst({
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
        const hasInvoice = await tx.invoiceLine.findFirst({
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

        await tx.registration.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });

        return { success: true };
      });
    }),

  requestCancellation: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) =>
      ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');
        const registration = await tx.registration.findFirst({
          where: { id: input.id, parentId: ctx.user.id, deletedAt: null },
          include: { camp: true },
        });
        if (!registration)
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscription non trouvée' });
        if (registration.camp.startDate <= new Date() || registration.status === 'CANCELLED')
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Contactez le secrétariat pour cette inscription',
          });
        const invoice = await tx.invoiceLine.count({
          where: {
            registrationId: registration.id,
            deletedAt: null,
            invoice: { deletedAt: null, status: { notIn: ['CANCELLED', 'CREDITED'] } },
          },
        });
        const cancelled = !invoice && ['PENDING', 'WAITLIST'].includes(registration.status);
        await tx.registration.update({
          where: { id: registration.id },
          data: cancelled
            ? {
                status: 'CANCELLED',
                cancellationDate: new Date(),
                cancelledBy: ctx.user.id,
                cancellationReason: 'Désistement du client',
              }
            : { cancellationRequestedAt: registration.cancellationRequestedAt ?? new Date() },
        });
        return { cancelled };
      }),
    ),

  getAvailableCredits: protectedProcedure
    .input(z.object({ parentId: z.string().uuid() }))
    .output(
      z.object({
        credits: z.array(
          z.object({
            creditId: z.string().uuid(),
            creditNoteId: z.string().uuid(),
            creditNoteNumber: z.string(),
            amountOriginal: z.number(),
            amountRemaining: z.number(),
            createdAt: z.date(),
            expiresAt: z.date().nullable(),
            daysUntilExpiry: z.number().nullable(),
          }),
        ),
        totalAvailable: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user.role === 'PARENT' && input.parentId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Accès réservé à votre famille' });
      }
      const now = new Date();

      const credits = await ctx.prisma.parentCredit.findMany({
        where: {
          parentId: input.parentId,
          amountRemaining: { gt: 0 },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          creditNote: { deletedAt: null, status: 'SENT' },
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
