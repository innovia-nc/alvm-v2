import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

// TD-007 : le PDF d'avoir est câblé — on intercepte le rendu et l'upload pour
// vérifier les données transmises au document sans lancer @react-pdf/renderer.
const generateCreditNotePDF = vi.fn().mockResolvedValue(Buffer.from('%PDF-'));
const uploadToStorage = vi.fn();

vi.mock('@/lib/pdf/credit-note-pdf', () => ({
  generateCreditNotePDF: (...args: unknown[]) => generateCreditNotePDF(...args),
}));

vi.mock('@/lib/storage/blob-storage', () => ({
  uploadToStorage: (...args: unknown[]) => uploadToStorage(...args),
  deleteFromStorage: vi.fn(),
  deleteFromStorageBestEffort: vi.fn().mockResolvedValue(true),
}));

import {
  createTestCaller,
  ADMIN_USER,
  STAFF_USER,
  PARENT_USER,
  type TestCaller,
} from '../helpers/test-caller';

describe('creditNotes router', () => {
  let admin: TestCaller;
  let staff: TestCaller;
  let parent: TestCaller;

  const parentId = 'a0000000-0000-4000-a000-000000000003';
  const invoiceId = 'b0000000-0000-4000-a000-000000000030';
  const creditNoteId = 'b0000000-0000-4000-a000-000000000031';

  const fakeCreditNote = {
    id: creditNoteId,
    invoiceNumber: 'AVO-2025-0001',
    creditedInvoiceId: invoiceId,
    parentId,
    issueDate: new Date('2025-06-01'),
    dueDate: new Date('2025-07-01'),
    subtotalHt: -10000,
    taxRate: 0.11,
    taxAmount: -1100,
    totalAmount: -11100,
    refundMethod: 'FUTURE_CREDIT',
    status: 'DRAFT',
    isFutureCredit: true,
    invoiceType: 'CREDIT_NOTE',
    notes: 'Annulation partielle',
    paidAmount: 0,
    pdfUrl: null,
    accountingExportedAt: null,
    deletedAt: null,
    createdAt: new Date('2025-06-01'),
    updatedAt: new Date('2025-06-01'),
  };

  const fakeCreditNoteWithDetails = {
    ...fakeCreditNote,
    creditedInvoice: {
      invoiceNumber: 'FAC-2025-0001',
      totalAmount: 20000,
      status: 'PAID',
    },
    parent: {
      firstName: 'Jean',
      lastName: 'Dupont',
      email: 'jean@test.com',
    },
    lines: [
      {
        id: 'b0000000-0000-4000-a000-000000000040',
        invoiceId: creditNoteId,
        registrationId: null,
        description: 'Remboursement partiel',
        quantity: 1,
        unitPrice: 10000,
        totalHt: -10000,
      },
    ],
    parentCredits: [{ amountRemaining: 11100 }],
  };

  beforeEach(() => {
    admin = createTestCaller(ADMIN_USER);
    staff = createTestCaller(STAFF_USER);
    parent = createTestCaller(PARENT_USER);
    generateCreditNotePDF.mockClear();
    generateCreditNotePDF.mockResolvedValue(Buffer.from('%PDF-'));
    uploadToStorage.mockClear();
    uploadToStorage.mockResolvedValue({
      pathname: 'credit-notes/AVO-2025-0001.pdf',
      url: 'https://store.blob.vercel-storage.com/credit-notes/AVO-2025-0001.pdf',
    });
  });

  // --- Access control ---

  it('should deny unauthenticated access to list', async () => {
    const { caller } = createTestCaller(null);
    await expect(caller.creditNotes.list({})).rejects.toThrow(TRPCError);
  });

  // --- list ---

  it('should list credit notes for admin', async () => {
    admin.mockPrisma.invoice.findMany.mockResolvedValue([fakeCreditNoteWithDetails]);
    admin.mockPrisma.invoice.count.mockResolvedValue(1);

    const result = await admin.caller.creditNotes.list({});
    expect(result.creditNotes).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.creditNotes[0].creditNoteNumber).toBe('AVO-2025-0001');
  });

  it('should filter by parentId for PARENT users', async () => {
    parent.mockPrisma.invoice.findMany.mockResolvedValue([fakeCreditNoteWithDetails]);
    parent.mockPrisma.invoice.count.mockResolvedValue(1);

    await parent.caller.creditNotes.list({});

    expect(parent.mockPrisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          parentId: PARENT_USER.id,
          invoiceType: 'CREDIT_NOTE',
        }),
      }),
    );
  });

  // --- getById ---

  it('should return a credit note by id', async () => {
    admin.mockPrisma.invoice.findFirst.mockResolvedValue(fakeCreditNoteWithDetails);
    const result = await admin.caller.creditNotes.getById({ id: creditNoteId });
    expect(result).not.toBeNull();
    expect(result!.creditNoteNumber).toBe('AVO-2025-0001');
    expect(result!.availableCredit).toBe(11100);
  });

  it('should return null for non-existent credit note', async () => {
    admin.mockPrisma.invoice.findFirst.mockResolvedValue(null);
    const result = await admin.caller.creditNotes.getById({ id: creditNoteId });
    expect(result).toBeNull();
  });

  // --- create ---

  it('should deny PARENT from creating credit notes', async () => {
    await expect(
      parent.caller.creditNotes.create({
        parentId,
        refundMethod: 'FUTURE_CREDIT',
        reason: 'Test annulation partielle',
        lines: [{ registrationId: null, description: 'Test line', quantity: 1, unitPrice: 5000 }],
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('should create a credit note', async () => {
    staff.mockPrisma.invoice.findFirst.mockResolvedValue({
      id: invoiceId,
      parentId,
      invoiceType: 'INVOICE',
      deletedAt: null,
    });
    staff.mockPrisma.invoice.create.mockResolvedValue(fakeCreditNote);
    staff.mockPrisma.invoiceLine.create.mockResolvedValue({});

    const result = await staff.caller.creditNotes.create({
      creditedInvoiceId: invoiceId,
      parentId,
      refundMethod: 'FUTURE_CREDIT',
      reason: 'Test annulation partielle',
      lines: [
        { registrationId: null, description: 'Remboursement', quantity: 1, unitPrice: 10000 },
      ],
    });

    expect(result.creditNoteNumber).toBe('AVO-2025-0001');
    expect(staff.mockPrisma.invoice.create).toHaveBeenCalledOnce();
  });

  it('should reject if original invoice not found', async () => {
    staff.mockPrisma.invoice.findFirst.mockResolvedValue(null);

    await expect(
      staff.caller.creditNotes.create({
        creditedInvoiceId: invoiceId,
        parentId,
        refundMethod: 'IMMEDIATE_REFUND',
        reason: 'Test refund reason here',
        lines: [{ registrationId: null, description: 'Test', quantity: 1, unitPrice: 5000 }],
      }),
    ).rejects.toThrow('Facture originale non trouvée');
  });

  it('should reject if parent mismatch with original invoice', async () => {
    staff.mockPrisma.invoice.findFirst.mockResolvedValue({
      id: invoiceId,
      parentId: 'c0000000-0000-4000-a000-000000000099', // different parent
      invoiceType: 'INVOICE',
      deletedAt: null,
    });

    await expect(
      staff.caller.creditNotes.create({
        creditedInvoiceId: invoiceId,
        parentId,
        refundMethod: 'IMMEDIATE_REFUND',
        reason: 'Test refund reason here',
        lines: [{ registrationId: null, description: 'Test', quantity: 1, unitPrice: 5000 }],
      }),
    ).rejects.toThrow("Le parent de l'avoir doit correspondre");
  });

  // --- updateStatus ---

  it('should transition DRAFT → SENT', async () => {
    staff.mockPrisma.invoice.findFirst.mockResolvedValue({
      ...fakeCreditNote,
      status: 'DRAFT',
    });
    staff.mockPrisma.invoice.update.mockResolvedValue({});
    staff.mockPrisma.parentCredit.findFirst.mockResolvedValue(null);
    staff.mockPrisma.parentCredit.create.mockResolvedValue({});

    const result = await staff.caller.creditNotes.updateStatus({
      id: creditNoteId,
      status: 'SENT',
    });
    expect(result.success).toBe(true);
  });

  it('should create parentCredit when transitioning to SENT with isFutureCredit', async () => {
    staff.mockPrisma.invoice.findFirst.mockResolvedValue({
      ...fakeCreditNote,
      status: 'DRAFT',
      isFutureCredit: true,
      totalAmount: -11100,
    });
    staff.mockPrisma.invoice.update.mockResolvedValue({});
    staff.mockPrisma.parentCredit.findFirst.mockResolvedValue(null);
    staff.mockPrisma.parentCredit.create.mockResolvedValue({});

    await staff.caller.creditNotes.updateStatus({ id: creditNoteId, status: 'SENT' });

    expect(staff.mockPrisma.parentCredit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentId,
          creditNoteId,
          amountOriginal: 11100,
          amountRemaining: 11100,
        }),
      }),
    );
  });

  it('should reject invalid transition CANCELLED → SENT', async () => {
    staff.mockPrisma.invoice.findFirst.mockResolvedValue({
      ...fakeCreditNote,
      status: 'CANCELLED',
    });

    await expect(
      staff.caller.creditNotes.updateStatus({ id: creditNoteId, status: 'SENT' }),
    ).rejects.toThrow('Transition de CANCELLED vers SENT non autorisée');
  });

  // --- delete ---

  it('should delete a DRAFT credit note', async () => {
    admin.mockPrisma.invoice.findFirst.mockResolvedValue({
      ...fakeCreditNote,
      status: 'DRAFT',
    });
    admin.mockPrisma.invoice.update.mockResolvedValue({});

    const result = await admin.caller.creditNotes.delete({ id: creditNoteId });
    expect(result.success).toBe(true);
  });

  it('should reject deletion of non-DRAFT credit note', async () => {
    admin.mockPrisma.invoice.findFirst.mockResolvedValue({
      ...fakeCreditNote,
      status: 'SENT',
    });

    await expect(
      admin.caller.creditNotes.delete({ id: creditNoteId }),
    ).rejects.toThrow('Seuls les avoirs en brouillon peuvent être supprimés');
  });

  it('should allow STAFF to delete credit notes', async () => {
    staff.mockPrisma.invoice.findFirst.mockResolvedValue({
      ...fakeCreditNote,
      status: 'DRAFT',
    });
    staff.mockPrisma.invoice.update.mockResolvedValue({});

    const result = await staff.caller.creditNotes.delete({ id: creditNoteId });
    expect(result.success).toBe(true);
  });
  // =========================================================================
  // generatePDF (TD-007)
  // =========================================================================

  describe('generatePDF', () => {
    const pdfCreditNote = {
      ...fakeCreditNote,
      creditedInvoice: { invoiceNumber: 'FAC-2025-0001' },
      parent: {
        firstName: 'Jean',
        lastName: 'Dupont',
        email: 'jean@test.com',
        address: '15 Rue de la Baie',
        city: 'Noumea',
        postalCode: '98800',
      },
      lines: [
        {
          description: 'Remboursement partiel',
          quantity: 1,
          unitPrice: 10000,
          totalPrice: 10000,
          totalHt: -10000,
        },
      ],
    };

    it('should deny PARENT access', async () => {
      await expect(
        parent.caller.creditNotes.generatePDF({ id: creditNoteId }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('should throw NOT_FOUND when the credit note does not exist', async () => {
      admin.mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        admin.caller.creditNotes.generatePDF({ id: creditNoteId }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      expect(uploadToStorage).not.toHaveBeenCalled();
    });

    it('should only look for credit notes (not invoices)', async () => {
      admin.mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        admin.caller.creditNotes.generatePDF({ id: creditNoteId }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      expect(admin.mockPrisma.invoice.findFirst.mock.calls[0]![0].where).toMatchObject({
        id: creditNoteId,
        invoiceType: 'CREDIT_NOTE',
        deletedAt: null,
      });
    });

    it('should generate, upload and persist the PDF URL', async () => {
      admin.mockPrisma.invoice.findFirst.mockResolvedValue(pdfCreditNote);
      admin.mockPrisma.invoice.update.mockResolvedValue({});

      const result = await admin.caller.creditNotes.generatePDF({ id: creditNoteId });

      expect(result).toEqual({
        success: true,
        pdfUrl: 'https://store.blob.vercel-storage.com/credit-notes/AVO-2025-0001.pdf',
      });
      expect(uploadToStorage).toHaveBeenCalledWith(expect.anything(), {
        pathname: `credit-notes/AVO-2025-0001-${creditNoteId}.pdf`,
        contentType: 'application/pdf',
      });
      expect(admin.mockPrisma.invoice.update).toHaveBeenCalledWith({
        where: { id: creditNoteId },
        data: {
          pdfUrl: 'https://store.blob.vercel-storage.com/credit-notes/AVO-2025-0001.pdf',
        },
      });
    });

    it('should pass absolute amounts to the document (it prints the minus sign itself)', async () => {
      admin.mockPrisma.invoice.findFirst.mockResolvedValue(pdfCreditNote);
      admin.mockPrisma.invoice.update.mockResolvedValue({});

      await admin.caller.creditNotes.generatePDF({ id: creditNoteId });

      const data = generateCreditNotePDF.mock.calls[0]![0];
      expect(data.totalAmount).toBe(11100);
      expect(data.lines).toEqual([
        {
          description: 'Remboursement partiel',
          quantity: 1,
          unitPrice: 10000,
          totalPrice: 10000,
        },
      ]);
    });

    it('should carry the credit note metadata (number, credited invoice, reason)', async () => {
      admin.mockPrisma.invoice.findFirst.mockResolvedValue(pdfCreditNote);
      admin.mockPrisma.invoice.update.mockResolvedValue({});

      await admin.caller.creditNotes.generatePDF({ id: creditNoteId });

      const data = generateCreditNotePDF.mock.calls[0]![0];
      expect(data.creditNoteNumber).toBe('AVO-2025-0001');
      expect(data.invoiceNumber).toBe('FAC-2025-0001');
      expect(data.reason).toBe('Annulation partielle');
      expect(data.parent.postalCode).toBe('98800');
      expect(data.org.name).toBe('ALVM');
    });

    it('should label a standalone credit note as having no original invoice', async () => {
      admin.mockPrisma.invoice.findFirst.mockResolvedValue({
        ...pdfCreditNote,
        creditedInvoiceId: null,
        creditedInvoice: null,
      });
      admin.mockPrisma.invoice.update.mockResolvedValue({});

      await admin.caller.creditNotes.generatePDF({ id: creditNoteId });

      expect(generateCreditNotePDF.mock.calls[0]![0].invoiceNumber).toBe('Aucune');
    });

    it('should use the credit note footer mention from settings', async () => {
      admin.mockPrisma.invoice.findFirst.mockResolvedValue(pdfCreditNote);
      admin.mockPrisma.invoice.update.mockResolvedValue({});
      admin.mockPrisma.appSetting.findMany.mockResolvedValue([
        { category: 'documents', key: 'credit_note_footer', value: '"Avoir sans TGC"' },
        { category: 'documents', key: 'invoice_footer', value: '"Mention facture"' },
      ]);

      await admin.caller.creditNotes.generatePDF({ id: creditNoteId });

      expect(generateCreditNotePDF.mock.calls[0]![0].footerMention).toBe('Avoir sans TGC');
    });

    it('should allow STAFF to generate the PDF', async () => {
      staff.mockPrisma.invoice.findFirst.mockResolvedValue(pdfCreditNote);
      staff.mockPrisma.invoice.update.mockResolvedValue({});

      const result = await staff.caller.creditNotes.generatePDF({ id: creditNoteId });

      expect(result.success).toBe(true);
    });
  });
});
