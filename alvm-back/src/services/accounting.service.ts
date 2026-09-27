/**
 * Accounting service — generates all accounting entries (VE + BQ).
 *
 * In the monolith, ALL accounting entries are generated in TypeScript.
 * No more SQL triggers. This service replaces both:
 * - The SQL triggers (generate_invoice_accounting_entries, generate_credit_note_accounting_entries)
 * - The TypeScript helper (accounting.helper.ts for BQ entries)
 *
 * Atomicity is guaranteed by Prisma $transaction.
 */

import { nextCounterValue } from '@back/helpers/invoice-number';

/**
 * Transaction client type — compatible with both PrismaClient and
 * extended clients (soft-delete extension, $transaction callback).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxClient = any;

/**
 * Derives a deterministic auxiliary account code from a parent UUID.
 *
 * Privée au module : les quatre appels vivent dans ce fichier, aucun autre ne
 * l'importe. La convention (CLAUDE.md § Comptabilité) veut une seule définition
 * du code auxiliaire — la refonte a justement supprimé son jumeau SQL.
 */
function deriveClientAux(parentId: string): string {
  return 'AUX' + parentId.replace(/-/g, '').slice(0, 8);
}

/**
 * Generates the next accounting entry number for a given journal code.
 * Format: {journalCode} + YYYYMMDD + 4-digit sequence (compteur du tenant).
 */
async function nextEntryNum(tx: TxClient, journalCode: string): Promise<string> {
  const value = await nextCounterValue(tx, 'ACCOUNTING_ENTRY');
  const now = new Date();
  const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `${journalCode}${day}${String(value).padStart(4, '0')}`;
}

// ============================================================================
// Invoice accounting entries (Journal VE) — replaces SQL trigger
// ============================================================================

interface CreateInvoiceEntriesParams {
  invoiceId: string;
  parentId: string;
  invoiceNumber: string;
  issueDate: Date;
  subtotalHt: number;
  taxAmount: number;
  totalAmount: number;
  taxRate: number;
  accountingCode: string;
  userId: string;
}

/**
 * Creates VE (sales journal) accounting entries for an invoice.
 * Called when invoice status transitions to SENT.
 *
 * Entries:
 *   D 411000 (Clients)        = totalAmount
 *   C {accountingCode} (Ventes) = subtotalHt
 *   C 4457 (TGC collectee)    = taxAmount  (if taxAmount > 0)
 */
export async function createInvoiceAccountingEntries(
  tx: TxClient,
  params: CreateInvoiceEntriesParams,
): Promise<void> {
  const {
    invoiceId,
    parentId,
    invoiceNumber,
    issueDate,
    subtotalHt,
    taxAmount,
    totalAmount,
    accountingCode,
    userId,
  } = params;

  // Une facture à 0 XPF n'a aucun impact journal : la contrainte BDD
  // check_debit_or_credit interdit toute ligne 0/0 (legacy factures de test).
  if (totalAmount === 0) return;

  // Guard: skip if entries already exist for this invoice
  const existing = await tx.accountingEntry.count({
    where: { invoiceId, journalCode: 'VE', isCancelled: false },
  });
  if (existing > 0) return;

  const entryNum = await nextEntryNum(tx, 'VE');
  const clientAux = deriveClientAux(parentId);
  const description = `Facture ${invoiceNumber}`;

  // Debit: 411000 Clients
  await tx.accountingEntry.create({
    data: {
      invoiceId,
      journalCode: 'VE',
      journalLib: 'Journal de ventes',
      entryNum,
      entryDate: issueDate,
      accountNumber: '411000',
      accountLabel: 'Clients',
      compteAuxNum: clientAux,
      compteAuxLib: 'Client - ' + invoiceNumber,
      pieceRef: invoiceNumber,
      pieceDate: issueDate,
      description,
      debit: totalAmount,
      credit: 0,
      validDate: issueDate,
      createdBy: userId,
    },
  });

  // Credit: revenue account
  const revenueLines = await tx.invoiceLine.findMany({
    where: { invoiceId: invoiceId, deletedAt: null },
    // Seuls le montant et le code comptable du type d'ACM sont lus (§5.9).
    select: {
      totalPrice: true,
      registration: {
        select: { camp: { select: { campType: { select: { accountingCode: true } } } } },
      },
    },
  });
  const groups = new Map<string, number>();
  for (const line of revenueLines) {
    const code = line.registration?.camp?.campType?.accountingCode || accountingCode;
    groups.set(code, (groups.get(code) ?? 0) + Math.abs(Number(line.totalPrice)));
  }
  if (groups.size === 0) groups.set(accountingCode, subtotalHt);
  const sum = [...groups.values()].reduce((a, b) => a + b, 0);
  let allocated = 0;
  const grouped = [...groups.entries()].map(([code, value], index) => {
    const amount =
      index === groups.size - 1
        ? Math.round((subtotalHt - allocated) * 100) / 100
        : Math.round((sum ? (value / sum) * subtotalHt : 0) * 100) / 100;
    allocated += amount;
    return { code, amount };
  });
  for (const group of grouped) {
    if (group.amount === 0) continue;
    await tx.accountingEntry.create({
      data: {
        invoiceId,
        journalCode: 'VE',
        journalLib: 'Journal de ventes',
        entryNum,
        entryDate: issueDate,
        accountNumber: group.code,
        accountLabel: 'Ventes',
        pieceRef: invoiceNumber,
        pieceDate: issueDate,
        description,
        debit: 0,
        credit: group.amount,
        validDate: issueDate,
        createdBy: userId,
      },
    });
  }

  // Credit: TGC (tax) if applicable
  if (taxAmount > 0) {
    await tx.accountingEntry.create({
      data: {
        invoiceId,
        journalCode: 'VE',
        journalLib: 'Journal de ventes',
        entryNum,
        entryDate: issueDate,
        accountNumber: '4457',
        accountLabel: 'TGC collectee',
        pieceRef: invoiceNumber,
        pieceDate: issueDate,
        description,
        debit: 0,
        credit: taxAmount,
        validDate: issueDate,
        createdBy: userId,
      },
    });
  }
}

// ============================================================================
// Credit note accounting entries (Journal VE) — replaces SQL trigger
// ============================================================================

interface CreateCreditNoteEntriesParams {
  creditNoteId: string;
  parentId: string;
  creditNoteNumber: string;
  issueDate: Date;
  subtotalHt: number;
  taxAmount: number;
  totalAmount: number;
  taxRate: number;
  accountingCode: string;
  isFutureCredit: boolean;
  userId: string;
}

/**
 * Creates VE accounting entries for a credit note.
 * Called when credit note status transitions to SENT.
 *
 * Standard credit note (immediate refund):
 *   D {accountingCode} (Ventes) = subtotalHt
 *   D 4457 (TGC collectee)      = taxAmount
 *   C 411000 (Clients)           = totalAmount
 *
 * Future credit (isFutureCredit=true):
 *   D {accountingCode} (Ventes) = subtotalHt
 *   D 4457 (TGC collectee)      = taxAmount
 *   C 4191 (Avoirs)              = totalAmount
 */
export async function createCreditNoteAccountingEntries(
  tx: TxClient,
  params: CreateCreditNoteEntriesParams,
): Promise<void> {
  const {
    creditNoteId,
    parentId,
    creditNoteNumber,
    issueDate,
    subtotalHt,
    taxAmount,
    totalAmount,
    accountingCode,
    isFutureCredit,
    userId,
  } = params;

  // Même garde que les factures : pas d'écriture 0/0 (check_debit_or_credit).
  if (totalAmount === 0) return;

  // Guard: skip if entries already exist
  const existing = await tx.accountingEntry.count({
    where: { creditNoteId, journalCode: 'VE', isCancelled: false },
  });
  if (existing > 0) return;

  const entryNum = await nextEntryNum(tx, 'VE');
  const clientAux = deriveClientAux(parentId);
  const description = `Avoir ${creditNoteNumber}`;

  // Debit: reverse revenue
  const revenueLines = await tx.invoiceLine.findMany({
    where: { invoiceId: creditNoteId, deletedAt: null },
    // Seuls le montant et le code comptable du type d'ACM sont lus (§5.9).
    select: {
      totalPrice: true,
      registration: {
        select: { camp: { select: { campType: { select: { accountingCode: true } } } } },
      },
    },
  });
  const groups = new Map<string, number>();
  for (const line of revenueLines) {
    const code = line.registration?.camp?.campType?.accountingCode || accountingCode;
    groups.set(code, (groups.get(code) ?? 0) + Math.abs(Number(line.totalPrice)));
  }
  if (groups.size === 0) groups.set(accountingCode, subtotalHt);
  const sum = [...groups.values()].reduce((a, b) => a + b, 0);
  let allocated = 0;
  const grouped = [...groups.entries()].map(([code, value], index) => {
    const amount =
      index === groups.size - 1
        ? Math.round((subtotalHt - allocated) * 100) / 100
        : Math.round((sum ? (value / sum) * subtotalHt : 0) * 100) / 100;
    allocated += amount;
    return { code, amount };
  });
  for (const group of grouped) {
    if (group.amount === 0) continue;
    await tx.accountingEntry.create({
      data: {
        creditNoteId,
        journalCode: 'VE',
        journalLib: 'Journal de ventes',
        entryNum,
        entryDate: issueDate,
        accountNumber: group.code,
        accountLabel: 'Ventes',
        pieceRef: creditNoteNumber,
        pieceDate: issueDate,
        description,
        debit: group.amount,
        credit: 0,
        validDate: issueDate,
        createdBy: userId,
      },
    });
  }

  // Debit: reverse TGC if applicable
  if (taxAmount > 0) {
    await tx.accountingEntry.create({
      data: {
        creditNoteId,
        journalCode: 'VE',
        journalLib: 'Journal de ventes',
        entryNum,
        entryDate: issueDate,
        accountNumber: '4457',
        accountLabel: 'TGC collectee',
        pieceRef: creditNoteNumber,
        pieceDate: issueDate,
        description,
        debit: taxAmount,
        credit: 0,
        validDate: issueDate,
        createdBy: userId,
      },
    });
  }

  // Credit: client account or advance account
  const creditAccount = isFutureCredit ? '4191' : '411000';
  const creditLabel = isFutureCredit ? 'Avoirs - Credit futur' : 'Clients';

  await tx.accountingEntry.create({
    data: {
      creditNoteId,
      journalCode: 'VE',
      journalLib: 'Journal de ventes',
      entryNum,
      entryDate: issueDate,
      accountNumber: creditAccount,
      accountLabel: creditLabel,
      compteAuxNum: clientAux,
      compteAuxLib: 'Client - ' + creditNoteNumber,
      pieceRef: creditNoteNumber,
      pieceDate: issueDate,
      description,
      debit: 0,
      credit: totalAmount,
      validDate: issueDate,
      createdBy: userId,
    },
  });
}

// ============================================================================
// Payment accounting entries (Journal BQ) — migrated from accounting.helper.ts
// ============================================================================

interface CreatePaymentEntriesParams {
  paymentId: string;
  invoiceId: string;
  parentId: string;
  amount: number;
  paymentDate: Date;
  paymentMethodCode: string;
  paymentMethodAccountingCode: string;
  invoiceNumber: string;
  creditNoteIsFutureCredit?: boolean;
  userId: string;
}

/**
 * Creates BQ journal entries for a payment.
 *
 * Normal payment:      D {accountingCode} / C 411000
 * Credit note (future): D 4191 / C 411000
 * Credit note (immediate): no entries
 */
export async function createPaymentEntries(
  tx: TxClient,
  params: CreatePaymentEntriesParams,
): Promise<void> {
  const {
    paymentId,
    invoiceId,
    parentId,
    amount,
    paymentDate,
    paymentMethodCode,
    paymentMethodAccountingCode,
    invoiceNumber,
    creditNoteIsFutureCredit,
    userId,
  } = params;

  // Pas d'écriture 0/0 (check_debit_or_credit) — un paiement nul n'a pas d'impact journal.
  if (amount === 0) return;

  if (paymentMethodCode === 'CREDIT_NOTE' && creditNoteIsFutureCredit === false) {
    return;
  }

  const entryNum = await nextEntryNum(tx, 'BQ');
  const clientAux = deriveClientAux(parentId);

  let debitAccount: string;
  let debitLabel: string;

  if (paymentMethodCode === 'CREDIT_NOTE' && creditNoteIsFutureCredit === true) {
    debitAccount = '4191';
    debitLabel = 'Avoirs - Credit futur';
  } else {
    debitAccount = paymentMethodAccountingCode;
    debitLabel = 'Tresorerie';
  }

  const description = `Paiement ${invoiceNumber}`;

  await tx.accountingEntry.create({
    data: {
      paymentId,
      invoiceId,
      journalCode: 'BQ',
      journalLib: 'Journal de banque',
      entryNum,
      entryDate: paymentDate,
      accountNumber: debitAccount,
      accountLabel: debitLabel,
      pieceRef: invoiceNumber,
      pieceDate: paymentDate,
      description,
      debit: amount,
      credit: 0,
      validDate: paymentDate,
      createdBy: userId,
    },
  });

  await tx.accountingEntry.create({
    data: {
      paymentId,
      invoiceId,
      journalCode: 'BQ',
      journalLib: 'Journal de banque',
      entryNum,
      entryDate: paymentDate,
      accountNumber: '411000',
      accountLabel: 'Clients',
      compteAuxNum: clientAux,
      compteAuxLib: 'Client - ' + invoiceNumber,
      pieceRef: invoiceNumber,
      pieceDate: paymentDate,
      description,
      debit: 0,
      credit: amount,
      validDate: paymentDate,
      createdBy: userId,
    },
  });
}

// ============================================================================
// Refund accounting entries (Journal BQ)
// ============================================================================

interface CreateRefundEntriesParams {
  refundId: string;
  paymentId: string;
  parentId: string;
  amount: number;
  refundDate: Date;
  refundMethod: 'IMMEDIATE_REFUND' | 'FUTURE_CREDIT';
  originalPaymentMethodAccountingCode: string;
  invoiceNumber: string;
  userId: string;
}

/**
 * Creates BQ journal entries for a refund.
 *
 * IMMEDIATE_REFUND: D 411000 / C {accountingCode}
 * FUTURE_CREDIT:    no entries
 */
export async function createRefundEntries(
  tx: TxClient,
  params: CreateRefundEntriesParams,
): Promise<void> {
  const {
    refundId,
    paymentId,
    parentId,
    amount,
    refundDate,
    refundMethod,
    originalPaymentMethodAccountingCode,
    invoiceNumber,
    userId,
  } = params;

  if (refundMethod === 'FUTURE_CREDIT') {
    return;
  }

  // Pas d'écriture 0/0 (check_debit_or_credit) — un remboursement nul n'a pas d'impact journal.
  if (amount === 0) return;

  const entryNum = await nextEntryNum(tx, 'BQ');
  const clientAux = deriveClientAux(parentId);
  const description = `Remboursement ${invoiceNumber}`;

  await tx.accountingEntry.create({
    data: {
      refundId,
      paymentId,
      journalCode: 'BQ',
      journalLib: 'Journal de banque',
      entryNum,
      entryDate: refundDate,
      accountNumber: '411000',
      accountLabel: 'Clients',
      compteAuxNum: clientAux,
      compteAuxLib: 'Client - ' + invoiceNumber,
      pieceRef: invoiceNumber,
      pieceDate: refundDate,
      description,
      debit: amount,
      credit: 0,
      validDate: refundDate,
      createdBy: userId,
    },
  });

  await tx.accountingEntry.create({
    data: {
      refundId,
      paymentId,
      journalCode: 'BQ',
      journalLib: 'Journal de banque',
      entryNum,
      entryDate: refundDate,
      accountNumber: originalPaymentMethodAccountingCode,
      accountLabel: 'Tresorerie',
      pieceRef: invoiceNumber,
      pieceDate: refundDate,
      description,
      debit: 0,
      credit: amount,
      validDate: refundDate,
      createdBy: userId,
    },
  });
}

// ============================================================================
// Cancel accounting entries
// ============================================================================

interface CancelEntriesFilter {
  paymentId?: string;
  refundId?: string;
  invoiceId?: string;
  creditNoteId?: string;
}

export async function cancelAccountingEntries(
  tx: TxClient,
  filter: CancelEntriesFilter,
  userId: string,
): Promise<void> {
  await reverseAccountingEntries(tx, filter, userId);
}

/** Preserve original entries; corrections are dated, balanced reversals. */
export async function reverseAccountingEntries(
  tx: TxClient,
  filter: CancelEntriesFilter,
  userId: string,
): Promise<void> {
  const entries = await tx.accountingEntry.findMany({
    where: { ...filter, isCancelled: false, cancelledAt: null },
  });
  const numbers = new Map<string, string>();
  for (const entry of entries) {
    if (!numbers.has(entry.entryNum))
      numbers.set(entry.entryNum, await nextEntryNum(tx, entry.journalCode));
    const { id, createdAt, updatedAt, ...data } = entry;
    void createdAt;
    void updatedAt;
    await tx.accountingEntry.create({
      data: {
        ...data,
        entryNum: numbers.get(entry.entryNum),
        entryDate: new Date(),
        validDate: new Date(),
        debit: entry.credit,
        credit: entry.debit,
        description: `Contrepassation ${entry.entryNum}`,
        createdBy: userId,
        cancelledAt: new Date(),
        cancelledBy: userId,
        cancellationReason: 'Contrepassation',
      },
    });
    await tx.accountingEntry.update({
      where: { id },
      data: { cancelledAt: new Date(), cancelledBy: userId, cancellationReason: 'Contrepassée' },
    });
  }
}
