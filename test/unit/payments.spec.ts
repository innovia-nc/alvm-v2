import { describe, it, expect, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  createTestCaller,
  ADMIN_USER,
  STAFF_USER,
  PARENT_USER,
  type TestCaller,
} from '../helpers/test-caller';

describe('payments router', () => {
  let admin: TestCaller;
  let staff: TestCaller;
  let parent: TestCaller;

  // --- Shared IDs (valid v4 UUIDs) ---

  const INVOICE_ID = 'a0000000-0000-4000-a000-000000000001';
  const PAYMENT_ID = 'a0000000-0000-4000-a000-000000000010';
  const PAYMENT_METHOD_ID = 'a0000000-0000-4000-a000-000000000020';
  const CREDIT_NOTE_ID = 'a0000000-0000-4000-a000-000000000030';
  const CREDIT_NOTE_METHOD_ID = 'a0000000-0000-4000-a000-000000000021';

  // --- Fake data ---

  const fakePaymentMethod = {
    name: 'Especes',
    code: 'CASH',
    accountingCode: '530000',
  };

  const fakeInvoice = {
    id: INVOICE_ID,
    invoiceNumber: 'FAC-2025-0001',
    totalAmount: 50000,
    paidAmount: 10000,
    status: 'SENT' as const,
    invoiceType: 'INVOICE' as const,
    deletedAt: null,
    parentId: PARENT_USER.id,
    isFutureCredit: false,
  };

  const fakeParent = {
    firstName: 'Test',
    lastName: 'Parent',
    email: 'parent@test.com',
  };

  const fakePaymentRow = {
    id: PAYMENT_ID,
    invoiceId: INVOICE_ID,
    amount: 10000,
    paymentDate: new Date('2025-06-15'),
    paymentMethodId: PAYMENT_METHOD_ID,
    creditNoteId: null,
    reference: 'REF-001',
    notes: null,
    createdAt: new Date('2025-06-15'),
    updatedAt: new Date('2025-06-15'),
    paymentMethod: fakePaymentMethod,
    invoice: {
      id: INVOICE_ID,
      invoiceNumber: 'FAC-2025-0001',
      totalAmount: 50000,
      paidAmount: 10000,
      status: 'SENT',
      parentId: PARENT_USER.id,
      parent: fakeParent,
    },
  };

  const fakeCreatedPayment = {
    id: PAYMENT_ID,
    invoiceId: INVOICE_ID,
    amount: 15000,
    paymentDate: new Date('2025-06-15'),
    paymentMethodId: PAYMENT_METHOD_ID,
    creditNoteId: null,
    reference: null,
    notes: null,
    createdAt: new Date('2025-06-15'),
    updatedAt: new Date('2025-06-15'),
    paymentMethod: fakePaymentMethod,
  };

  beforeEach(() => {
    admin = createTestCaller(ADMIN_USER);
    staff = createTestCaller(STAFF_USER);
    parent = createTestCaller(PARENT_USER);
  });

  // ==========================================================================
  // ACCESS CONTROL
  // ==========================================================================

  describe('access control', () => {
    it('should deny unauthenticated access to list', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.payments.list({})).rejects.toThrow(TRPCError);
    });

    it('should deny unauthenticated access to getById', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.payments.getById({ id: PAYMENT_ID })).rejects.toThrow(TRPCError);
    });

    it('should deny unauthenticated access to create', async () => {
      const { caller } = createTestCaller(null);
      await expect(
        caller.payments.create({
          invoiceId: INVOICE_ID,
          amount: 1000,
          paymentDate: '2025-06-15',
          paymentMethodId: PAYMENT_METHOD_ID,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it('should deny PARENT access to create', async () => {
      await expect(
        parent.caller.payments.create({
          invoiceId: INVOICE_ID,
          amount: 1000,
          paymentDate: '2025-06-15',
          paymentMethodId: PAYMENT_METHOD_ID,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it('should deny unauthenticated access to delete', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.payments.delete({ id: PAYMENT_ID })).rejects.toThrow(TRPCError);
    });

    it('should deny PARENT access to delete', async () => {
      await expect(parent.caller.payments.delete({ id: PAYMENT_ID })).rejects.toThrow(TRPCError);
    });

    it('should deny STAFF access to delete', async () => {
      await expect(staff.caller.payments.delete({ id: PAYMENT_ID })).rejects.toThrow(TRPCError);
    });

    it('should deny unauthenticated access to statistics', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.payments.statistics({})).rejects.toThrow(TRPCError);
    });

    it('should deny PARENT access to statistics', async () => {
      await expect(parent.caller.payments.statistics({})).rejects.toThrow(TRPCError);
    });

    it('should deny STAFF access to statistics', async () => {
      await expect(staff.caller.payments.statistics({})).rejects.toThrow(TRPCError);
    });
  });

  // ==========================================================================
  // LIST
  // ==========================================================================

  describe('list', () => {
    it('should return payments with total count', async () => {
      admin.mockPrisma.payment.findMany.mockResolvedValue([fakePaymentRow]);
      admin.mockPrisma.payment.count.mockResolvedValue(1);

      const result = await admin.caller.payments.list({});
      expect(result.payments).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.payments[0].id).toBe(PAYMENT_ID);
      expect(result.payments[0].amount).toBe(10000);
      expect(result.payments[0].paymentMethodName).toBe('Especes');
      expect(result.payments[0].invoice.invoiceNumber).toBe('FAC-2025-0001');
      expect(result.payments[0].invoice.remainingAmount).toBe(40000);
    });

    it('should scope to parent when caller is PARENT', async () => {
      parent.mockPrisma.payment.findMany.mockResolvedValue([fakePaymentRow]);
      parent.mockPrisma.payment.count.mockResolvedValue(1);

      await parent.caller.payments.list({});

      expect(parent.mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            invoice: { parentId: PARENT_USER.id },
          }),
        }),
      );
    });

    it('should filter by invoiceId', async () => {
      admin.mockPrisma.payment.findMany.mockResolvedValue([]);
      admin.mockPrisma.payment.count.mockResolvedValue(0);

      await admin.caller.payments.list({ invoiceId: INVOICE_ID });

      expect(admin.mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            invoiceId: INVOICE_ID,
          }),
        }),
      );
    });

    it('should filter by parentId for non-parent callers', async () => {
      admin.mockPrisma.payment.findMany.mockResolvedValue([]);
      admin.mockPrisma.payment.count.mockResolvedValue(0);

      await admin.caller.payments.list({ parentId: PARENT_USER.id });

      expect(admin.mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            invoice: { parentId: PARENT_USER.id },
          }),
        }),
      );
    });

    it('should filter by paymentMethodId', async () => {
      admin.mockPrisma.payment.findMany.mockResolvedValue([]);
      admin.mockPrisma.payment.count.mockResolvedValue(0);

      await admin.caller.payments.list({ paymentMethodId: PAYMENT_METHOD_ID });

      expect(admin.mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paymentMethodId: PAYMENT_METHOD_ID,
          }),
        }),
      );
    });

    it('should respect pagination (limit/offset)', async () => {
      admin.mockPrisma.payment.findMany.mockResolvedValue([]);
      admin.mockPrisma.payment.count.mockResolvedValue(50);

      await admin.caller.payments.list({ limit: 10, offset: 20 });

      expect(admin.mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        }),
      );
    });

    it('should sort by amount ascending', async () => {
      admin.mockPrisma.payment.findMany.mockResolvedValue([]);
      admin.mockPrisma.payment.count.mockResolvedValue(0);

      await admin.caller.payments.list({ sortBy: 'amount', sortOrder: 'asc' });

      expect(admin.mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { amount: 'asc' },
        }),
      );
    });

    it('should return empty list when no payments', async () => {
      admin.mockPrisma.payment.findMany.mockResolvedValue([]);
      admin.mockPrisma.payment.count.mockResolvedValue(0);

      const result = await admin.caller.payments.list({});
      expect(result.payments).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ==========================================================================
  // GET BY ID
  // ==========================================================================

  describe('getById', () => {
    it('should return payment with details', async () => {
      admin.mockPrisma.payment.findFirst.mockResolvedValue(fakePaymentRow);

      const result = await admin.caller.payments.getById({ id: PAYMENT_ID });
      expect(result).not.toBeNull();
      expect(result!.id).toBe(PAYMENT_ID);
      expect(result!.invoice.invoiceNumber).toBe('FAC-2025-0001');
      expect(result!.parent.firstName).toBe('Test');
    });

    it('should return null for non-existent payment', async () => {
      admin.mockPrisma.payment.findFirst.mockResolvedValue(null);

      const result = await admin.caller.payments.getById({ id: PAYMENT_ID });
      expect(result).toBeNull();
    });

    it('should scope to parent when caller is PARENT', async () => {
      parent.mockPrisma.payment.findFirst.mockResolvedValue(fakePaymentRow);

      await parent.caller.payments.getById({ id: PAYMENT_ID });

      expect(parent.mockPrisma.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: PAYMENT_ID,
            invoice: { parentId: PARENT_USER.id },
          }),
        }),
      );
    });

    it('should not scope by parent when caller is ADMIN', async () => {
      admin.mockPrisma.payment.findFirst.mockResolvedValue(fakePaymentRow);

      await admin.caller.payments.getById({ id: PAYMENT_ID });

      expect(admin.mockPrisma.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PAYMENT_ID },
        }),
      );
    });
  });

  // ==========================================================================
  // CREATE
  // ==========================================================================

  describe('create', () => {
    const validInput = {
      invoiceId: INVOICE_ID,
      amount: 15000,
      paymentDate: '2025-06-15',
      paymentMethodId: PAYMENT_METHOD_ID,
    };

    function setupCreateMocks(mockPrisma: TestCaller['mockPrisma']) {
      mockPrisma.invoice.findFirst.mockResolvedValue(fakeInvoice);
      mockPrisma.paymentMethod.findUnique.mockResolvedValue(fakePaymentMethod);
      mockPrisma.payment.create.mockResolvedValue(fakeCreatedPayment);
      mockPrisma.invoice.update.mockResolvedValue({});
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ entry_num: 'BQ202506150001' }]);
      mockPrisma.accountingEntry.create.mockResolvedValue({});
    }

    it('should create a payment successfully', async () => {
      setupCreateMocks(staff.mockPrisma);

      const result = await staff.caller.payments.create(validInput);

      expect(result.id).toBe(PAYMENT_ID);
      expect(result.amount).toBe(15000);
      expect(result.paymentMethodName).toBe('Especes');
      expect(result.paymentMethodCode).toBe('CASH');
    });

    it('should update invoice paidAmount and keep SENT status for partial payment', async () => {
      setupCreateMocks(staff.mockPrisma);

      await staff.caller.payments.create(validInput);

      // paidAmount was 10000, adding 15000 = 25000, totalAmount = 50000 => still SENT
      expect(staff.mockPrisma.invoice.update).toHaveBeenCalledWith({
        where: { id: INVOICE_ID },
        data: { paidAmount: 25000, status: 'SENT' },
      });
    });

    it('should set status to PAID when full amount is reached', async () => {
      const fullPaymentInvoice = { ...fakeInvoice, paidAmount: 10000, totalAmount: 50000 };
      staff.mockPrisma.invoice.findFirst.mockResolvedValue(fullPaymentInvoice);
      staff.mockPrisma.paymentMethod.findUnique.mockResolvedValue(fakePaymentMethod);
      staff.mockPrisma.payment.create.mockResolvedValue({
        ...fakeCreatedPayment,
        amount: 40000,
      });
      staff.mockPrisma.invoice.update.mockResolvedValue({});
      staff.mockPrisma.$queryRawUnsafe.mockResolvedValue([{ entry_num: 'BQ202506150001' }]);
      staff.mockPrisma.accountingEntry.create.mockResolvedValue({});

      await staff.caller.payments.create({ ...validInput, amount: 40000 });

      // paidAmount was 10000, adding 40000 = 50000 = totalAmount => PAID
      expect(staff.mockPrisma.invoice.update).toHaveBeenCalledWith({
        where: { id: INVOICE_ID },
        data: { paidAmount: 50000, status: 'PAID' },
      });
    });

    it('should throw NOT_FOUND when invoice does not exist', async () => {
      staff.mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(staff.caller.payments.create(validInput)).rejects.toThrow(
        'Facture non trouvée',
      );
    });

    it('should throw PRECONDITION_FAILED for CANCELLED invoice', async () => {
      staff.mockPrisma.invoice.findFirst.mockResolvedValue({
        ...fakeInvoice,
        status: 'CANCELLED',
      });

      await expect(staff.caller.payments.create(validInput)).rejects.toThrow(
        "Impossible d'ajouter un paiement à une facture annulée",
      );
    });

    it('should throw PRECONDITION_FAILED for DRAFT invoice', async () => {
      staff.mockPrisma.invoice.findFirst.mockResolvedValue({
        ...fakeInvoice,
        status: 'DRAFT',
      });

      await expect(staff.caller.payments.create(validInput)).rejects.toThrow(
        "Impossible d'ajouter un paiement à une facture en brouillon",
      );
    });

    it('should throw BAD_REQUEST when amount exceeds remaining', async () => {
      // totalAmount=50000, paidAmount=10000, remaining=40000
      staff.mockPrisma.invoice.findFirst.mockResolvedValue(fakeInvoice);

      await expect(
        staff.caller.payments.create({ ...validInput, amount: 50000 }),
      ).rejects.toThrow('Le montant dépasse le reste à payer (40000 XPF)');
    });

    it('should throw BAD_REQUEST when amount exactly exceeds remaining by small margin', async () => {
      const almostPaid = { ...fakeInvoice, paidAmount: 49999 };
      staff.mockPrisma.invoice.findFirst.mockResolvedValue(almostPaid);

      await expect(
        staff.caller.payments.create({ ...validInput, amount: 2 }),
      ).rejects.toThrow('Le montant dépasse le reste à payer (1 XPF)');
    });

    it('should allow payment for exact remaining amount', async () => {
      const invoice = { ...fakeInvoice, paidAmount: 10000, totalAmount: 50000 };
      staff.mockPrisma.invoice.findFirst.mockResolvedValue(invoice);
      staff.mockPrisma.paymentMethod.findUnique.mockResolvedValue(fakePaymentMethod);
      staff.mockPrisma.payment.create.mockResolvedValue({
        ...fakeCreatedPayment,
        amount: 40000,
      });
      staff.mockPrisma.invoice.update.mockResolvedValue({});
      staff.mockPrisma.$queryRawUnsafe.mockResolvedValue([{ entry_num: 'BQ202506150001' }]);
      staff.mockPrisma.accountingEntry.create.mockResolvedValue({});

      // remaining = 40000, paying exactly 40000 should not throw
      const result = await staff.caller.payments.create({ ...validInput, amount: 40000 });
      expect(result).toBeDefined();
    });

    it('should allow ADMIN to create payments (admin extends staff)', async () => {
      setupCreateMocks(admin.mockPrisma);

      const result = await admin.caller.payments.create(validInput);
      expect(result.id).toBe(PAYMENT_ID);
    });

    it('should record the caller userId via recordedBy', async () => {
      setupCreateMocks(staff.mockPrisma);

      await staff.caller.payments.create(validInput);

      expect(staff.mockPrisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recordedBy: STAFF_USER.id,
          }),
        }),
      );
    });

    it('should pass optional reference and notes', async () => {
      setupCreateMocks(staff.mockPrisma);

      await staff.caller.payments.create({
        ...validInput,
        reference: 'CHQ-123',
        notes: 'Cheque recu',
      });

      expect(staff.mockPrisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reference: 'CHQ-123',
            notes: 'Cheque recu',
          }),
        }),
      );
    });

    it('should create accounting entries (D bank / C 411000) for normal payment', async () => {
      setupCreateMocks(staff.mockPrisma);

      await staff.caller.payments.create(validInput);

      // Should call $queryRawUnsafe for entry number generation
      expect(staff.mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('nextval'),
        'BQ',
      );

      // Should create 2 accounting entries (debit + credit)
      expect(staff.mockPrisma.accountingEntry.create).toHaveBeenCalledTimes(2);

      // Debit entry: bank account (530000 for CASH)
      expect(staff.mockPrisma.accountingEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            journalCode: 'BQ',
            accountNumber: '530000',
            debit: 15000,
            credit: 0,
          }),
        }),
      );

      // Credit entry: client account (411000)
      expect(staff.mockPrisma.accountingEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            journalCode: 'BQ',
            accountNumber: '411000',
            debit: 0,
            credit: 15000,
          }),
        }),
      );
    });

    it('should create D 4191 / C 411000 entries for future credit payment', async () => {
      // Setup credit note payment with isFutureCredit=true
      staff.mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(fakeInvoice)
        .mockResolvedValueOnce({
          id: CREDIT_NOTE_ID,
          invoiceType: 'CREDIT_NOTE',
          totalAmount: -20000,
          status: 'SENT',
          parentId: PARENT_USER.id,
          deletedAt: null,
          isFutureCredit: true,
        });
      staff.mockPrisma.paymentMethod.findUnique.mockResolvedValue({
        name: 'Avoir',
        code: 'CREDIT_NOTE',
        accountingCode: '411000',
      });
      staff.mockPrisma.creditNoteAllocation.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      staff.mockPrisma.creditNoteAllocation.create.mockResolvedValue({});
      staff.mockPrisma.payment.create.mockResolvedValue({
        ...fakeCreatedPayment,
        paymentMethod: { name: 'Avoir', code: 'CREDIT_NOTE' },
      });
      staff.mockPrisma.invoice.update.mockResolvedValue({});
      staff.mockPrisma.$queryRawUnsafe.mockResolvedValue([{ entry_num: 'BQ202506150001' }]);
      staff.mockPrisma.accountingEntry.create.mockResolvedValue({});

      await staff.caller.payments.create({
        invoiceId: INVOICE_ID,
        amount: 15000,
        paymentDate: '2025-06-15',
        paymentMethodId: CREDIT_NOTE_METHOD_ID,
        creditNoteId: CREDIT_NOTE_ID,
      });

      // Debit entry: future credit account (4191)
      expect(staff.mockPrisma.accountingEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accountNumber: '4191',
            debit: 15000,
            credit: 0,
          }),
        }),
      );
    });

    it('should skip accounting entries for immediate credit note payment', async () => {
      staff.mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(fakeInvoice)
        .mockResolvedValueOnce({
          id: CREDIT_NOTE_ID,
          invoiceType: 'CREDIT_NOTE',
          totalAmount: -20000,
          status: 'SENT',
          parentId: PARENT_USER.id,
          deletedAt: null,
          isFutureCredit: false,
        });
      staff.mockPrisma.paymentMethod.findUnique.mockResolvedValue({
        name: 'Avoir',
        code: 'CREDIT_NOTE',
        accountingCode: '411000',
      });
      staff.mockPrisma.creditNoteAllocation.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      staff.mockPrisma.creditNoteAllocation.create.mockResolvedValue({});
      staff.mockPrisma.payment.create.mockResolvedValue({
        ...fakeCreatedPayment,
        paymentMethod: { name: 'Avoir', code: 'CREDIT_NOTE' },
      });
      staff.mockPrisma.invoice.update.mockResolvedValue({});

      await staff.caller.payments.create({
        invoiceId: INVOICE_ID,
        amount: 15000,
        paymentDate: '2025-06-15',
        paymentMethodId: CREDIT_NOTE_METHOD_ID,
        creditNoteId: CREDIT_NOTE_ID,
      });

      // No accounting entries should be created
      expect(staff.mockPrisma.accountingEntry.create).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // CREATE — CREDIT NOTE PAYMENT
  // ==========================================================================

  describe('create with credit note', () => {
    const creditNotePaymentMethod = { name: 'Avoir', code: 'CREDIT_NOTE', accountingCode: '411000' };

    const fakeCreditNote = {
      id: CREDIT_NOTE_ID,
      invoiceType: 'CREDIT_NOTE',
      totalAmount: -20000,
      status: 'SENT',
      parentId: PARENT_USER.id,
      deletedAt: null,
      isFutureCredit: true,
    };

    const creditNoteInput = {
      invoiceId: INVOICE_ID,
      amount: 15000,
      paymentDate: '2025-06-15',
      paymentMethodId: CREDIT_NOTE_METHOD_ID,
      creditNoteId: CREDIT_NOTE_ID,
    };

    function setupCreditNoteMocks(mockPrisma: TestCaller['mockPrisma']) {
      mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(fakeInvoice)        // invoice lookup
        .mockResolvedValueOnce(fakeCreditNote);     // credit note lookup
      mockPrisma.paymentMethod.findUnique.mockResolvedValue(creditNotePaymentMethod);
      mockPrisma.creditNoteAllocation.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      });
      mockPrisma.creditNoteAllocation.create.mockResolvedValue({});
      mockPrisma.payment.create.mockResolvedValue({
        ...fakeCreatedPayment,
        paymentMethodId: CREDIT_NOTE_METHOD_ID,
        creditNoteId: CREDIT_NOTE_ID,
        paymentMethod: creditNotePaymentMethod,
      });
      mockPrisma.invoice.update.mockResolvedValue({});
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ entry_num: 'BQ202506150001' }]);
      mockPrisma.accountingEntry.create.mockResolvedValue({});
    }

    it('should create a credit note payment and allocate', async () => {
      setupCreditNoteMocks(staff.mockPrisma);

      const result = await staff.caller.payments.create(creditNoteInput);

      expect(result).toBeDefined();
      expect(staff.mockPrisma.creditNoteAllocation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          creditNoteId: CREDIT_NOTE_ID,
          appliedToInvoiceId: INVOICE_ID,
          amount: 15000,
          recordedBy: STAFF_USER.id,
        }),
      });
    });

    it('should throw NOT_FOUND when credit note does not exist', async () => {
      staff.mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(fakeInvoice)
        .mockResolvedValueOnce(null);
      staff.mockPrisma.paymentMethod.findUnique.mockResolvedValue(creditNotePaymentMethod);

      await expect(staff.caller.payments.create(creditNoteInput)).rejects.toThrow(
        'Avoir non trouvé',
      );
    });

    it('should throw PRECONDITION_FAILED when credit note is CANCELLED', async () => {
      staff.mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(fakeInvoice)
        .mockResolvedValueOnce({ ...fakeCreditNote, status: 'CANCELLED' });
      staff.mockPrisma.paymentMethod.findUnique.mockResolvedValue(creditNotePaymentMethod);

      await expect(staff.caller.payments.create(creditNoteInput)).rejects.toThrow(
        "Impossible d'utiliser un avoir annulé",
      );
    });

    it('should throw BAD_REQUEST when credit note belongs to different parent', async () => {
      staff.mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(fakeInvoice)
        .mockResolvedValueOnce({
          ...fakeCreditNote,
          parentId: 'b0000000-0000-4000-a000-999999999999',
        });
      staff.mockPrisma.paymentMethod.findUnique.mockResolvedValue(creditNotePaymentMethod);

      await expect(staff.caller.payments.create(creditNoteInput)).rejects.toThrow(
        "L'avoir et la facture doivent appartenir au même parent",
      );
    });

    it('should throw BAD_REQUEST when amount exceeds credit note available balance', async () => {
      staff.mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(fakeInvoice)
        .mockResolvedValueOnce(fakeCreditNote); // totalAmount = -20000 => abs = 20000
      staff.mockPrisma.paymentMethod.findUnique.mockResolvedValue(creditNotePaymentMethod);
      // Already used 10000 of the credit note
      staff.mockPrisma.creditNoteAllocation.aggregate.mockResolvedValue({
        _sum: { amount: 10000 },
      });

      // available = 20000 - 10000 = 10000, requesting 15000 => exceeds
      await expect(staff.caller.payments.create(creditNoteInput)).rejects.toThrow(
        "Le montant dépasse le solde disponible de l'avoir (10000 XPF)",
      );
    });

    it('should allow credit note payment when amount equals available balance', async () => {
      staff.mockPrisma.invoice.findFirst
        .mockResolvedValueOnce(fakeInvoice)
        .mockResolvedValueOnce(fakeCreditNote); // abs(totalAmount) = 20000
      staff.mockPrisma.paymentMethod.findUnique.mockResolvedValue(creditNotePaymentMethod);
      staff.mockPrisma.creditNoteAllocation.aggregate.mockResolvedValue({
        _sum: { amount: 5000 },
      });
      staff.mockPrisma.creditNoteAllocation.create.mockResolvedValue({});
      staff.mockPrisma.payment.create.mockResolvedValue({
        ...fakeCreatedPayment,
        amount: 15000,
        paymentMethod: creditNotePaymentMethod,
      });
      staff.mockPrisma.invoice.update.mockResolvedValue({});
      staff.mockPrisma.$queryRawUnsafe.mockResolvedValue([{ entry_num: 'BQ202506150001' }]);
      staff.mockPrisma.accountingEntry.create.mockResolvedValue({});

      // available = 20000 - 5000 = 15000, requesting exactly 15000
      const result = await staff.caller.payments.create(creditNoteInput);
      expect(result).toBeDefined();
    });
  });

  // ==========================================================================
  // DELETE
  // ==========================================================================

  describe('delete', () => {
    const fakePaymentForDelete = {
      id: PAYMENT_ID,
      invoiceId: INVOICE_ID,
      amount: 10000,
      paymentDate: new Date('2025-06-15'),
      paymentMethodId: PAYMENT_METHOD_ID,
      creditNoteId: null,
      reference: null,
      notes: null,
      recordedBy: STAFF_USER.id,
      createdAt: new Date('2025-06-15'),
      updatedAt: new Date('2025-06-15'),
    };

    const fakeInvoiceForDelete = {
      id: INVOICE_ID,
      totalAmount: 50000,
      paidAmount: 20000,
      status: 'SENT',
    };

    function setupDeleteMocks(mockPrisma: TestCaller['mockPrisma']) {
      mockPrisma.payment.findUnique.mockResolvedValue(fakePaymentForDelete);
      mockPrisma.refund.count.mockResolvedValue(0);
      mockPrisma.accountingEntry.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.payment.delete.mockResolvedValue(fakePaymentForDelete);
      // After delete, aggregate returns remaining payments sum
      mockPrisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: 10000 },
      });
      mockPrisma.invoice.findUniqueOrThrow.mockResolvedValue(fakeInvoiceForDelete);
      mockPrisma.invoice.update.mockResolvedValue({});
    }

    it('should delete a payment and recalculate invoice', async () => {
      setupDeleteMocks(admin.mockPrisma);

      const result = await admin.caller.payments.delete({ id: PAYMENT_ID });

      expect(result.success).toBe(true);
      expect(admin.mockPrisma.payment.delete).toHaveBeenCalledWith({
        where: { id: PAYMENT_ID },
      });
    });

    it('should update invoice paidAmount after deletion', async () => {
      setupDeleteMocks(admin.mockPrisma);

      await admin.caller.payments.delete({ id: PAYMENT_ID });

      expect(admin.mockPrisma.invoice.update).toHaveBeenCalledWith({
        where: { id: INVOICE_ID },
        data: { paidAmount: 10000, status: 'SENT' },
      });
    });

    it('should set status to PAID if remaining payments still cover total', async () => {
      admin.mockPrisma.payment.findUnique.mockResolvedValue(fakePaymentForDelete);
      admin.mockPrisma.refund.count.mockResolvedValue(0);
      admin.mockPrisma.accountingEntry.updateMany.mockResolvedValue({ count: 0 });
      admin.mockPrisma.payment.delete.mockResolvedValue(fakePaymentForDelete);
      admin.mockPrisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: 50000 },
      });
      admin.mockPrisma.invoice.findUniqueOrThrow.mockResolvedValue({
        ...fakeInvoiceForDelete,
        totalAmount: 50000,
      });
      admin.mockPrisma.invoice.update.mockResolvedValue({});

      await admin.caller.payments.delete({ id: PAYMENT_ID });

      expect(admin.mockPrisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PAID' }),
        }),
      );
    });

    it('should preserve OVERDUE status when invoice was overdue', async () => {
      admin.mockPrisma.payment.findUnique.mockResolvedValue(fakePaymentForDelete);
      admin.mockPrisma.refund.count.mockResolvedValue(0);
      admin.mockPrisma.accountingEntry.updateMany.mockResolvedValue({ count: 0 });
      admin.mockPrisma.payment.delete.mockResolvedValue(fakePaymentForDelete);
      admin.mockPrisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: 5000 },
      });
      admin.mockPrisma.invoice.findUniqueOrThrow.mockResolvedValue({
        ...fakeInvoiceForDelete,
        status: 'OVERDUE',
        totalAmount: 50000,
      });
      admin.mockPrisma.invoice.update.mockResolvedValue({});

      await admin.caller.payments.delete({ id: PAYMENT_ID });

      expect(admin.mockPrisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'OVERDUE' }),
        }),
      );
    });

    it('should fallback to SENT status for non-overdue invoice after deletion', async () => {
      admin.mockPrisma.payment.findUnique.mockResolvedValue(fakePaymentForDelete);
      admin.mockPrisma.refund.count.mockResolvedValue(0);
      admin.mockPrisma.accountingEntry.updateMany.mockResolvedValue({ count: 0 });
      admin.mockPrisma.payment.delete.mockResolvedValue(fakePaymentForDelete);
      admin.mockPrisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      });
      admin.mockPrisma.invoice.findUniqueOrThrow.mockResolvedValue({
        ...fakeInvoiceForDelete,
        status: 'PAID',
        totalAmount: 50000,
      });
      admin.mockPrisma.invoice.update.mockResolvedValue({});

      await admin.caller.payments.delete({ id: PAYMENT_ID });

      // paidAmount (0) < totalAmount (50000), status was PAID (not OVERDUE) => SENT
      expect(admin.mockPrisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paidAmount: 0, status: 'SENT' }),
        }),
      );
    });

    it('should cancel accounting entries before deleting payment', async () => {
      setupDeleteMocks(admin.mockPrisma);

      await admin.caller.payments.delete({ id: PAYMENT_ID });

      expect(admin.mockPrisma.accountingEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paymentId: PAYMENT_ID,
            isCancelled: false,
          }),
          data: expect.objectContaining({
            isCancelled: true,
          }),
        }),
      );
    });

    it('should throw NOT_FOUND when payment does not exist', async () => {
      admin.mockPrisma.payment.findUnique.mockResolvedValue(null);

      await expect(admin.caller.payments.delete({ id: PAYMENT_ID })).rejects.toThrow(
        'Paiement non trouvé',
      );
    });

    it('should throw PRECONDITION_FAILED when payment has refunds', async () => {
      admin.mockPrisma.payment.findUnique.mockResolvedValue(fakePaymentForDelete);
      admin.mockPrisma.refund.count.mockResolvedValue(2);

      await expect(admin.caller.payments.delete({ id: PAYMENT_ID })).rejects.toThrow(
        'Impossible de supprimer ce paiement car il est lié à 2 remboursement(s)',
      );
    });
  });

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  describe('statistics', () => {
    it('should return aggregated statistics', async () => {
      admin.mockPrisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: 150000 },
      });
      admin.mockPrisma.invoice.aggregate
        .mockResolvedValueOnce({
          _sum: { totalAmount: 200000, paidAmount: 100000 },
        }) // pending
        .mockResolvedValueOnce({
          _sum: { totalAmount: 80000, paidAmount: 30000 },
        }); // overdue
      admin.mockPrisma.payment.findMany.mockResolvedValue([
        { amount: 100000, paymentMethod: { name: 'Especes' } },
        { amount: 30000, paymentMethod: { name: 'Cheque' } },
        { amount: 20000, paymentMethod: { name: 'Especes' } },
      ]);

      const result = await admin.caller.payments.statistics({});

      expect(result.totalPaid).toBe(150000);
      expect(result.totalPending).toBe(100000);   // 200000 - 100000
      expect(result.totalOverdue).toBe(50000);     // 80000 - 30000
      expect(result.paymentsByMethod).toHaveLength(2);
      // Sorted by total descending
      expect(result.paymentsByMethod[0]).toEqual({ method: 'Especes', total: 120000, count: 2 });
      expect(result.paymentsByMethod[1]).toEqual({ method: 'Cheque', total: 30000, count: 1 });
    });

    it('should return zeros when no data exists', async () => {
      admin.mockPrisma.payment.aggregate.mockResolvedValue({ _sum: { amount: null } });
      admin.mockPrisma.invoice.aggregate
        .mockResolvedValueOnce({ _sum: { totalAmount: null, paidAmount: null } })
        .mockResolvedValueOnce({ _sum: { totalAmount: null, paidAmount: null } });
      admin.mockPrisma.payment.findMany.mockResolvedValue([]);

      const result = await admin.caller.payments.statistics({});

      expect(result.totalPaid).toBe(0);
      expect(result.totalPending).toBe(0);
      expect(result.totalOverdue).toBe(0);
      expect(result.paymentsByMethod).toHaveLength(0);
    });

    it('should filter by date range', async () => {
      admin.mockPrisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 50000 } });
      admin.mockPrisma.invoice.aggregate
        .mockResolvedValueOnce({ _sum: { totalAmount: 0, paidAmount: 0 } })
        .mockResolvedValueOnce({ _sum: { totalAmount: 0, paidAmount: 0 } });
      admin.mockPrisma.payment.findMany.mockResolvedValue([]);

      await admin.caller.payments.statistics({
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      });

      // Verify payment.aggregate received date filters
      expect(admin.mockPrisma.payment.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paymentDate: expect.objectContaining({
              gte: new Date('2025-01-01'),
              lte: new Date('2025-12-31'),
            }),
          }),
        }),
      );
    });

    it('should filter by startDate only', async () => {
      admin.mockPrisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      admin.mockPrisma.invoice.aggregate
        .mockResolvedValueOnce({ _sum: { totalAmount: 0, paidAmount: 0 } })
        .mockResolvedValueOnce({ _sum: { totalAmount: 0, paidAmount: 0 } });
      admin.mockPrisma.payment.findMany.mockResolvedValue([]);

      await admin.caller.payments.statistics({ startDate: '2025-06-01' });

      expect(admin.mockPrisma.payment.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paymentDate: { gte: new Date('2025-06-01') },
          }),
        }),
      );
    });
  });
});
