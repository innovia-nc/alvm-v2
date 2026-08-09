/**
 * US-FACT-02 — déduction automatique des avoirs sur la facture suivante.
 *
 * Couvre la règle FIFO, l'imputation partielle, le report du solde, la
 * traçabilité (CreditApplication + CreditNoteAllocation) et la contrepartie
 * comptable (écriture BQ D 4191 / C 411000 via un paiement « Avoir »).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockPrisma, type MockPrisma } from '../helpers/mock-prisma';
import { applyAvailableCreditsToInvoice } from '@/server/services/credit-application.service';

const INVOICE_ID = 'a0000000-0000-1000-a000-000000000001';
const PARENT_ID = 'b0000000-0000-1000-a000-000000000001';
const USER_ID = 'c0000000-0000-1000-a000-000000000001';
const METHOD_ID = 'd0000000-0000-1000-a000-000000000001';

const NOW = new Date('2026-08-09T10:00:00Z');

let tx: MockPrisma;

/** Fabrique un crédit parent (avoir FUTURE_CREDIT déjà émis). */
function makeCredit(overrides: {
  id: string;
  creditNoteId: string;
  creditNoteNumber: string;
  amountRemaining: number;
  status?: string;
  expiresAt?: Date | null;
}) {
  return {
    id: overrides.id,
    creditNoteId: overrides.creditNoteId,
    parentId: PARENT_ID,
    amountOriginal: overrides.amountRemaining,
    amountRemaining: overrides.amountRemaining,
    expiresAt: overrides.expiresAt ?? null,
    creditNote: {
      id: overrides.creditNoteId,
      invoiceNumber: overrides.creditNoteNumber,
      status: overrides.status ?? 'SENT',
      isFutureCredit: true,
    },
  };
}

function baseParams(overrides: Record<string, unknown> = {}) {
  return {
    invoiceId: INVOICE_ID,
    invoiceNumber: 'FAC-2026-0042',
    parentId: PARENT_ID,
    totalAmount: 10000,
    paidAmount: 0,
    userId: USER_ID,
    now: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  tx = createMockPrisma();
  tx.paymentMethod.findFirst.mockResolvedValue({
    id: METHOD_ID,
    code: 'CREDIT_NOTE',
    accountingCode: '411000',
  });
  tx.payment.create.mockImplementation(async ({ data }: { data: { amount: number } }) => ({
    id: 'p-' + data.amount,
    ...data,
  }));
});

describe('applyAvailableCreditsToInvoice — règle FIFO (US-FACT-02)', () => {
  it('déduit un avoir de 2 000 sur une facture de 10 000 → reste dû 8 000', async () => {
    tx.parentCredit.findMany.mockResolvedValue([
      makeCredit({ id: 'cr1', creditNoteId: 'cn1', creditNoteNumber: 'AVO-1', amountRemaining: 2000 }),
    ]);

    const result = await applyAvailableCreditsToInvoice(tx, baseParams());

    expect(result.totalApplied).toBe(2000);
    expect(result.remainingDue).toBe(8000);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]).toMatchObject({
      creditNoteNumber: 'AVO-1',
      amountUsed: 2000,
      amountRemaining: 0,
    });
  });

  it('solde la facture et conserve le reliquat quand l\'avoir dépasse le montant dû', async () => {
    tx.parentCredit.findMany.mockResolvedValue([
      makeCredit({ id: 'cr1', creditNoteId: 'cn1', creditNoteNumber: 'AVO-1', amountRemaining: 15000 }),
    ]);

    const result = await applyAvailableCreditsToInvoice(tx, baseParams());

    expect(result.totalApplied).toBe(10000);
    expect(result.remainingDue).toBe(0);
    // Le solde de 5 000 reste disponible pour une facture ultérieure.
    expect(result.applied[0].amountRemaining).toBe(5000);
    expect(tx.parentCredit.update).toHaveBeenCalledWith({
      where: { id: 'cr1' },
      data: { amountRemaining: 5000 },
    });
  });

  it('applique plusieurs avoirs du plus ancien au plus récent', async () => {
    tx.parentCredit.findMany.mockResolvedValue([
      makeCredit({ id: 'cr1', creditNoteId: 'cn1', creditNoteNumber: 'AVO-ANCIEN', amountRemaining: 1000 }),
      makeCredit({ id: 'cr2', creditNoteId: 'cn2', creditNoteNumber: 'AVO-RECENT', amountRemaining: 1500 }),
    ]);

    const result = await applyAvailableCreditsToInvoice(tx, baseParams());

    expect(result.applied.map((a) => a.creditNoteNumber)).toEqual([
      'AVO-ANCIEN',
      'AVO-RECENT',
    ]);
    expect(result.totalApplied).toBe(2500);
    expect(result.remainingDue).toBe(7500);
  });

  it('interroge les crédits en FIFO, non expirés et à solde positif', async () => {
    tx.parentCredit.findMany.mockResolvedValue([]);

    await applyAvailableCreditsToInvoice(tx, baseParams());

    const call = tx.parentCredit.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ createdAt: 'asc' });
    expect(call.where.parentId).toBe(PARENT_ID);
    expect(call.where.amountRemaining).toEqual({ gt: 0 });
    expect(call.where.OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: NOW } }]);
  });

  it('s\'arrête dès que la facture est soldée, sans toucher aux avoirs suivants', async () => {
    tx.parentCredit.findMany.mockResolvedValue([
      makeCredit({ id: 'cr1', creditNoteId: 'cn1', creditNoteNumber: 'AVO-1', amountRemaining: 10000 }),
      makeCredit({ id: 'cr2', creditNoteId: 'cn2', creditNoteNumber: 'AVO-2', amountRemaining: 5000 }),
    ]);

    const result = await applyAvailableCreditsToInvoice(tx, baseParams());

    expect(result.applied).toHaveLength(1);
    expect(tx.parentCredit.update).toHaveBeenCalledTimes(1);
  });

  it('ignore les avoirs annulés', async () => {
    tx.parentCredit.findMany.mockResolvedValue([
      makeCredit({
        id: 'cr1', creditNoteId: 'cn1', creditNoteNumber: 'AVO-ANNULE',
        amountRemaining: 5000, status: 'CANCELLED',
      }),
    ]);

    const result = await applyAvailableCreditsToInvoice(tx, baseParams());

    expect(result.totalApplied).toBe(0);
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('ne fait rien quand le client n\'a aucun crédit', async () => {
    tx.parentCredit.findMany.mockResolvedValue([]);

    const result = await applyAvailableCreditsToInvoice(tx, baseParams());

    expect(result.totalApplied).toBe(0);
    expect(result.remainingDue).toBe(10000);
    expect(tx.paymentMethod.findFirst).not.toHaveBeenCalled();
  });

  it('ne fait rien sur une facture déjà soldée', async () => {
    const result = await applyAvailableCreditsToInvoice(
      tx,
      baseParams({ totalAmount: 10000, paidAmount: 10000 })
    );

    expect(result.totalApplied).toBe(0);
    expect(tx.parentCredit.findMany).not.toHaveBeenCalled();
  });

  it('ne fait rien sur une facture à 0 XPF', async () => {
    const result = await applyAvailableCreditsToInvoice(tx, baseParams({ totalAmount: 0 }));

    expect(result.totalApplied).toBe(0);
    expect(tx.parentCredit.findMany).not.toHaveBeenCalled();
  });
});

describe('applyAvailableCreditsToInvoice — traçabilité', () => {
  beforeEach(() => {
    tx.parentCredit.findMany.mockResolvedValue([
      makeCredit({ id: 'cr1', creditNoteId: 'cn1', creditNoteNumber: 'AVO-1', amountRemaining: 2000 }),
    ]);
  });

  it('écrit une CreditApplication (montant, date, facture, opérateur)', async () => {
    await applyAvailableCreditsToInvoice(tx, baseParams());

    expect(tx.creditApplication.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        parentCreditId: 'cr1',
        invoiceId: INVOICE_ID,
        amountUsed: 2000,
        appliedAt: NOW,
        appliedBy: USER_ID,
      }),
    });
  });

  it('écrit une CreditNoteAllocation pour bloquer une double consommation manuelle', async () => {
    await applyAvailableCreditsToInvoice(tx, baseParams());

    expect(tx.creditNoteAllocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        creditNoteId: 'cn1',
        appliedToInvoiceId: INVOICE_ID,
        amount: 2000,
        recordedBy: USER_ID,
      }),
    });
  });

  it('crée un paiement « Avoir » rattaché à l\'avoir consommé', async () => {
    await applyAvailableCreditsToInvoice(tx, baseParams());

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invoiceId: INVOICE_ID,
        amount: 2000,
        paymentMethodId: METHOD_ID,
        creditNoteId: 'cn1',
        recordedBy: USER_ID,
      }),
    });
  });
});

describe('applyAvailableCreditsToInvoice — contrepartie comptable', () => {
  beforeEach(() => {
    tx.parentCredit.findMany.mockResolvedValue([
      makeCredit({ id: 'cr1', creditNoteId: 'cn1', creditNoteNumber: 'AVO-1', amountRemaining: 2000 }),
    ]);
  });

  it('génère une écriture BQ équilibrée D 4191 / C 411000', async () => {
    await applyAvailableCreditsToInvoice(tx, baseParams());

    const entries = tx.accountingEntry.create.mock.calls.map(
      (c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data
    );

    expect(entries).toHaveLength(2);

    const debit = entries.find((e) => Number(e.debit) > 0)!;
    const credit = entries.find((e) => Number(e.credit) > 0)!;

    expect(debit.accountNumber).toBe('4191');
    expect(debit.debit).toBe(2000);
    expect(credit.accountNumber).toBe('411000');
    expect(credit.credit).toBe(2000);
    // Invariant comptable : la partie double est équilibrée.
    expect(Number(debit.debit)).toBe(Number(credit.credit));
    expect(entries.every((e) => e.journalCode === 'BQ')).toBe(true);
  });

  it('échoue explicitement si la méthode de règlement « Avoir » est absente', async () => {
    tx.paymentMethod.findFirst.mockResolvedValue(null);

    await expect(applyAvailableCreditsToInvoice(tx, baseParams())).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });

    // Aucune imputation partielle : rien n'a été écrit avant l'échec.
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.parentCredit.update).not.toHaveBeenCalled();
  });
});

describe('applyAvailableCreditsToInvoice — imputation partielle multi-avoirs', () => {
  it('consomme entièrement le premier avoir puis entame le second', async () => {
    tx.parentCredit.findMany.mockResolvedValue([
      makeCredit({ id: 'cr1', creditNoteId: 'cn1', creditNoteNumber: 'AVO-1', amountRemaining: 3000 }),
      makeCredit({ id: 'cr2', creditNoteId: 'cn2', creditNoteNumber: 'AVO-2', amountRemaining: 4000 }),
    ]);

    const result = await applyAvailableCreditsToInvoice(tx, baseParams({ totalAmount: 5000 }));

    expect(result.applied).toEqual([
      expect.objectContaining({ creditNoteNumber: 'AVO-1', amountUsed: 3000, amountRemaining: 0 }),
      expect.objectContaining({ creditNoteNumber: 'AVO-2', amountUsed: 2000, amountRemaining: 2000 }),
    ]);
    expect(result.remainingDue).toBe(0);
  });
});

describe('applyAvailableCreditsToInvoice — idempotence des numéros de paiement', () => {
  it('génère un numéro de paiement distinct par imputation', async () => {
    let seq = 0;
    tx.$queryRawUnsafe.mockImplementation(async (query: string) => {
      if (query.includes('nextval(')) return [{ nextval: ++seq }];
      return [];
    });
    tx.parentCredit.findMany.mockResolvedValue([
      makeCredit({ id: 'cr1', creditNoteId: 'cn1', creditNoteNumber: 'AVO-1', amountRemaining: 1000 }),
      makeCredit({ id: 'cr2', creditNoteId: 'cn2', creditNoteNumber: 'AVO-2', amountRemaining: 1000 }),
    ]);

    await applyAvailableCreditsToInvoice(tx, baseParams());

    const numbers = tx.payment.create.mock.calls.map(
      (c: unknown[]) => (c[0] as { data: { paymentNumber: string } }).data.paymentNumber
    );
    expect(new Set(numbers).size).toBe(2);
  });
});
