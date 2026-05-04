import { describe, it, expect, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
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
});
