import { TRPCError } from '@trpc/server';
import type { ExtendedPrismaClient } from '@/server/db';
import { toNum } from '@/server/helpers/decimal';
import { createInvoiceAccountingEntries, reverseAccountingEntries } from './accounting.service';
import { applyAvailableCreditsToInvoice } from './credit-application.service';
type Tx = Omit<
  ExtendedPrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export async function validateInvoiceRegistrations(
  tx: Tx,
  parentId: string,
  ids: Array<string | null>,
  invoiceId?: string,
) {
  const registrations = ids.filter((id): id is string => Boolean(id));
  if (new Set(registrations).size !== registrations.length)
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Inscription facturée plusieurs fois' });
  for (const id of registrations) {
    const registration = await tx.registration.findFirst({
      where: { id, parentId, deletedAt: null, status: { not: 'CANCELLED' } },
    });
    if (!registration)
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Inscription inactive ou appartenant à un autre client',
      });
    const line = await tx.invoiceLine.findFirst({
      where: {
        registrationId: id,
        deletedAt: null,
        invoice: {
          invoiceType: 'INVOICE',
          deletedAt: null,
          status: { notIn: ['CANCELLED', 'CREDITED'] },
          ...(invoiceId ? { id: { not: invoiceId } } : {}),
        },
      },
    });
    if (line)
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Une facture active existe déjà pour cette inscription',
      });
  }
}

export async function issueInvoice(tx: Tx, id: string, userId: string) {
  const invoice = await tx.invoice.findFirst({
    where: { id, invoiceType: 'INVOICE', deletedAt: null },
  });
  if (!invoice) throw new TRPCError({ code: 'NOT_FOUND', message: 'Facture non trouvée' });
  if (invoice.status !== 'DRAFT')
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Seul un brouillon peut être émis',
    });
  await createInvoiceAccountingEntries(tx, {
    invoiceId: id,
    parentId: invoice.parentId,
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    subtotalHt: toNum(invoice.subtotalHt),
    taxAmount: toNum(invoice.taxAmount),
    totalAmount: toNum(invoice.totalAmount),
    taxRate: toNum(invoice.taxRate),
    accountingCode: '706000',
    userId,
  });
  const credits = await applyAvailableCreditsToInvoice(tx, {
    invoiceId: id,
    invoiceNumber: invoice.invoiceNumber,
    parentId: invoice.parentId,
    totalAmount: toNum(invoice.totalAmount),
    paidAmount: toNum(invoice.paidAmount),
    userId,
  });
  return tx.invoice.update({
    where: { id },
    data: {
      status: credits.remainingDue <= 0 ? 'PAID' : 'SENT',
      paidAmount: toNum(invoice.paidAmount) + credits.totalApplied,
      validatedById: userId,
      pdfUrl: null,
      version: { increment: 1 },
    },
  });
}

export async function cancelUnpaidInvoice(tx: Tx, id: string, userId: string, version?: number) {
  const invoice = await tx.invoice.findFirst({
    where: { id, invoiceType: 'INVOICE', deletedAt: null },
  });
  if (
    !invoice ||
    !['DRAFT', 'SENT', 'OVERDUE'].includes(invoice.status) ||
    toNum(invoice.paidAmount) > 0
  )
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Utilisez un avoir et le parcours de remboursement pour cette facture',
    });
  if (version !== undefined && invoice.version !== version)
    throw new TRPCError({ code: 'CONFLICT', message: 'Rechargez la facture modifiée' });
  if (invoice.status !== 'DRAFT') await reverseAccountingEntries(tx, { invoiceId: id }, userId);
  return tx.invoice.update({
    where: { id },
    data: { status: 'CANCELLED', pdfUrl: null, version: { increment: 1 } },
  });
}
