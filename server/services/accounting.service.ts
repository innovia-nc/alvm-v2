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

/**
 * Transaction client type — compatible with both PrismaClient and
 * extended clients (soft-delete extension, $transaction callback).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxClient = any;

/**
 * Derives a deterministic auxiliary account code from a parent UUID.
 */
export function deriveClientAux(parentId: string): string {
  return 'AUX' + parentId.replace(/-/g, '').slice(0, 8);
}

/**
 * Generates the next accounting entry number for a given journal code.
 * Format: {journalCode} + YYYYMMDD + 4-digit sequence
 */
let accountingSeqEnsured = false;

async function nextEntryNum(tx: TxClient, journalCode: string): Promise<string> {
  if (!accountingSeqEnsured) {
    await tx.$executeRawUnsafe('CREATE SEQUENCE IF NOT EXISTS accounting_entry_seq');
    accountingSeqEnsured = true;
  }
  const result: [{ entry_num: string }] = await tx.$queryRawUnsafe(
    `SELECT $1 || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD(nextval('accounting_entry_seq')::TEXT, 4, '0') as entry_num`,
    journalCode,
  );
  return result[0].entry_num;
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
  await tx.accountingEntry.create({
    data: {
      invoiceId,
      journalCode: 'VE',
      journalLib: 'Journal de ventes',
      entryNum,
      entryDate: issueDate,
      accountNumber: accountingCode,
      accountLabel: 'Ventes',
      pieceRef: invoiceNumber,
      pieceDate: issueDate,
      description,
      debit: 0,
      credit: subtotalHt,
      validDate: issueDate,
      createdBy: userId,
    },
  });

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
  await tx.accountingEntry.create({
    data: {
      creditNoteId,
      journalCode: 'VE',
      journalLib: 'Journal de ventes',
      entryNum,
      entryDate: issueDate,
      accountNumber: accountingCode,
      accountLabel: 'Ventes',
      pieceRef: creditNoteNumber,
      pieceDate: issueDate,
      description,
      debit: subtotalHt,
      credit: 0,
      validDate: issueDate,
      createdBy: userId,
    },
  });

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
}

export async function cancelAccountingEntries(
  tx: TxClient,
  filter: CancelEntriesFilter,
  userId: string,
): Promise<void> {
  await tx.accountingEntry.updateMany({
    where: {
      ...filter,
      isCancelled: false,
    },
    data: {
      isCancelled: true,
      cancelledAt: new Date(),
      cancelledBy: userId,
      cancellationReason: 'Suppression associée',
    },
  });
}
