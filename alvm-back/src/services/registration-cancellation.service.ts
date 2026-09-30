import { TRPCError } from '@trpc/server';
import type { ExtendedPrismaClient } from '@back/db';
import { toNum } from '@back/helpers/decimal';
import { generateDocumentNumber } from '@back/helpers/invoice-number';
import { getCreditExpiryDate } from '@back/helpers/settings';
import { createCreditNoteAccountingEntries, createRefundEntries } from './accounting.service';
type Tx = Omit<
  ExtendedPrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
const money = (value: number) => Math.round(value * 100) / 100;

/**
 * Facture relue pendant l'annulation : montants, statut et lignes actives.
 * Whitelist (§5.9) partagée par la lecture initiale et la relecture finale.
 */
const cancellationInvoiceSelect = {
  id: true,
  invoiceNumber: true,
  parentId: true,
  status: true,
  taxRate: true,
  totalAmount: true,
  paidAmount: true,
  creditedAmount: true,
  lines: {
    where: { deletedAt: null },
    select: { id: true, registrationId: true, totalPrice: true },
  },
} as const;

export async function createCompensationCredit(
  tx: Tx,
  input: {
    invoiceId: string;
    parentId: string;
    amount: number;
    taxRate: number;
    future: boolean;
    userId: string;
    reason: string;
    accountingCode?: string;
    registrationId?: string;
  },
) {
  const expiry = await getCreditExpiryDate(tx);
  const subtotal = money(input.amount / (1 + input.taxRate));
  const credit = await tx.invoice.create({
    data: {
      invoiceNumber: await generateDocumentNumber(tx, 'CREDIT_NOTE'),
      invoiceType: 'CREDIT_NOTE',
      creditedInvoiceId: input.invoiceId,
      parentId: input.parentId,
      status: 'SENT',
      isFutureCredit: input.future,
      refundMethod: input.future ? 'FUTURE_CREDIT' : 'IMMEDIATE_REFUND',
      dueDate: expiry,
      totalAmount: -input.amount,
      subtotalHt: -subtotal,
      taxAmount: -(input.amount - subtotal),
      taxRate: input.taxRate,
      createdById: input.userId,
      validatedById: input.userId,
      notes: input.reason,
    },
  });
  await tx.invoiceLine.create({
    data: {
      invoiceId: credit.id,
      registrationId: input.registrationId ?? null,
      description: input.reason,
      quantity: 1,
      unitPrice: subtotal,
      totalPrice: subtotal,
    },
  });
  await createCreditNoteAccountingEntries(tx, {
    creditNoteId: credit.id,
    parentId: input.parentId,
    creditNoteNumber: credit.invoiceNumber,
    issueDate: credit.issueDate,
    subtotalHt: subtotal,
    taxAmount: input.amount - subtotal,
    totalAmount: input.amount,
    taxRate: input.taxRate,
    accountingCode: input.accountingCode ?? '706000',
    isFutureCredit: input.future,
    userId: input.userId,
  });
  if (input.future)
    await tx.parentCredit.create({
      data: {
        parentId: input.parentId,
        creditNoteId: credit.id,
        amountOriginal: input.amount,
        amountRemaining: input.amount,
        expiresAt: expiry,
        notes: input.reason,
      },
    });
  return credit;
}

export async function cancelRegistrationWithAccounting(
  tx: Tx,
  input: {
    registrationId: string;
    reason: string;
    refundChoice?: 'IMMEDIATE_REFUND' | 'FUTURE_CREDIT';
    paymentMethodCode?: 'CASH' | 'CHECK' | 'BANK_TRANSFER';
  },
  userId: string,
) {
  const reg = await tx.registration.findFirst({
    where: { id: input.registrationId, deletedAt: null },
    select: {
      id: true,
      campId: true,
      status: true,
      camp: { select: { campType: { select: { accountingCode: true } } } },
    },
  });
  if (!reg) throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscription non trouvée' });
  if (reg.status === 'CANCELLED')
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Inscription inactive ou déjà annulée',
    });
  const invoice = await tx.invoice.findFirst({
    where: {
      invoiceType: 'INVOICE',
      deletedAt: null,
      status: { notIn: ['CANCELLED', 'CREDITED'] },
      lines: { some: { registrationId: reg.id, deletedAt: null } },
    },
    select: cancellationInvoiceSelect,
  });
  let caseType:
    | 'NO_INVOICE'
    | 'DRAFT_INVOICE'
    | 'SENT_UNPAID'
    | 'PARTIALLY_PAID'
    | 'FULLY_PAID_REFUND'
    | 'FULLY_PAID_CREDIT' = 'NO_INVOICE';
  let creditNote: { id: string; invoiceNumber: string; amount: number } | null = null;
  let refund: { id: string; amount: number; method: string } | null = null;
  let resultingInvoice = invoice;
  if (invoice) {
    const affected = invoice.lines.filter((l) => l.registrationId === reg.id);
    const subtotal = affected.reduce((sum, line) => sum + toNum(line.totalPrice), 0);
    const amount = money(subtotal * (1 + toNum(invoice.taxRate)));
    const effectiveTotal = toNum(invoice.totalAmount) - toNum(invoice.creditedAmount);
    if (amount > effectiveTotal + 0.01)
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Montant déjà compensé : vérifiez les avoirs existants',
      });
    // Partial receipts are attributed proportionally to the remaining services.
    const paidShare =
      effectiveTotal > 0
        ? money(Math.min(amount, (toNum(invoice.paidAmount) * amount) / effectiveTotal))
        : 0;
    if (invoice.status === 'DRAFT') {
      caseType = 'DRAFT_INVOICE';
      await tx.invoiceLine.updateMany({
        where: { id: { in: affected.map((l) => l.id) } },
        data: { deletedAt: new Date() },
      });
      const rest = invoice.lines.filter((l) => l.registrationId !== reg.id);
      const newSubtotal = rest.reduce((sum, l) => sum + toNum(l.totalPrice), 0);
      const tax = money(newSubtotal * toNum(invoice.taxRate));
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          subtotalHt: newSubtotal,
          taxAmount: tax,
          totalAmount: newSubtotal + tax,
          status: rest.length ? 'DRAFT' : 'CANCELLED',
          pdfUrl: null,
          version: { increment: 1 },
        },
      });
    } else {
      const future = input.refundChoice === 'FUTURE_CREDIT';
      caseType =
        paidShare === 0
          ? 'SENT_UNPAID'
          : paidShare < amount
            ? 'PARTIALLY_PAID'
            : future
              ? 'FULLY_PAID_CREDIT'
              : 'FULLY_PAID_REFUND';
      const parts =
        future && paidShare > 0
          ? [
              { amount: paidShare, future: true },
              { amount: money(amount - paidShare), future: false },
            ]
          : [{ amount, future: false }];
      for (const part of parts) {
        if (part.amount <= 0) continue;
        const cn = await createCompensationCredit(tx, {
          invoiceId: invoice.id,
          parentId: invoice.parentId,
          amount: part.amount,
          taxRate: toNum(invoice.taxRate),
          future: part.future,
          userId,
          reason: input.reason,
          registrationId: reg.id,
          accountingCode: reg.camp.campType.accountingCode ?? '706000',
        });
        if (!creditNote)
          creditNote = { id: cn.id, invoiceNumber: cn.invoiceNumber, amount: part.amount };
      }
      if (paidShare > 0) {
        const method = !future
          ? await tx.paymentMethod.findFirst({
              where: { code: input.paymentMethodCode ?? 'BANK_TRANSFER', active: true },
              select: { code: true, accountingCode: true },
            })
          : null;
        if (!future && !method)
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Moyen de remboursement indisponible',
          });
        const payments = await tx.payment.findMany({
          where: { invoiceId: invoice.id },
          orderBy: [{ paymentDate: 'desc' }, { id: 'asc' }],
          select: {
            id: true,
            amount: true,
            creditNoteId: true,
            refunds: { where: { deletedAt: null }, select: { amount: true } },
          },
        });
        let remaining = paidShare;
        for (const payment of payments) {
          const available =
            toNum(payment.amount) - payment.refunds.reduce((sum, r) => sum + toNum(r.amount), 0);
          const portion = money(Math.min(remaining, available));
          if (portion <= 0) continue;
          if (payment.creditNoteId)
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'Restituez d’abord le règlement par avoir avant cette annulation',
            });
          const row = await tx.refund.create({
            data: {
              refundNumber: await generateDocumentNumber(tx, 'REFUND'),
              paymentId: payment.id,
              creditNoteId: creditNote?.id,
              amount: portion,
              refundDate: new Date(),
              refundMethod: future ? 'FUTURE_CREDIT' : 'IMMEDIATE_REFUND',
              reason: input.reason,
              recordedBy: userId,
              reference: method?.code ?? 'FUTURE_CREDIT',
              notes: creditNote ? `Avoir ${creditNote.invoiceNumber}` : null,
            },
          });
          if (!future)
            await createRefundEntries(tx, {
              refundId: row.id,
              paymentId: payment.id,
              parentId: invoice.parentId,
              amount: portion,
              refundDate: row.refundDate,
              refundMethod: 'IMMEDIATE_REFUND',
              originalPaymentMethodAccountingCode: method!.accountingCode ?? '512000',
              invoiceNumber: invoice.invoiceNumber,
              userId,
            });
          if (!refund) refund = { id: row.id, amount: paidShare, method: row.refundMethod };
          remaining = money(remaining - portion);
        }
        if (remaining > 0)
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Les encaissements disponibles ne couvrent pas la compensation',
          });
      }
      const credited = money(toNum(invoice.creditedAmount) + amount);
      const paid = money(toNum(invoice.paidAmount) - paidShare);
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          creditedAmount: credited,
          paidAmount: paid,
          status:
            credited >= toNum(invoice.totalAmount)
              ? 'CREDITED'
              : paid >= toNum(invoice.totalAmount) - credited
                ? 'PAID'
                : 'SENT',
          pdfUrl: null,
          version: { increment: 1 },
        },
      });
    }
    resultingInvoice = await tx.invoice.findFirst({
      where: { id: invoice.id },
      select: cancellationInvoiceSelect,
    });
  }
  await tx.registration.update({
    where: { id: reg.id },
    data: {
      status: 'CANCELLED',
      cancellationDate: new Date(),
      cancellationReason: input.reason,
      cancellationRequestedAt: null,
      cancelledBy: userId,
      paymentStatus: 'REFUNDED',
    },
  });
  const waitlisted = await tx.registration.findFirst({
    where: { campId: reg.campId, status: 'WAITLIST', deletedAt: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  if (waitlisted)
    await tx.registration.update({ where: { id: waitlisted.id }, data: { status: 'PENDING' } });
  return {
    success: true,
    case: caseType,
    invoice: resultingInvoice
      ? {
          id: resultingInvoice.id,
          invoiceNumber: resultingInvoice.invoiceNumber,
          status: resultingInvoice.status,
          totalAmount: toNum(resultingInvoice.totalAmount),
          paidAmount: toNum(resultingInvoice.paidAmount),
        }
      : null,
    creditNote,
    refund,
  };
}
