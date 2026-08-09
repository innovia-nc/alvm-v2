/**
 * US-FACT-01 — détail des modes de règlement sur le PDF facture,
 * et dette TD-A2 (couverture du mapping/rendu, pas seulement de la requête).
 *
 * Couvre aussi le volet PDF de US-FACT-02 : un règlement issu d'un avoir doit
 * apparaître comme mode de règlement avec le numéro de l'avoir imputé.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { InvoicePDF } from '@/lib/pdf/invoice-pdf';
import { flattenTree, elementText } from '@/test/helpers/react-tree';

type Payment = {
  amount: number;
  paymentDate: Date;
  paymentMethod: string;
  creditNoteNumber?: string | null;
};

function renderInvoice(overrides: {
  payments?: Payment[];
  paidAmount?: number;
  totalAmount?: number;
}) {
  const totalAmount = overrides.totalAmount ?? 10000;

  const element = InvoicePDF({
    data: {
      invoiceNumber: 'FAC-2026-0042',
      issueDate: new Date('2026-08-01'),
      dueDate: new Date('2026-08-31'),
      status: 'SENT',
      parent: {
        firstName: 'Sophie',
        lastName: 'MARTIN',
        email: 's.martin@example.nc',
        address: '12 rue des Cocotiers',
        city: 'Nouméa',
        postalCode: '98800',
      },
      lines: [
        { description: 'Séjour août', quantity: 1, unitPrice: totalAmount, totalPrice: totalAmount },
      ],
      payments: overrides.payments,
      subtotalHt: totalAmount,
      taxAmount: 0,
      taxRate: 0,
      totalAmount,
      paidAmount: overrides.paidAmount ?? 0,
      org: { name: 'ALVM' },
    },
  });

  return flattenTree(element as React.ReactNode).map(elementText);
}

describe('InvoicePDF — modes de règlement (US-FACT-01)', () => {
  it('affiche « Non réglée » quand aucun paiement n\'est enregistré', () => {
    const texts = renderInvoice({ payments: [] });

    expect(texts).toContain('MODES DE RÈGLEMENT');
    expect(texts).toContain('Non réglée');
  });

  it('affiche « Non réglée » quand le champ payments est absent', () => {
    const texts = renderInvoice({});

    expect(texts).toContain('Non réglée');
  });

  it('détaille le mode et le montant pour un règlement unique', () => {
    const texts = renderInvoice({
      payments: [
        { amount: 10000, paymentDate: new Date('2026-08-05'), paymentMethod: 'Virement' },
      ],
      paidAmount: 10000,
    });

    expect(texts).toContain('Virement');
    expect(texts.some((t) => t.includes('10') && t.includes('000'))).toBe(true);
    expect(texts).not.toContain('Non réglée');
  });

  it('rend une ligne distincte par paiement (2 chèques de montants différents)', () => {
    const texts = renderInvoice({
      payments: [
        { amount: 4000, paymentDate: new Date('2026-08-05'), paymentMethod: 'Chèque' },
        { amount: 6000, paymentDate: new Date('2026-08-12'), paymentMethod: 'Chèque' },
      ],
      paidAmount: 10000,
    });

    expect(texts.filter((t) => t === 'Chèque')).toHaveLength(2);
  });

  it('signale une facture partiellement réglée avec le reste à payer', () => {
    const texts = renderInvoice({
      payments: [
        { amount: 4000, paymentDate: new Date('2026-08-05'), paymentMethod: 'Chèque' },
      ],
      paidAmount: 4000,
    });

    expect(texts.some((t) => t.startsWith('Partiellement réglée'))).toBe(true);
    expect(texts).not.toContain('Non réglée');
  });

  it('ne signale aucun reste à payer sur une facture soldée', () => {
    const texts = renderInvoice({
      payments: [
        { amount: 10000, paymentDate: new Date('2026-08-05'), paymentMethod: 'Virement' },
      ],
      paidAmount: 10000,
    });

    expect(texts.some((t) => t.startsWith('Partiellement réglée'))).toBe(false);
  });

  it('affiche le numéro de l\'avoir imputé comme mode de règlement (US-FACT-02)', () => {
    const texts = renderInvoice({
      payments: [
        {
          amount: 2000,
          paymentDate: new Date('2026-08-05'),
          paymentMethod: 'Avoir',
          creditNoteNumber: 'AVO-2026-0007',
        },
        { amount: 8000, paymentDate: new Date('2026-08-06'), paymentMethod: 'Virement' },
      ],
      paidAmount: 10000,
    });

    expect(texts).toContain('Avoir (AVO-2026-0007)');
    expect(texts).toContain('Virement');
  });
});
