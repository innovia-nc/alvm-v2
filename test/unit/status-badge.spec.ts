/**
 * Tests for the <StatusBadge /> pure mapping helper.
 *
 * The component itself relies on React + Lucide icons; here we cover the
 * mapping table (`getStatusInfo`) which is the load-bearing logic. Pure
 * Node-friendly — no jsdom needed.
 */
import { describe, it, expect } from 'vitest';
import { getStatusInfo } from '@/components/shared/status-badge';

describe('StatusBadge / getStatusInfo', () => {
  describe('invoice', () => {
    it('maps DRAFT to "Devis" with the draft utility', () => {
      const info = getStatusInfo('invoice', 'DRAFT');
      expect(info.label).toBe('Devis');
      expect(info.className).toBe('status-badge-draft');
      expect(info.icon).toBeDefined();
    });

    it('maps SENT to "Emise" with the sent utility', () => {
      const info = getStatusInfo('invoice', 'SENT');
      expect(info.label).toBe('Emise');
      expect(info.className).toBe('status-badge-sent');
    });

    it('maps PAID to "Payee" with the paid utility', () => {
      const info = getStatusInfo('invoice', 'PAID');
      expect(info.label).toBe('Payee');
      expect(info.className).toBe('status-badge-paid');
    });

    it('maps OVERDUE to "En retard" with the overdue utility', () => {
      const info = getStatusInfo('invoice', 'OVERDUE');
      expect(info.label).toBe('En retard');
      expect(info.className).toBe('status-badge-overdue');
    });

    it('maps CANCELLED and CREDITED to their dedicated utilities', () => {
      expect(getStatusInfo('invoice', 'CANCELLED').className).toBe('status-badge-cancelled');
      expect(getStatusInfo('invoice', 'CREDITED').className).toBe('status-badge-credited');
    });
  });

  describe('registration', () => {
    it('maps PENDING to "En attente"', () => {
      const info = getStatusInfo('registration', 'PENDING');
      expect(info.label).toBe('En attente');
      expect(info.className).toBe('status-badge-pending');
    });

    it('maps CONFIRMED to "Confirmee"', () => {
      const info = getStatusInfo('registration', 'CONFIRMED');
      expect(info.label).toBe('Confirmee');
      expect(info.className).toBe('status-badge-confirmed');
    });

    it('maps WAITLIST to "Liste d\'attente"', () => {
      const info = getStatusInfo('registration', 'WAITLIST');
      expect(info.label).toBe("Liste d'attente");
      expect(info.className).toBe('status-badge-waitlist');
    });

    it('maps CANCELLED to "Annulee"', () => {
      const info = getStatusInfo('registration', 'CANCELLED');
      expect(info.label).toBe('Annulee');
      expect(info.className).toBe('status-badge-cancelled');
    });
  });

  describe('attendance', () => {
    it('covers the four attendance statuses', () => {
      expect(getStatusInfo('attendance', 'PRESENT').label).toBe('Present');
      expect(getStatusInfo('attendance', 'ABSENT').label).toBe('Absent');
      expect(getStatusInfo('attendance', 'LATE').label).toBe('En retard');
      expect(getStatusInfo('attendance', 'EXCUSED').label).toBe('Excuse');
    });

    it('uses dedicated utilities for each attendance status', () => {
      expect(getStatusInfo('attendance', 'PRESENT').className).toBe('status-badge-present');
      expect(getStatusInfo('attendance', 'ABSENT').className).toBe('status-badge-absent');
      expect(getStatusInfo('attendance', 'LATE').className).toBe('status-badge-late');
      expect(getStatusInfo('attendance', 'EXCUSED').className).toBe('status-badge-excused');
    });
  });

  describe('creditNote', () => {
    it('handles DRAFT / SENT / CANCELLED used in the current schema', () => {
      expect(getStatusInfo('creditNote', 'DRAFT').label).toBe('Brouillon');
      expect(getStatusInfo('creditNote', 'SENT').label).toBe('Emis');
      expect(getStatusInfo('creditNote', 'CANCELLED').label).toBe('Annule');
    });

    it('supports forward-compat ISSUED and APPLIED statuses', () => {
      expect(getStatusInfo('creditNote', 'ISSUED').className).toBe('status-badge-issued');
      expect(getStatusInfo('creditNote', 'APPLIED').className).toBe('status-badge-applied');
    });
  });

  describe('camp', () => {
    it('covers the four camp statuses', () => {
      expect(getStatusInfo('camp', 'DRAFT').label).toBe('Brouillon');
      expect(getStatusInfo('camp', 'PUBLISHED').label).toBe('Publie');
      expect(getStatusInfo('camp', 'CLOSED').label).toBe('Ferme');
      expect(getStatusInfo('camp', 'CANCELLED').label).toBe('Annule');
    });
  });

  describe('payment', () => {
    it('covers the four payment statuses', () => {
      expect(getStatusInfo('payment', 'UNPAID').className).toBe('status-badge-unpaid');
      expect(getStatusInfo('payment', 'PARTIAL').className).toBe('status-badge-partial');
      expect(getStatusInfo('payment', 'PAID').className).toBe('status-badge-paid');
      expect(getStatusInfo('payment', 'REFUNDED').className).toBe('status-badge-refunded');
    });
  });

  describe('refund', () => {
    it('handles IMMEDIATE_REFUND and FUTURE_CREDIT', () => {
      expect(getStatusInfo('refund', 'IMMEDIATE_REFUND').label).toBe('Remboursement immediat');
      expect(getStatusInfo('refund', 'FUTURE_CREDIT').label).toBe('Avoir futur');
    });
  });

  describe('fallback', () => {
    it('returns the raw status as label when unknown', () => {
      const info = getStatusInfo('invoice', 'NEW_STATUS_XYZ');
      expect(info.label).toBe('NEW_STATUS_XYZ');
      expect(info.className).toBe('status-badge-draft');
    });
  });
});
