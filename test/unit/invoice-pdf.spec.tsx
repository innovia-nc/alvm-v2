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
import { PDF_FOOTER_RESERVED_SPACE } from '@/lib/pdf/shared/pdf-footer';
import { flattenTree, elementText } from '@/test/helpers/react-tree';

type Payment = {
  amount: number;
  paymentDate: Date;
  paymentMethod: string;
  creditNoteNumber?: string | null;
};

function buildInvoice(overrides: {
  payments?: Payment[];
  paidAmount?: number;
  totalAmount?: number;
}) {
  const totalAmount = overrides.totalAmount ?? 10000;

  return InvoicePDF({
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
}

function renderInvoice(overrides: Parameters<typeof buildInvoice>[0]) {
  return flattenTree(buildInvoice(overrides) as React.ReactNode).map(elementText);
}

function treeOf(overrides: Parameters<typeof buildInvoice>[0]) {
  return flattenTree(buildInvoice(overrides) as React.ReactNode);
}

/** Aplatit un `style` react-pdf (objet ou tableau d'objets) en un seul objet. */
function flatStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatStyle));
  return (style ?? {}) as Record<string, unknown>;
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

describe('InvoicePDF — mise en page des règlements (US-FACT-01-bis)', () => {
  const sixPayments: Payment[] = Array.from({ length: 6 }, (_, i) => ({
    amount: 1000,
    paymentDate: new Date('2026-08-05'),
    paymentMethod: `Règlement ${i + 1}`,
  }));

  it('rend intégralement les règlements au-delà de 4', () => {
    const texts = renderInvoice({ payments: sixPayments, paidAmount: 6000 });

    for (let i = 1; i <= 6; i++) {
      expect(texts).toContain(`Règlement ${i}`);
    }
  });

  it('réserve en bas de page la place occupée par le pied de page', () => {
    // Le PDFFooter est en position absolue : sans cette réserve, le tableau des
    // règlements coulait DESSOUS le pied de page. Le contrôle sur le PDF
    // réellement rendu est dans `pdf-footer-overlap.spec.tsx` (TD-004) ; ici on
    // verrouille simplement que la facture déclare bien la réserve partagée.
    const page = treeOf({ payments: sixPayments, paidAmount: 6000 }).find(
      (el) => (el.props as { size?: string }).size === 'A4',
    );

    expect(page).toBeDefined();
    const style = flatStyle((page!.props as { style?: unknown }).style);
    expect(style.paddingBottom).toBe(PDF_FOOTER_RESERVED_SPACE);
  });

  it('interdit la coupure d\'une ligne de règlement par un saut de page', () => {
    const rows = treeOf({ payments: sixPayments, paidAmount: 6000 }).filter((el) => {
      const style = flatStyle((el.props as { style?: unknown }).style);
      return style.padding === 6 && style.flexDirection === 'row';
    });

    // 1 en-tête + 6 lignes de règlement
    expect(rows).toHaveLength(7);
    for (const row of rows) {
      expect((row.props as { wrap?: boolean }).wrap).toBe(false);
    }
  });

  it('garde le bloc des totaux insécable', () => {
    const totals = treeOf({ payments: sixPayments, paidAmount: 6000 }).find((el) => {
      const style = flatStyle((el.props as { style?: unknown }).style);
      return style.alignItems === 'flex-end' && style.marginTop === 20;
    });

    expect(totals).toBeDefined();
    expect((totals!.props as { wrap?: boolean }).wrap).toBe(false);
  });
});
