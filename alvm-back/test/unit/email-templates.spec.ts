/**
 * Contenu des emails de la file `alvm-email` : libellés facture/devis et
 * échappement des données saisies (CLAUDE.md InnovIA §5.13).
 */
import { describe, it, expect } from 'vitest';
import {
  buildInvoiceEmail,
  buildPasswordResetEmail,
  passwordResetSubject,
} from '@back/services/email-templates';

const invoice = {
  invoiceNumber: 'FAC-2026-0001',
  status: 'SENT',
  totalAmount: 12000,
  dueDate: new Date('2026-10-27T00:00:00.000Z'),
  parent: { firstName: 'Jean <b>', lastName: 'Dupont & fils' },
};

describe('email-templates', () => {
  it('compose une facture avec sa pièce jointe nommée', () => {
    const email = buildInvoiceEmail(invoice, 'ALVM');
    expect(email.subject).toBe('Votre facture FAC-2026-0001 — ALVM');
    expect(email.attachmentName).toBe('facture-FAC-2026-0001.pdf');
    expect(email.text).toContain('à régler avant le');
  });

  it('annonce un devis tant que la facture est en brouillon', () => {
    const email = buildInvoiceEmail({ ...invoice, status: 'DRAFT' }, 'ALVM');
    expect(email.subject).toBe('Votre devis FAC-2026-0001 — ALVM');
    expect(email.attachmentName).toBe('devis-FAC-2026-0001.pdf');
  });

  it('échappe les données saisies dans le HTML', () => {
    const email = buildInvoiceEmail(invoice, 'Asso <script>');
    expect(email.html).toContain('Jean &lt;b&gt; Dupont &amp; fils');
    expect(email.html).toContain('Asso &lt;script&gt;');
    expect(email.html).not.toContain('<script>');
  });

  it('compose la réinitialisation avec un lien échappé', () => {
    const subject = passwordResetSubject('Plateforme');
    const email = buildPasswordResetEmail(subject, 'https://app.example.nc/r?token=a"b');
    expect(email.subject).toBe('Réinitialiser votre mot de passe Plateforme');
    expect(email.html).toContain('href="https://app.example.nc/r?token=a&quot;b"');
  });
});
