import { effectiveInvoiceStatus, overdueWhere } from '@back/helpers/invoice-status';
import {
  assertInvoiceParent,
  issueInvoice,
  cancelUnpaidInvoice,
  invoiceSummarySelect,
  validateInvoiceRegistrations,
} from '@back/services/invoice-lifecycle.service';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, staffProcedure } from '@back/trpc/trpc.init';
import type { Prisma } from '@prisma/client';
import { getTaxRateDecimal, getDefaultDueDate } from '@back/helpers/settings';
import { computeDaysCount } from '@back/helpers/date';
import { toNum } from '@back/helpers/decimal';
import { generateDocumentNumber } from '@back/helpers/invoice-number';
import { generateAndStoreInvoicePdf } from '@back/services/invoice-pdf.service';
import { lockTenant } from '@back/db-context';
import { assertEmailQueueConfigured, enqueueEmail } from '@back/queues/email.queue';
import { buildInvoiceEmail } from '@back/services/email-templates';

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
  creditedAmount: z.number(),
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
  payments: z.array(
    z.object({
      id: z.string().uuid(),
      amount: z.number(),
      paymentDate: z.date(),
      paymentMethod: z.string(),
    }),
  ),
  remainingAmount: z.number(),
  creatorName: z.string().nullable(),
  validatorName: z.string().nullable(),
});

/**
 * Détail d'une facture (§5.9) : colonnes de `invoiceSummarySelect` + parent,
 * lignes et règlements en select. Vue parent : sans traçabilité interne.
 */
const invoiceDetailsSelect = {
  ...invoiceSummarySelect,
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
} as const;

/** Vue personnel : + créateur et validateur (nom uniquement, §5.13). */
const invoiceStaffDetailsSelect = {
  ...invoiceDetailsSelect,
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
  const creatorName: string | null = isStaffOrAdmin ? (inv.creator?.name ?? null) : null;
  const validatorName: string | null = isStaffOrAdmin ? (inv.validator?.name ?? null) : null;

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
    creditedAmount: toNum(inv.creditedAmount),
    status: effectiveInvoiceStatus(inv),
    version: inv.version,
    pdfUrl: `/api/documents/invoice/${inv.id}`,
    // Suivi de l'export comptable : information interne, jamais pour un PARENT.
    accountingExportedAt: isStaffOrAdmin ? inv.accountingExportedAt : null,
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
    remainingAmount: Math.max(0, totalAmount - paidAmount - toNum(inv.creditedAmount)),
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
    creditedAmount: toNum(inv.creditedAmount),
    status: effectiveInvoiceStatus(inv),
    version: inv.version,
    pdfUrl: `/api/documents/invoice/${inv.id}`,
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
    .input(
      z.object({
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
        sortBy: z
          .enum(['invoiceNumber', 'issueDate', 'dueDate', 'totalAmount', 'parent'])
          .default('issueDate'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
      }),
    )
    .output(
      z.object({
        invoices: z.array(
          invoiceSchema.extend({
            parent: z.object({ firstName: z.string(), lastName: z.string(), email: z.string() }),
            remainingAmount: z.number(),
          }),
        ),
        total: z.number(),
      }),
    )
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

      if (status === 'OVERDUE') Object.assign(where, overdueWhere());
      else if (status === 'SENT')
        Object.assign(where, {
          status: 'SENT',
          dueDate: {
            gte: new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Noumea' })),
          },
        });
      else if (status) where.status = status;
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

      const orderBy:
        | Prisma.InvoiceOrderByWithRelationInput
        | Prisma.InvoiceOrderByWithRelationInput[] =
        sortBy === 'parent'
          ? [{ parent: { lastName: sortOrder } }, { parent: { firstName: sortOrder } }]
          : { [sortBy]: sortOrder };

      const [invoices, total] = await Promise.all([
        ctx.prisma.invoice.findMany({
          where,
          select: {
            ...invoiceSummarySelect,
            parent: { select: { firstName: true, lastName: true, email: true } },
          },
          orderBy: [...(Array.isArray(orderBy) ? orderBy : [orderBy]), { id: 'asc' }],
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

      const invoice =
        ctx.user.role === 'PARENT'
          ? await ctx.prisma.invoice.findFirst({ where, select: invoiceDetailsSelect })
          : await ctx.prisma.invoice.findFirst({ where, select: invoiceStaffDetailsSelect });

      return invoice ? mapInvoiceWithDetails(invoice, ctx.user.role) : null;
    }),

  create: staffProcedure
    .input(
      z.object({
        parentId: z.string().uuid(),
        dueDate: z.string().date(),
        lines: z
          .array(
            z.object({
              registrationId: z.string().uuid().nullable(),
              description: z.string().min(3),
              quantity: z.number().min(1),
              unitPrice: z.number().min(0),
            }),
          )
          .min(1, 'Au moins une ligne requise'),
      }),
    )
    .output(invoiceSchema)
    .mutation(async ({ ctx, input }) => {
      const subtotalHt = input.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

      const invoice = await ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');
        await assertInvoiceParent(tx, input.parentId);
        await validateInvoiceRegistrations(
          tx,
          input.parentId,
          input.lines.map((l) => l.registrationId),
        );
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
          select: invoiceSummarySelect,
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
    .input(
      z.object({
        registrationId: z.string().uuid(),
        dueDate: z.string().date().optional(),
        status: z.enum(['DRAFT', 'SENT']).default('DRAFT'),
      }),
    )
    .output(invoiceSchema)
    .mutation(async ({ ctx, input }) => {
      // 1. Get registration with camp and child details
      const reg = await ctx.prisma.registration.findFirst({
        where: { id: input.registrationId, deletedAt: null },
        select: {
          id: true,
          parentId: true,
          status: true,
          camp: {
            select: {
              name: true,
              startDate: true,
              endDate: true,
              pricePerDay: true,
              totalPrice: true,
              campType: { select: { accountingCode: true } },
            },
          },
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
        select: { id: true },
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
      const subtotalHt =
        reg.camp.totalPrice == null ? daysCount * pricePerDay : toNum(reg.camp.totalPrice);

      // 5. Create invoice with line
      const startStr = reg.camp.startDate ? reg.camp.startDate.toLocaleDateString('fr-FR') : '?';
      const endStr = reg.camp.endDate ? reg.camp.endDate.toLocaleDateString('fr-FR') : '?';
      const description = `Camp "${reg.camp.name}" - ${reg.child.firstName} ${reg.child.lastName} (${startStr} - ${endStr})`;

      const invoice = await ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');
        await validateInvoiceRegistrations(tx, reg.parentId, [reg.id]);
        const taxRate = await getTaxRateDecimal(tx);
        const taxAmount = subtotalHt * taxRate;
        const totalAmount = subtotalHt + taxAmount;

        const dueDate = input.dueDate ? new Date(input.dueDate) : await getDefaultDueDate(tx);
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
            status: 'DRAFT',
            createdById: ctx.user.id,
          },
          select: invoiceSummarySelect,
        });

        await tx.invoiceLine.create({
          data: {
            invoiceId: created.id,
            registrationId: reg.id,
            description,
            quantity: 1,
            unitPrice: subtotalHt,
            totalPrice: subtotalHt,
          },
        });

        if (input.status === 'SENT') return issueInvoice(tx, created.id, ctx.user.id);

        return created;
      });

      return mapInvoice(invoice);
    }),

  update: staffProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        version: z.number().int().min(0),
        lines: z
          .array(
            z.object({
              registrationId: z.string().uuid().nullable(),
              description: z.string().min(3),
              quantity: z.number().int().min(1),
              unitPrice: z.number().min(0),
            }),
          )
          .min(1, 'Au moins une ligne requise'),
      }),
    )
    .output(invoiceSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.invoice.findFirst({
        where: { id: input.id, deletedAt: null },
        select: { id: true, parentId: true, status: true, taxRate: true, version: true },
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

      const subtotalHt = input.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
      const taxRate = existing.taxRate ? toNum(existing.taxRate) : 0;
      const taxAmount = subtotalHt * taxRate;
      const totalAmount = subtotalHt + taxAmount;

      const invoice = await ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');
        await validateInvoiceRegistrations(
          tx,
          existing.parentId,
          input.lines.map((l) => l.registrationId),
          input.id,
        );
        // Optimistic lock + recompute totals
        const result = await tx.invoice.updateMany({
          where: { id: input.id, version: input.version, status: 'DRAFT' },
          data: {
            pdfUrl: null,
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

        return tx.invoice.findUniqueOrThrow({
          where: { id: input.id },
          select: invoiceSummarySelect,
        });
      });

      return mapInvoice(invoice);
    }),

  validate: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(invoiceSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');
        return mapInvoice(await issueInvoice(tx, input.id, ctx.user.id));
      }),
    ),

  updateStatus: staffProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(['SENT', 'PAID', 'OVERDUE', 'CANCELLED']),
        version: z.number().int().min(0),
      }),
    )
    .output(invoiceSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');
        const invoice = await tx.invoice.findFirst({
          where: { id: input.id, deletedAt: null },
          select: { version: true },
        });
        if (!invoice) throw new TRPCError({ code: 'NOT_FOUND', message: 'Facture non trouvée' });
        if (invoice.version !== input.version)
          throw new TRPCError({ code: 'CONFLICT', message: 'Rechargez la facture modifiée' });
        if (input.status === 'SENT')
          return mapInvoice(await issueInvoice(tx, input.id, ctx.user.id));
        if (input.status === 'CANCELLED')
          return mapInvoice(await cancelUnpaidInvoice(tx, input.id, ctx.user.id, input.version));
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Le statut de paiement et le retard sont calculés automatiquement',
        });
      }),
    ),

  delete: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');
        const document = await tx.invoice.findFirst({
          where: { id: input.id, deletedAt: null },
          select: { status: true },
        });
        if (!document) throw new TRPCError({ code: 'NOT_FOUND', message: 'Facture non trouvée' });
        if (document.status !== 'DRAFT')
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Seul un brouillon peut être supprimé',
          });
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
        const regIds = lines.map((l) => l.registrationId).filter((id): id is string => id !== null);

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
   * Programme l'envoi de la facture (ou du devis, tant qu'elle est en
   * brouillon) au parent, PDF en pièce jointe (TD-008, file `alvm-email`).
   *
   * Asynchrone (CLAUDE.md InnovIA §5.11) : la procédure vérifie les
   * préconditions, crée la ligne `email_messages` (QUEUED) et ajoute le job.
   * Le worker régénère le PDF au moment de l'envoi — la pièce jointe reflète
   * l'état du document à cet instant, exactement comme le téléchargement.
   * Le résultat se suit dans `invoices.emailHistory`.
   */
  sendEmail: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(
      z.object({
        success: z.boolean(),
        status: z.literal('QUEUED'),
        recipient: z.string(),
        emailMessageId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { isEmailConfigured, getEmailSender } = await import('@back/services/email.service');

      if (!(await isEmailConfigured())) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            "L'envoi d'email n'est pas configuré sur cet environnement (clé RESEND_API_KEY absente). Contactez l'administrateur.",
        });
      }
      assertEmailQueueConfigured();

      const invoice = await ctx.prisma.invoice.findFirst({
        where: { id: input.id, deletedAt: null },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          totalAmount: true,
          dueDate: true,
          parent: { select: { firstName: true, lastName: true, email: true } },
        },
      });
      if (!invoice) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Facture non trouvée' });
      }

      const recipient: string | null = invoice.parent?.email ?? null;
      if (!recipient) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: "Ce client n'a pas d'adresse email : impossible de lui envoyer le document.",
        });
      }

      const { getPdfSettings } = await import('@back/helpers/pdf-settings.helper');
      const pdfSettings = await getPdfSettings(ctx.prisma);
      // Identité d'expédition vérifiée dès maintenant : un réglage manquant
      // est signalé à l'utilisateur plutôt que découvert par le worker.
      await getEmailSender(ctx.prisma).catch((error: unknown) => {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: error instanceof Error ? error.message : "Identité d'expédition invalide.",
        });
      });

      const { subject } = buildInvoiceEmail(
        { ...invoice, totalAmount: toNum(invoice.totalAmount) },
        pdfSettings.org.shortName || pdfSettings.org.name,
      );

      // En dernier : un échec de la file annule la transaction (pas de ligne orpheline).
      const { emailMessageId } = await enqueueEmail(ctx.prisma, {
        organizationId: ctx.organizationId!,
        kind: 'invoice',
        recipient,
        subject,
        relatedId: invoice.id,
        createdBy: ctx.user.id,
      });

      return { success: true, status: 'QUEUED' as const, recipient, emailMessageId };
    }),

  /**
   * Historique des envois par email d'une facture (file `alvm-email`), du plus
   * récent au plus ancien. Select whitelist (§5.9) : ni identifiant du
   * fournisseur, ni auteur, ni corps (jamais persisté).
   */
  emailHistory: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(
      z.array(
        z.object({
          id: z.string().uuid(),
          recipient: z.string(),
          subject: z.string(),
          status: z.enum(['QUEUED', 'SENT', 'FAILED']),
          attempts: z.number().int(),
          lastError: z.string().nullable(),
          createdAt: z.date(),
          sentAt: z.date().nullable(),
        }),
      ),
    )
    .query(({ ctx, input }) =>
      ctx.prisma.emailMessage.findMany({
        where: { kind: 'invoice', relatedId: input.id },
        select: {
          id: true,
          recipient: true,
          subject: true,
          status: true,
          attempts: true,
          lastError: true,
          createdAt: true,
          sentAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ),

  fetchUnpaidRegistrations: staffProcedure
    .input(z.object({ parentId: z.string().uuid() }))
    .output(
      z.object({
        registrations: z.array(
          z.object({
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
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      const registrations = await ctx.prisma.registration.findMany({
        where: {
          parentId: input.parentId,
          status: 'CONFIRMED',
          paymentStatus: 'UNPAID',
          deletedAt: null,
        },
        select: {
          id: true,
          campId: true,
          childId: true,
          registrationDate: true,
          camp: {
            select: {
              id: true,
              name: true,
              startDate: true,
              endDate: true,
              pricePerDay: true,
              totalPrice: true,
            },
          },
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
            totalAmount:
              r.camp.totalPrice == null
                ? daysCount * toNum(r.camp.pricePerDay)
                : toNum(r.camp.totalPrice),
            status: 'CONFIRMED' as const,
            paymentStatus: 'UNPAID' as const,
          };
        }),
      };
    }),
});
