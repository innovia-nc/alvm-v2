import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  router,
  protectedProcedure,
  staffProcedure,
} from '@/server/trpc/init';
import type { Prisma } from '@prisma/client';
import { getTaxRateDecimal, getDefaultDueDate } from '@/server/helpers/settings';
import { computeDaysCount } from '@/server/helpers/date';
import { toNum } from '@/server/helpers/decimal';
import { createInvoiceAccountingEntries } from '@/server/services/accounting.service';
import { applyAvailableCreditsToInvoice } from '@/server/services/credit-application.service';
import { generateDocumentNumber } from '@/server/helpers/invoice-number';
import { generateAndStoreInvoicePdf } from '@/server/services/invoice-pdf.service';

type InvStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'CREDITED';

// ============================================================================
// SCHEMAS
// ============================================================================

const invoiceStatusEnum = z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED', 'CREDITED']);

const invoiceLineSchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  registrationId: z.string().uuid().nullable(),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  totalPrice: z.number(),
});

const invoiceSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string(),
  parentId: z.string().uuid(),
  issueDate: z.date(),
  dueDate: z.date(),
  subtotalHt: z.number().optional(),
  taxAmount: z.number().optional(),
  taxRate: z.number().optional(),
  totalAmount: z.number(),
  paidAmount: z.number(),
  status: invoiceStatusEnum,
  version: z.number().int(),
  pdfUrl: z.string().nullable(),
  accountingExportedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const invoiceWithDetailsSchema = invoiceSchema.extend({
  parent: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    phone: z.string(),
    homePhone: z.string().nullable(),
    workPhone: z.string().nullable(),
    address: z.string(),
    city: z.string(),
    postalCode: z.string(),
  }),
  lines: z.array(invoiceLineSchema),
  payments: z.array(z.object({
    id: z.string().uuid(),
    amount: z.number(),
    paymentDate: z.date(),
    paymentMethod: z.string(),
  })),
  remainingAmount: z.number(),
  creatorName: z.string().nullable(),
  validatorName: z.string().nullable(),
});

const invoiceInclude = {
  parent: {
    select: {
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      homePhone: true,
      workPhone: true,
      address: true,
      city: true,
      postalCode: true,
    },
  },
  lines: {
    where: { deletedAt: null },
    select: {
      id: true,
      invoiceId: true,
      registrationId: true,
      description: true,
      quantity: true,
      unitPrice: true,
      totalPrice: true,
    },
  },
  payments: {
    select: {
      id: true,
      amount: true,
      paymentDate: true,
      paymentMethod: {
        select: { name: true },
      },
    },
  },
  // Traçabilité — whitelist stricte : id + name uniquement.
  // Champs JAMAIS exposés : email, hashedPassword, Account.providerAccountId, tokens.
  creator: {
    select: {
      id: true,
      name: true,
    },
  },
  validator: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

function mapInvoiceWithDetails(inv: any, role?: string) {
  const totalAmount = toNum(inv.totalAmount);
  const paidAmount = toNum(inv.paidAmount);

  // Role-gating R3 : creatorName/validatorName sont null pour les PARENT.
  // Seuls STAFF et ADMIN voient ces champs de traçabilité interne.
  const isStaffOrAdmin = role !== 'PARENT';
  const creatorName: string | null = isStaffOrAdmin
    ? (inv.creator?.name ?? null)
    : null;
  const validatorName: string | null = isStaffOrAdmin
    ? (inv.validator?.name ?? null)
    : null;

  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    parentId: inv.parentId,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    subtotalHt: inv.subtotalHt ? toNum(inv.subtotalHt) : undefined,
    taxAmount: inv.taxAmount ? toNum(inv.taxAmount) : undefined,
    taxRate: inv.taxRate ? toNum(inv.taxRate) : undefined,
    totalAmount,
    paidAmount,
    status: inv.status as InvStatus,
    version: inv.version,
    pdfUrl: inv.pdfUrl,
    accountingExportedAt: inv.accountingExportedAt,
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
    parent: inv.parent,
    lines: (inv.lines || []).map((l: any) => ({
      id: l.id,
      invoiceId: l.invoiceId,
      registrationId: l.registrationId,
      description: l.description,
      quantity: l.quantity,
      unitPrice: toNum(l.unitPrice),
      totalPrice: toNum(l.totalPrice),
    })),
    payments: (inv.payments || []).map((p: any) => ({
      id: p.id,
      amount: toNum(p.amount),
      paymentDate: p.paymentDate,
      paymentMethod: p.paymentMethod?.name || 'Unknown',
    })),
    remainingAmount: totalAmount - paidAmount,
    creatorName,
    validatorName,
  };
}

function mapInvoice(inv: any) {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    parentId: inv.parentId,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    subtotalHt: inv.subtotalHt ? toNum(inv.subtotalHt) : undefined,
    taxAmount: inv.taxAmount ? toNum(inv.taxAmount) : undefined,
    taxRate: inv.taxRate ? toNum(inv.taxRate) : undefined,
    totalAmount: toNum(inv.totalAmount),
    paidAmount: toNum(inv.paidAmount),
    status: inv.status as InvStatus,
    version: inv.version,
    pdfUrl: inv.pdfUrl,
    accountingExportedAt: inv.accountingExportedAt,
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
  };
}

// ============================================================================
// ROUTER
// ============================================================================

export const invoicesRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
      parentId: z.string().uuid().optional(),
      status: invoiceStatusEnum.optional(),
      /**
       * Filtre multi-statuts, pour les sélecteurs qui n'exposent qu'un
       * sous-ensemble de factures (ex. factures éligibles à un avoir).
       * Ignoré si `status` est fourni.
       */
      statuses: z.array(invoiceStatusEnum).min(1).optional(),
      search: z.string().optional(),
      sortBy: z.enum(['invoiceNumber', 'issueDate', 'dueDate', 'totalAmount', 'parent']).default('issueDate'),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
    }))
    .output(z.object({
      invoices: z.array(invoiceWithDetailsSchema),
      total: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const { limit, offset, parentId, status, statuses, search, sortBy, sortOrder } = input;

      const where: Prisma.InvoiceWhereInput = {
        deletedAt: null,
        invoiceType: 'INVOICE',
      };

      if (ctx.user.role === 'PARENT') {
        where.parentId = ctx.user.id;
      } else if (parentId) {
        where.parentId = parentId;
      }

      if (status) where.status = status;
      else if (statuses && statuses.length > 0) where.status = { in: statuses };

      if (search && search.trim().length > 0) {
        const q = search.trim();
        where.OR = [
          { invoiceNumber: { contains: q, mode: 'insensitive' } },
          { parent: { firstName: { contains: q, mode: 'insensitive' } } },
          { parent: { lastName: { contains: q, mode: 'insensitive' } } },
          { parent: { email: { contains: q, mode: 'insensitive' } } },
        ];
      }

      const orderBy: Prisma.InvoiceOrderByWithRelationInput | Prisma.InvoiceOrderByWithRelationInput[] =
        sortBy === 'parent'
          ? [
              { parent: { lastName: sortOrder } },
              { parent: { firstName: sortOrder } },
            ]
          : { [sortBy]: sortOrder };

      const [invoices, total] = await Promise.all([
        ctx.prisma.invoice.findMany({
          where,
          include: invoiceInclude,
          orderBy,
          take: limit,
          skip: offset,
        }),
        ctx.prisma.invoice.count({ where }),
      ]);

      return {
        invoices: invoices.map((inv) => mapInvoiceWithDetails(inv, ctx.user.role)),
        total,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(invoiceWithDetailsSchema.nullable())
    .query(async ({ ctx, input }) => {
      const where: Prisma.InvoiceWhereInput = {
        id: input.id,
        deletedAt: null,
      };

      if (ctx.user.role === 'PARENT') {
        where.parentId = ctx.user.id;
      }

      const invoice = await ctx.prisma.invoice.findFirst({
        where,
        include: invoiceInclude,
      });

      return invoice ? mapInvoiceWithDetails(invoice, ctx.user.role) : null;
    }),

  create: staffProcedure
    .input(z.object({
      parentId: z.string().uuid(),
      dueDate: z.string().date(),
      lines: z.array(z.object({
        registrationId: z.string().uuid().nullable(),
        description: z.string().min(3),
        quantity: z.number().min(1),
        unitPrice: z.number().min(0),
      })).min(1, 'Au moins une ligne requise'),
    }))
    .output(invoiceSchema)
    .mutation(async ({ ctx, input }) => {
      const subtotalHt = input.lines.reduce(
        (sum, line) => sum + line.quantity * line.unitPrice,
        0,
      );

      const invoice = await ctx.prisma.$transaction(async (tx) => {
        const taxRate = await getTaxRateDecimal(tx);
        const taxAmount = subtotalHt * taxRate;
        const totalAmount = subtotalHt + taxAmount;
        const invoiceNumber = await generateDocumentNumber(tx, 'INVOICE');

        const created = await tx.invoice.create({
          data: {
            invoiceNumber,
            parentId: input.parentId,
            dueDate: new Date(input.dueDate),
            totalAmount,
            subtotalHt,
            taxAmount,
            taxRate,
            status: 'DRAFT',
            createdById: ctx.user.id,
          },
        });

        for (const line of input.lines) {
          await tx.invoiceLine.create({
            data: {
              invoiceId: created.id,
              registrationId: line.registrationId,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              totalPrice: line.quantity * line.unitPrice,
            },
          });
        }

        return created;
      });

      return mapInvoice(invoice);
    }),

  createFromRegistration: staffProcedure
    .input(z.object({
      registrationId: z.string().uuid(),
      dueDate: z.string().date().optional(),
      status: z.enum(['DRAFT', 'SENT']).default('DRAFT'),
    }))
    .output(invoiceSchema)
    .mutation(async ({ ctx, input }) => {
      // 1. Get registration with camp and child details
      const reg = await ctx.prisma.registration.findFirst({
        where: { id: input.registrationId, deletedAt: null },
        include: {
          camp: { select: { name: true, startDate: true, endDate: true, pricePerDay: true, campType: { select: { accountingCode: true } } } },
          child: { select: { firstName: true, lastName: true } },
        },
      });

      if (!reg) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscription non trouvée' });
      }

      // 2. Check no existing active invoice
      const existingLine = await ctx.prisma.invoiceLine.findFirst({
        where: {
          registrationId: input.registrationId,
          deletedAt: null,
          invoice: { deletedAt: null },
        },
      });
      if (existingLine) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Une facture existe déjà pour cette inscription',
        });
      }

      // 3. Check registration status
      if (reg.status === 'CANCELLED') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Impossible de créer une facture pour une inscription annulée',
        });
      }

      // 4. Calculate amounts
      const daysCount = computeDaysCount(reg.camp.startDate, reg.camp.endDate);
      const pricePerDay = toNum(reg.camp.pricePerDay);
      const subtotalHt = daysCount * pricePerDay;

      // 5. Create invoice with line
      const startStr = reg.camp.startDate
        ? reg.camp.startDate.toLocaleDateString('fr-FR')
        : '?';
      const endStr = reg.camp.endDate
        ? reg.camp.endDate.toLocaleDateString('fr-FR')
        : '?';
      const description = `Camp "${reg.camp.name}" - ${reg.child.firstName} ${reg.child.lastName} (${startStr} - ${endStr})`;

      const invoice = await ctx.prisma.$transaction(async (tx) => {
        const taxRate = await getTaxRateDecimal(tx);
        const taxAmount = subtotalHt * taxRate;
        const totalAmount = subtotalHt + taxAmount;

        const dueDate = input.dueDate
          ? new Date(input.dueDate)
          : await getDefaultDueDate(tx);
        const invoiceNumber = await generateDocumentNumber(tx, 'INVOICE');

        const created = await tx.invoice.create({
          data: {
            invoiceNumber,
            parentId: reg.parentId,
            dueDate,
            totalAmount,
            subtotalHt,
            taxAmount,
            taxRate,
            status: input.status,
            createdById: ctx.user.id,
          },
        });

        await tx.invoiceLine.create({
          data: {
            invoiceId: created.id,
            registrationId: reg.id,
            description,
            quantity: daysCount,
            unitPrice: pricePerDay,
            totalPrice: subtotalHt,
          },
        });

        // Generate accounting entries if invoice is created as SENT
        if (input.status === 'SENT') {
          const accountingCode =
            reg.camp.campType?.accountingCode || '706000';

          await createInvoiceAccountingEntries(tx, {
            invoiceId: created.id,
            parentId: reg.parentId,
            invoiceNumber: created.invoiceNumber,
            issueDate: created.issueDate,
            subtotalHt,
            taxAmount,
            totalAmount,
            taxRate,
            accountingCode,
            userId: ctx.user.id,
          });
        }

        return created;
      });

      return mapInvoice(invoice);
    }),

  update: staffProcedure
    .input(z.object({
      id: z.string().uuid(),
      version: z.number().int().min(0),
      lines: z.array(z.object({
        registrationId: z.string().uuid().nullable(),
        description: z.string().min(3),
        quantity: z.number().int().min(1),
        unitPrice: z.number().min(0),
      })).min(1, 'Au moins une ligne requise'),
    }))
    .output(invoiceSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.invoice.findFirst({
        where: { id: input.id, deletedAt: null },
        select: { id: true, status: true, taxRate: true, version: true },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Facture non trouvée' });
      }
      if (existing.status !== 'DRAFT') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Seules les factures en brouillon peuvent être modifiées',
        });
      }

      const subtotalHt = input.lines.reduce(
        (sum, line) => sum + line.quantity * line.unitPrice,
        0,
      );
      const taxRate = existing.taxRate ? toNum(existing.taxRate) : 0;
      const taxAmount = subtotalHt * taxRate;
      const totalAmount = subtotalHt + taxAmount;

      const invoice = await ctx.prisma.$transaction(async (tx) => {
        // Optimistic lock + recompute totals
        const result = await tx.invoice.updateMany({
          where: { id: input.id, version: input.version, status: 'DRAFT' },
          data: {
            subtotalHt,
            taxAmount,
            totalAmount,
            version: { increment: 1 },
          },
        });

        if (result.count === 0) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'La facture a été modifiée par un autre utilisateur. Rechargez et réessayez.',
          });
        }

        // Replace lines: soft-delete existing then insert new
        await tx.invoiceLine.updateMany({
          where: { invoiceId: input.id, deletedAt: null },
          data: { deletedAt: new Date() },
        });

        for (const line of input.lines) {
          await tx.invoiceLine.create({
            data: {
              invoiceId: input.id,
              registrationId: line.registrationId,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              totalPrice: line.quantity * line.unitPrice,
            },
          });
        }

        return tx.invoice.findUniqueOrThrow({ where: { id: input.id } });
      });

      return mapInvoice(invoice);
    }),

  validate: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(invoiceSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.invoice.findFirst({
        where: { id: input.id, deletedAt: null },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Facture non trouvée' });
      }
      if (existing.status !== 'DRAFT') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Seules les factures en brouillon peuvent être validées',
        });
      }

      const invoice = await ctx.prisma.$transaction(async (tx) => {
        const updated = await tx.invoice.update({
          where: { id: input.id },
          data: { status: 'SENT', pdfUrl: null, validatedById: ctx.user.id },
        });

        // Fetch invoice with lines and camp type accounting code
        const invoiceWithLines = await tx.invoice.findUniqueOrThrow({
          where: { id: input.id },
          include: {
            lines: {
              where: { deletedAt: null },
              include: {
                registration: {
                  include: {
                    camp: {
                      include: {
                        campType: { select: { accountingCode: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        });

        // Derive accountingCode from the first line's camp type, fallback to default
        const firstLine = invoiceWithLines.lines[0];
        const accountingCode =
          firstLine?.registration?.camp?.campType?.accountingCode || '706000';

        await createInvoiceAccountingEntries(tx, {
          invoiceId: updated.id,
          parentId: updated.parentId,
          invoiceNumber: updated.invoiceNumber,
          issueDate: updated.issueDate,
          subtotalHt: toNum(updated.subtotalHt),
          taxAmount: toNum(updated.taxAmount),
          totalAmount: toNum(updated.totalAmount),
          taxRate: toNum(updated.taxRate),
          accountingCode,
          userId: ctx.user.id,
        });

        // US-FACT-02 — imputation FIFO des avoirs disponibles du client, après
        // les écritures VE (la facture doit exister au journal avant d'être
        // partiellement soldée). Le service crée les paiements « Avoir »
        // correspondants et leurs écritures BQ.
        const credits = await applyAvailableCreditsToInvoice(tx, {
          invoiceId: updated.id,
          invoiceNumber: updated.invoiceNumber,
          parentId: updated.parentId,
          totalAmount: toNum(updated.totalAmount),
          paidAmount: toNum(updated.paidAmount),
          userId: ctx.user.id,
        });

        if (credits.totalApplied === 0) {
          return updated;
        }

        // Le montant réglé et le statut sont portés ici (et non dans le
        // service) : la décision de solder la facture appartient au router,
        // seul détenteur de la machine à états.
        const newPaidAmount = toNum(updated.paidAmount) + credits.totalApplied;

        return tx.invoice.update({
          where: { id: updated.id },
          data: {
            paidAmount: newPaidAmount,
            status: credits.remainingDue <= 0 ? 'PAID' : updated.status,
          },
        });
      });

      return mapInvoice(invoice);
    }),

  updateStatus: staffProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(['SENT', 'PAID', 'OVERDUE', 'CANCELLED']),
      version: z.number().int().min(0),
    }))
    .output(invoiceSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.invoice.findFirst({
        where: { id: input.id, deletedAt: null },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Facture non trouvée' });
      }

      // Validate status transitions
      const currentStatus = existing.status as InvStatus;
      const validTransitions: Record<InvStatus, InvStatus[]> = {
        DRAFT: ['SENT', 'CANCELLED'],
        SENT: ['PAID', 'OVERDUE', 'CANCELLED'],
        OVERDUE: ['PAID', 'CANCELLED'],
        PAID: ['CREDITED'],
        CANCELLED: [],
        CREDITED: [],
      };

      const allowed = validTransitions[currentStatus] || [];
      if (!allowed.includes(input.status as InvStatus)) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Transition de statut invalide : ${currentStatus} -> ${input.status}`,
        });
      }

      // Block cancellation of paid invoices without prior refund
      if (input.status === 'CANCELLED' && toNum(existing.paidAmount) > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Impossible d\'annuler une facture avec des paiements. Creer un avoir ou un remboursement d\'abord.',
        });
      }

      // Optimistic locking
      const result = await ctx.prisma.invoice.updateMany({
        where: { id: input.id, version: input.version },
        data: { status: input.status, version: { increment: 1 } },
      });

      if (result.count === 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'La facture a été modifiée par un autre utilisateur. Rechargez et réessayez.',
        });
      }

      const invoice = await ctx.prisma.invoice.findUniqueOrThrow({
        where: { id: input.id },
      });

      return mapInvoice(invoice);
    }),

  delete: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        // Check for payments
        const paymentCount = await tx.payment.count({
          where: { invoiceId: input.id },
        });
        if (paymentCount > 0) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Impossible de supprimer une facture avec des paiements',
          });
        }

        const result = await tx.invoice.updateMany({
          where: { id: input.id, deletedAt: null },
          data: { deletedAt: new Date() },
        });

        if (result.count === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Facture non trouvée' });
        }

        // Reset paymentStatus on associated registrations
        const lines = await tx.invoiceLine.findMany({
          where: { invoiceId: input.id, registrationId: { not: null } },
          select: { registrationId: true },
        });
        const regIds = lines
          .map((l) => l.registrationId)
          .filter((id): id is string => id !== null);

        if (regIds.length > 0) {
          await tx.registration.updateMany({
            where: { id: { in: regIds }, deletedAt: null },
            data: { paymentStatus: 'UNPAID' },
          });
        }

        return { success: true };
      });
    }),

  generatePDF: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean(), pdfUrl: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { pdfUrl } = await generateAndStoreInvoicePdf(ctx.prisma, input.id);
      return { success: true, pdfUrl };
    }),

  /**
   * Envoie la facture (ou le devis, tant qu'elle est en brouillon) au parent,
   * PDF en pièce jointe (TD-008).
   *
   * Le PDF est régénéré à chaque envoi : la pièce jointe reflète donc l'état
   * du document au moment de l'envoi, et l'URL archivée est rafraîchie au
   * passage.
   */
  sendEmail: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean(), sentTo: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const {
        isEmailConfigured,
        getEmailSender,
        sendEmail: sendTransactionalEmail,
        escapeHtml,
      } = await import('@/server/services/email.service');

      if (!isEmailConfigured()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            "L'envoi d'email n'est pas configuré sur cet environnement (clé RESEND_API_KEY absente). Contactez l'administrateur.",
        });
      }

      const { invoice, pdfBuffer } = await generateAndStoreInvoicePdf(
        ctx.prisma,
        input.id,
      );

      const recipient: string | null = invoice.parent?.email ?? null;
      if (!recipient) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: "Ce client n'a pas d'adresse email : impossible de lui envoyer le document.",
        });
      }

      const { getPdfSettings } = await import('@/server/helpers/pdf-settings.helper');
      const [pdfSettings, sender] = await Promise.all([
        getPdfSettings(ctx.prisma),
        getEmailSender(ctx.prisma),
      ]);

      // Un brouillon n'est pas encore une facture : c'est le devis que les
      // écrans admin proposent d'envoyer (« Envoyer le devis »).
      const isQuote = invoice.status === 'DRAFT';
      const label = isQuote ? 'devis' : 'facture';
      const orgName = pdfSettings.org.shortName || pdfSettings.org.name;
      const amount = `${toNum(invoice.totalAmount).toLocaleString('fr-FR')} XPF`;
      const dueDate = new Date(invoice.dueDate).toLocaleDateString('fr-FR');
      const greeting = `${invoice.parent.firstName} ${invoice.parent.lastName}`.trim();

      const subject = isQuote
        ? `Votre devis ${invoice.invoiceNumber} — ${orgName}`
        : `Votre facture ${invoice.invoiceNumber} — ${orgName}`;

      const lines = [
        `Bonjour ${greeting},`,
        isQuote
          ? `Vous trouverez en pièce jointe votre devis ${invoice.invoiceNumber} d'un montant de ${amount}.`
          : `Vous trouverez en pièce jointe votre facture ${invoice.invoiceNumber} d'un montant de ${amount}, à régler avant le ${dueDate}.`,
        `Pour toute question, répondez simplement à cet email.`,
        `Cordialement,`,
        orgName,
      ];

      await sendTransactionalEmail(
        {
          to: recipient,
          subject,
          text: lines.join('\n\n'),
          html: lines
            .map((line) => `<p>${escapeHtml(line)}</p>`)
            .join('\n'),
          attachments: [
            {
              filename: `${label}-${invoice.invoiceNumber}.pdf`,
              content: pdfBuffer,
            },
          ],
        },
        sender,
      ).catch((error: unknown) => {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message:
            error instanceof Error
              ? `Envoi impossible : ${error.message}`
              : "Envoi impossible : erreur inconnue du fournisseur d'email.",
        });
      });

      return { success: true, sentTo: recipient };
    }),

  fetchUnpaidRegistrations: staffProcedure
    .input(z.object({ parentId: z.string().uuid() }))
    .output(z.object({
      registrations: z.array(z.object({
        id: z.string().uuid(),
        campId: z.string().uuid(),
        campName: z.string(),
        childId: z.string().uuid(),
        childFirstName: z.string(),
        childLastName: z.string(),
        registrationDate: z.date(),
        totalAmount: z.number(),
        status: z.enum(['CONFIRMED']),
        paymentStatus: z.enum(['UNPAID']),
      })),
    }))
    .query(async ({ ctx, input }) => {
      const registrations = await ctx.prisma.registration.findMany({
        where: {
          parentId: input.parentId,
          status: 'CONFIRMED',
          paymentStatus: 'UNPAID',
          deletedAt: null,
        },
        include: {
          camp: { select: { id: true, name: true, startDate: true, endDate: true, pricePerDay: true } },
          child: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { registrationDate: 'desc' },
      });

      return {
        registrations: registrations.map((r) => {
          const daysCount = computeDaysCount(r.camp.startDate, r.camp.endDate);
          return {
            id: r.id,
            campId: r.campId,
            campName: r.camp.name,
            childId: r.childId,
            childFirstName: r.child.firstName,
            childLastName: r.child.lastName,
            registrationDate: r.registrationDate,
            totalAmount: daysCount * toNum(r.camp.pricePerDay),
            status: 'CONFIRMED' as const,
            paymentStatus: 'UNPAID' as const,
          };
        }),
      };
    }),
});
