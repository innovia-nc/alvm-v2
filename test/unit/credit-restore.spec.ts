/**
 * TD-003 — restitution d'un crédit à la suppression d'un règlement par avoir.
 *
 * Avant correctif, `payments.delete` annulait bien les écritures comptables mais
 * laissait l'avoir compté comme consommé : ni la `CreditNoteAllocation`, ni la
 * `CreditApplication`, ni `ParentCredit.amountRemaining` n'étaient repris.
 *
 * Ce fichier couvre aussi l'invariant qui rendait le défaut dangereux : les deux
 * vues du solde d'un avoir (allocations agrégées côté chemin manuel,
 * `amountRemaining` côté imputation automatique) doivent être tenues à jour par
 * LES DEUX chemins. Sinon un avoir consommé à la main reste « plein » pour le
 * FIFO, qui le réimpute — et le compte 4191 est débité plus qu'il n'a été crédité.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockPrisma, type MockPrisma } from '../helpers/mock-prisma';
import {
  restoreCreditOnPaymentDeletion,
  applyAvailableCreditsToInvoice,
} from '@/server/services/credit-application.service';

const INVOICE_ID = 'a0000000-0000-1000-a000-000000000001';
const PARENT_ID = 'b0000000-0000-1000-a000-000000000001';
const USER_ID = 'c0000000-0000-1000-a000-000000000001';
const CREDIT_NOTE_ID = 'e0000000-0000-1000-a000-000000000001';

let tx: MockPrisma;

beforeEach(() => {
  tx = createMockPrisma();
});

function arrangeAllocation(amount: number) {
  tx.creditNoteAllocation.findFirst.mockResolvedValue({
    id: 'alloc1',
    creditNoteId: CREDIT_NOTE_ID,
    appliedToInvoiceId: INVOICE_ID,
    amount,
  });
}

function arrangeParentCredit(original: number, remaining: number) {
  tx.parentCredit.findFirst.mockResolvedValue({
    id: 'cr1',
    creditNoteId: CREDIT_NOTE_ID,
    parentId: PARENT_ID,
    amountOriginal: original,
    amountRemaining: remaining,
  });
}

const params = { creditNoteId: CREDIT_NOTE_ID, invoiceId: INVOICE_ID, amount: 2000 };

describe('restoreCreditOnPaymentDeletion — solde du crédit (TD-003)', () => {
  it('recrédite le solde du montant du règlement supprimé', async () => {
    arrangeAllocation(2000);
    arrangeParentCredit(5000, 3000);

    await restoreCreditOnPaymentDeletion(tx, params);

    expect(tx.parentCredit.update).toHaveBeenCalledWith({
      where: { id: 'cr1' },
      data: { amountRemaining: 5000 },
    });
  });

  it('ne gonfle jamais le crédit au-delà de son montant initial', async () => {
    // Solde déjà à son maximum : une suppression rejouée ne doit rien créer.
    arrangeAllocation(2000);
    arrangeParentCredit(5000, 5000);

    await restoreCreditOnPaymentDeletion(tx, params);

    expect(tx.parentCredit.update).toHaveBeenCalledWith({
      where: { id: 'cr1' },
      data: { amountRemaining: 5000 },
    });
  });

  it("supprime l'allocation quand elle correspond exactement au règlement", async () => {
    arrangeAllocation(2000);
    arrangeParentCredit(5000, 3000);

    await restoreCreditOnPaymentDeletion(tx, params);

    expect(tx.creditNoteAllocation.delete).toHaveBeenCalledWith({ where: { id: 'alloc1' } });
    expect(tx.creditNoteAllocation.update).not.toHaveBeenCalled();
  });

  it("décrémente l'allocation quand elle couvre plusieurs règlements", async () => {
    arrangeAllocation(5000);
    arrangeParentCredit(5000, 0);

    await restoreCreditOnPaymentDeletion(tx, params);

    expect(tx.creditNoteAllocation.update).toHaveBeenCalledWith({
      where: { id: 'alloc1' },
      data: { amount: 3000 },
    });
    expect(tx.creditNoteAllocation.delete).not.toHaveBeenCalled();
  });

  it("retire la ligne d'historique correspondante", async () => {
    arrangeAllocation(2000);
    arrangeParentCredit(5000, 3000);
    tx.creditApplication.findFirst.mockResolvedValue({ id: 'app1' });

    await restoreCreditOnPaymentDeletion(tx, params);

    expect(tx.creditApplication.findFirst).toHaveBeenCalledWith({
      where: { parentCreditId: 'cr1', invoiceId: INVOICE_ID, amountUsed: 2000 },
      orderBy: { appliedAt: 'desc' },
    });
    expect(tx.creditApplication.delete).toHaveBeenCalledWith({ where: { id: 'app1' } });
  });

  it('reste sans effet pour un avoir sans crédit futur', async () => {
    // IMMEDIATE_REFUND : allocation possible, mais aucun ParentCredit.
    arrangeAllocation(2000);
    tx.parentCredit.findFirst.mockResolvedValue(null);

    await restoreCreditOnPaymentDeletion(tx, params);

    expect(tx.parentCredit.update).not.toHaveBeenCalled();
    expect(tx.creditApplication.delete).not.toHaveBeenCalled();
  });

  it('ne fait rien sur un montant nul', async () => {
    await restoreCreditOnPaymentDeletion(tx, { ...params, amount: 0 });

    expect(tx.creditNoteAllocation.findFirst).not.toHaveBeenCalled();
    expect(tx.parentCredit.findFirst).not.toHaveBeenCalled();
  });
});

describe('cycle imputation → suppression → réimputation', () => {
  it('rend le crédit à nouveau disponible pour le FIFO', async () => {
    // 1. Imputation automatique de 2 000 sur une facture de 10 000.
    tx.paymentMethod.findFirst.mockResolvedValue({
      id: 'pm1',
      code: 'CREDIT_NOTE',
      accountingCode: '411000',
    });
    tx.payment.create.mockResolvedValue({ id: 'pay1' });
    tx.parentCredit.findMany.mockResolvedValue([
      {
        id: 'cr1',
        creditNoteId: CREDIT_NOTE_ID,
        parentId: PARENT_ID,
        amountOriginal: 2000,
        amountRemaining: 2000,
        expiresAt: null,
        creditNote: {
          id: CREDIT_NOTE_ID,
          invoiceNumber: 'AVO-1',
          status: 'SENT',
          isFutureCredit: true,
        },
      },
    ]);

    const applied = await applyAvailableCreditsToInvoice(tx, {
      invoiceId: INVOICE_ID,
      invoiceNumber: 'FAC-1',
      parentId: PARENT_ID,
      totalAmount: 10000,
      paidAmount: 0,
      userId: USER_ID,
      now: new Date('2026-08-10T00:00:00Z'),
    });

    expect(applied.totalApplied).toBe(2000);
    expect(tx.parentCredit.update).toHaveBeenCalledWith({
      where: { id: 'cr1' },
      data: { amountRemaining: 0 },
    });

    // 2. Suppression du règlement : le solde doit revenir à 2 000.
    tx.parentCredit.update.mockClear();
    arrangeAllocation(2000);
    arrangeParentCredit(2000, 0);

    await restoreCreditOnPaymentDeletion(tx, params);

    expect(tx.parentCredit.update).toHaveBeenCalledWith({
      where: { id: 'cr1' },
      data: { amountRemaining: 2000 },
    });
  });
});
