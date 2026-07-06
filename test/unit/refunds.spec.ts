import { describe, it, expect, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  createTestCaller,
  ADMIN_USER,
  STAFF_USER,
  PARENT_USER,
  type TestCaller,
} from '../helpers/test-caller';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PAYMENT_ID = '11111111-1111-4111-a111-111111111111';
const REFUND_ID = '22222222-2222-4222-a222-222222222222';
const INVOICE_ID = '33333333-3333-4333-a333-333333333333';
const PARENT_ID = '44444444-4444-4444-a444-444444444444';
const PAYMENT_METHOD_ID = '55555555-5555-4555-a555-555555555555';

const now = new Date('2025-06-15T10:00:00Z');

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: PAYMENT_ID,
    amount: 10000,
    paymentDate: now,
    paymentMethodId: PAYMENT_METHOD_ID,
    invoiceId: INVOICE_ID,
    paymentMethod: { accountingCode: '530000' },
    invoice: { invoiceNumber: 'FAC-2025-0001', parentId: PARENT_ID },
    ...overrides,
  };
}

function makeRefundRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REFUND_ID,
    paymentId: PAYMENT_ID,
    amount: 3000,
    refundDate: now,
    refundMethod: 'IMMEDIATE_REFUND',
    reason: 'Annulation partielle',
    reference: 'REF-001',
    notes: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeRefundWithRelations(overrides: Record<string, unknown> = {}) {
  return {
    ...makeRefundRow(overrides),
    payment: {
      id: PAYMENT_ID,
      amount: 10000,
      paymentDate: now,
      paymentMethodId: PAYMENT_METHOD_ID,
      paymentMethod: { name: 'Especes', code: 'CASH' },
      invoice: {
        id: INVOICE_ID,
        invoiceNumber: 'FAC-2025-0001',
        parentId: PARENT_ID,
        parent: {
          firstName: 'Jean',
          lastName: 'Dupont',
          email: 'jean.dupont@test.com',
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('refunds router', () => {
  let caller: TestCaller['caller'];
  let mockPrisma: TestCaller['mockPrisma'];

  // ==========================================================================
  // ACCESS CONTROL
  // ==========================================================================

  describe('access control', () => {
    it('denies unauthenticated access to list', async () => {
      const { caller: anonCaller } = createTestCaller(null);

      await expect(
        anonCaller.refunds.list({ limit: 20, offset: 0 }),
      ).rejects.toThrow(TRPCError);

      await expect(
        anonCaller.refunds.list({ limit: 20, offset: 0 }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('denies unauthenticated access to create', async () => {
      const { caller: anonCaller } = createTestCaller(null);

      await expect(
        anonCaller.refunds.create({
          paymentId: PAYMENT_ID,
          amount: 1000,
          refundDate: '2025-06-15',
          refundMethod: 'IMMEDIATE_REFUND',
          reason: 'Test refund',
        }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('denies unauthenticated access to delete', async () => {
      const { caller: anonCaller } = createTestCaller(null);

      await expect(
        anonCaller.refunds.delete({ id: REFUND_ID }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('denies PARENT access to list', async () => {
      const { caller: parentCaller } = createTestCaller(PARENT_USER);

      await expect(
        parentCaller.refunds.list({ limit: 20, offset: 0 }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('denies PARENT access to create', async () => {
      const { caller: parentCaller } = createTestCaller(PARENT_USER);

      await expect(
        parentCaller.refunds.create({
          paymentId: PAYMENT_ID,
          amount: 1000,
          refundDate: '2025-06-15',
          refundMethod: 'IMMEDIATE_REFUND',
          reason: 'Test refund',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('denies PARENT access to delete', async () => {
      const { caller: parentCaller } = createTestCaller(PARENT_USER);

      await expect(
        parentCaller.refunds.delete({ id: REFUND_ID }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('allows STAFF access to list', async () => {
      const { caller: staffCaller, mockPrisma: mp } =
        createTestCaller(STAFF_USER);
      mp.refund.findMany.mockResolvedValue([]);
      mp.refund.count.mockResolvedValue(0);

      const result = await staffCaller.refunds.list({ limit: 20, offset: 0 });
      expect(result).toEqual({ refunds: [], total: 0 });
    });

    it('allows ADMIN access to list', async () => {
      const { caller: adminCaller, mockPrisma: mp } =
        createTestCaller(ADMIN_USER);
      mp.refund.findMany.mockResolvedValue([]);
      mp.refund.count.mockResolvedValue(0);

      const result = await adminCaller.refunds.list({ limit: 20, offset: 0 });
      expect(result).toEqual({ refunds: [], total: 0 });
    });
  });

  // ==========================================================================
  // LIST
  // ==========================================================================

  describe('list', () => {
    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
    });

    it('returns empty list when no refunds exist', async () => {
      mockPrisma.refund.findMany.mockResolvedValue([]);
      mockPrisma.refund.count.mockResolvedValue(0);

      const result = await caller.refunds.list({ limit: 20, offset: 0 });

      expect(result).toEqual({ refunds: [], total: 0 });
      expect(mockPrisma.refund.findMany).toHaveBeenCalledOnce();
      expect(mockPrisma.refund.count).toHaveBeenCalledOnce();
    });

    it('returns refunds with relations mapped correctly', async () => {
      const row = makeRefundWithRelations();
      mockPrisma.refund.findMany.mockResolvedValue([row]);
      mockPrisma.refund.count.mockResolvedValue(1);

      const result = await caller.refunds.list({ limit: 20, offset: 0 });

      expect(result.total).toBe(1);
      expect(result.refunds).toHaveLength(1);

      const refund = result.refunds[0];
      expect(refund.id).toBe(REFUND_ID);
      expect(refund.amount).toBe(3000);
      expect(refund.refundMethod).toBe('IMMEDIATE_REFUND');
      expect(refund.payment.id).toBe(PAYMENT_ID);
      expect(refund.payment.amount).toBe(10000);
      expect(refund.payment.paymentMethodName).toBe('Especes');
      expect(refund.payment.paymentMethodCode).toBe('CASH');
      expect(refund.payment.invoice.invoiceNumber).toBe('FAC-2025-0001');
      expect(refund.payment.invoice.parent.firstName).toBe('Jean');
      expect(refund.payment.invoice.parent.lastName).toBe('Dupont');
    });

    it('passes pagination parameters to prisma', async () => {
      mockPrisma.refund.findMany.mockResolvedValue([]);
      mockPrisma.refund.count.mockResolvedValue(0);

      await caller.refunds.list({
        limit: 10,
        offset: 20,
        sortBy: 'amount',
        sortOrder: 'asc',
      });

      expect(mockPrisma.refund.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
          orderBy: { amount: 'asc' },
        }),
      );
    });

    it('applies search filter when provided', async () => {
      mockPrisma.refund.findMany.mockResolvedValue([]);
      mockPrisma.refund.count.mockResolvedValue(0);

      await caller.refunds.list({
        limit: 20,
        offset: 0,
        search: 'dupont',
      });

      const findManyCall = mockPrisma.refund.findMany.mock.calls[0][0];
      expect(findManyCall.where.OR).toBeDefined();
      // refundNumber, reference, reason + invoiceNumber, firstName, lastName
      expect(findManyCall.where.OR).toHaveLength(6);
    });

    it('applies paymentId filter when provided', async () => {
      mockPrisma.refund.findMany.mockResolvedValue([]);
      mockPrisma.refund.count.mockResolvedValue(0);

      await caller.refunds.list({
        limit: 20,
        offset: 0,
        paymentId: PAYMENT_ID,
      });

      const findManyCall = mockPrisma.refund.findMany.mock.calls[0][0];
      expect(findManyCall.where.paymentId).toBe(PAYMENT_ID);
    });

    it('always filters out soft-deleted refunds', async () => {
      mockPrisma.refund.findMany.mockResolvedValue([]);
      mockPrisma.refund.count.mockResolvedValue(0);

      await caller.refunds.list({ limit: 20, offset: 0 });

      const findManyCall = mockPrisma.refund.findMany.mock.calls[0][0];
      expect(findManyCall.where.deletedAt).toBeNull();
    });

    it('uses default sort by refundDate desc', async () => {
      mockPrisma.refund.findMany.mockResolvedValue([]);
      mockPrisma.refund.count.mockResolvedValue(0);

      await caller.refunds.list({ limit: 20, offset: 0 });

      expect(mockPrisma.refund.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { refundDate: 'desc' },
        }),
      );
    });
  });

  // ==========================================================================
  // GET BY ID
  // ==========================================================================

  describe('getById', () => {
    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
    });

    it('returns a refund with relations when found', async () => {
      const row = makeRefundWithRelations();
      mockPrisma.refund.findFirst.mockResolvedValue(row);

      const result = await caller.refunds.getById({ id: REFUND_ID });

      expect(result).not.toBeNull();
      expect(result!.id).toBe(REFUND_ID);
      expect(result!.payment.invoice.invoiceNumber).toBe('FAC-2025-0001');
      expect(mockPrisma.refund.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REFUND_ID },
        }),
      );
    });

    it('returns null when refund is not found', async () => {
      mockPrisma.refund.findFirst.mockResolvedValue(null);

      const result = await caller.refunds.getById({ id: REFUND_ID });

      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // CREATE
  // ==========================================================================

  describe('create', () => {
    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
    });

    it('creates a refund successfully', async () => {
      const payment = makePayment();
      mockPrisma.payment.findUnique.mockResolvedValue(payment);
      mockPrisma.refund.aggregate.mockResolvedValue({ _sum: { amount: 0 } });

      const createdRow = makeRefundRow({
        amount: 2000,
        refundMethod: 'FUTURE_CREDIT',
        reason: 'Trop percu',
        reference: null,
        notes: 'Note de test',
      });
      mockPrisma.refund.create.mockResolvedValue(createdRow);
      // FUTURE_CREDIT does not create accounting entries

      const result = await caller.refunds.create({
        paymentId: PAYMENT_ID,
        amount: 2000,
        refundDate: '2025-06-15',
        refundMethod: 'FUTURE_CREDIT',
        reason: 'Trop percu',
        notes: 'Note de test',
      });

      expect(result.id).toBe(REFUND_ID);
      expect(result.amount).toBe(2000);
      expect(result.refundMethod).toBe('FUTURE_CREDIT');
      expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
      expect(mockPrisma.refund.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentId: PAYMENT_ID,
            amount: 2000,
            refundMethod: 'FUTURE_CREDIT',
            reason: 'Trop percu',
            recordedBy: STAFF_USER.id,
          }),
        }),
      );
      // FUTURE_CREDIT should NOT create accounting entries
      expect(mockPrisma.accountingEntry.create).not.toHaveBeenCalled();
    });

    it('creates a refund when existing refunds exist but total does not exceed payment', async () => {
      const payment = makePayment({ amount: 10000 });
      mockPrisma.payment.findUnique.mockResolvedValue(payment);
      mockPrisma.refund.aggregate.mockResolvedValue({
        _sum: { amount: 5000 },
      });

      const createdRow = makeRefundRow({ amount: 4000 });
      mockPrisma.refund.create.mockResolvedValue(createdRow);
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ entry_num: 'BQ202506150001' }]);
      mockPrisma.accountingEntry.create.mockResolvedValue({});

      const result = await caller.refunds.create({
        paymentId: PAYMENT_ID,
        amount: 4000,
        refundDate: '2025-06-15',
        refundMethod: 'IMMEDIATE_REFUND',
        reason: 'Remboursement partiel',
      });

      expect(result.id).toBe(REFUND_ID);
    });

    it('creates a refund for the exact remaining amount', async () => {
      const payment = makePayment({ amount: 10000 });
      mockPrisma.payment.findUnique.mockResolvedValue(payment);
      mockPrisma.refund.aggregate.mockResolvedValue({
        _sum: { amount: 7000 },
      });

      const createdRow = makeRefundRow({ amount: 3000 });
      mockPrisma.refund.create.mockResolvedValue(createdRow);
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ entry_num: 'BQ202506150001' }]);
      mockPrisma.accountingEntry.create.mockResolvedValue({});

      // 7000 + 3000 = 10000, exactly the payment amount — should succeed
      const result = await caller.refunds.create({
        paymentId: PAYMENT_ID,
        amount: 3000,
        refundDate: '2025-06-15',
        refundMethod: 'IMMEDIATE_REFUND',
        reason: 'Remboursement du solde',
      });

      expect(result.amount).toBe(3000);
    });

    it('sets optional fields to null when not provided', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(makePayment());
      mockPrisma.refund.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      mockPrisma.refund.create.mockResolvedValue(
        makeRefundRow({ reference: null, notes: null }),
      );
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ entry_num: 'BQ202506150001' }]);
      mockPrisma.accountingEntry.create.mockResolvedValue({});

      await caller.refunds.create({
        paymentId: PAYMENT_ID,
        amount: 1000,
        refundDate: '2025-06-15',
        refundMethod: 'IMMEDIATE_REFUND',
        reason: 'Test sans optionnels',
      });

      expect(mockPrisma.refund.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reference: null,
            notes: null,
          }),
        }),
      );
    });

    it('throws NOT_FOUND when payment does not exist', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(null);

      await expect(
        caller.refunds.create({
          paymentId: PAYMENT_ID,
          amount: 1000,
          refundDate: '2025-06-15',
          refundMethod: 'IMMEDIATE_REFUND',
          reason: 'Test not found',
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Paiement non trouvé',
      });
    });

    it('throws BAD_REQUEST when refund amount exceeds remaining payment amount', async () => {
      const payment = makePayment({ amount: 10000 });
      mockPrisma.payment.findUnique.mockResolvedValue(payment);
      mockPrisma.refund.aggregate.mockResolvedValue({
        _sum: { amount: 8000 },
      });

      // 8000 + 5000 = 13000 > 10000
      await expect(
        caller.refunds.create({
          paymentId: PAYMENT_ID,
          amount: 5000,
          refundDate: '2025-06-15',
          refundMethod: 'IMMEDIATE_REFUND',
          reason: 'Trop de remboursement',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('throws BAD_REQUEST when refund exceeds payment with no prior refunds', async () => {
      const payment = makePayment({ amount: 5000 });
      mockPrisma.payment.findUnique.mockResolvedValue(payment);
      mockPrisma.refund.aggregate.mockResolvedValue({ _sum: { amount: null } });

      // 0 + 6000 = 6000 > 5000
      await expect(
        caller.refunds.create({
          paymentId: PAYMENT_ID,
          amount: 6000,
          refundDate: '2025-06-15',
          refundMethod: 'IMMEDIATE_REFUND',
          reason: 'Montant trop eleve',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('uses $transaction for atomicity', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(makePayment());
      mockPrisma.refund.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      mockPrisma.refund.create.mockResolvedValue(makeRefundRow());
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ entry_num: 'BQ202506150001' }]);
      mockPrisma.accountingEntry.create.mockResolvedValue({});

      await caller.refunds.create({
        paymentId: PAYMENT_ID,
        amount: 3000,
        refundDate: '2025-06-15',
        refundMethod: 'IMMEDIATE_REFUND',
        reason: 'Transaction test',
      });

      expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });

    it('allows ADMIN to create refunds', async () => {
      const { caller: adminCaller, mockPrisma: mp } =
        createTestCaller(ADMIN_USER);
      mp.payment.findUnique.mockResolvedValue(makePayment());
      mp.refund.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      mp.refund.create.mockResolvedValue(makeRefundRow());
      mp.$queryRawUnsafe.mockResolvedValue([{ entry_num: 'BQ202506150001' }]);
      mp.accountingEntry.create.mockResolvedValue({});

      const result = await adminCaller.refunds.create({
        paymentId: PAYMENT_ID,
        amount: 3000,
        refundDate: '2025-06-15',
        refundMethod: 'IMMEDIATE_REFUND',
        reason: 'Admin refund',
      });

      expect(result.id).toBe(REFUND_ID);
      expect(mp.refund.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recordedBy: ADMIN_USER.id,
          }),
        }),
      );
    });

    it('creates accounting entries (D 411000 / C bank) for IMMEDIATE_REFUND', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(makePayment());
      mockPrisma.refund.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      mockPrisma.refund.create.mockResolvedValue(makeRefundRow({ refundMethod: 'IMMEDIATE_REFUND' }));
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ entry_num: 'BQ202506150001' }]);
      mockPrisma.accountingEntry.create.mockResolvedValue({});

      await caller.refunds.create({
        paymentId: PAYMENT_ID,
        amount: 3000,
        refundDate: '2025-06-15',
        refundMethod: 'IMMEDIATE_REFUND',
        reason: 'Remboursement immediat',
      });

      // Should create 2 accounting entries (debit + credit)
      expect(mockPrisma.accountingEntry.create).toHaveBeenCalledTimes(2);

      // Debit: client account (411000)
      expect(mockPrisma.accountingEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            journalCode: 'BQ',
            accountNumber: '411000',
            debit: 3000,
            credit: 0,
          }),
        }),
      );

      // Credit: bank account (530000 from CASH payment method)
      expect(mockPrisma.accountingEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            journalCode: 'BQ',
            accountNumber: '530000',
            debit: 0,
            credit: 3000,
          }),
        }),
      );
    });

    it('does NOT create accounting entries for FUTURE_CREDIT refund', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(makePayment());
      mockPrisma.refund.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      mockPrisma.refund.create.mockResolvedValue(makeRefundRow({ refundMethod: 'FUTURE_CREDIT' }));

      await caller.refunds.create({
        paymentId: PAYMENT_ID,
        amount: 3000,
        refundDate: '2025-06-15',
        refundMethod: 'FUTURE_CREDIT',
        reason: 'Credit futur',
      });

      // FUTURE_CREDIT should NOT generate accounting entries
      expect(mockPrisma.accountingEntry.create).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // DELETE
  // ==========================================================================

  describe('delete', () => {
    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
    });

    it('deletes a refund successfully as ADMIN', async () => {
      // Facture liée : 3000 remboursés à restituer au payé (25000 − 3000 = 22000 avant delete)
      mockPrisma.refund.findUnique.mockResolvedValue(makeRefundRow({
        payment: { invoice: { id: 'a0000000-0000-1000-a000-00000000000f', totalAmount: 25000, paidAmount: 22000, status: 'SENT' } },
      }));
      mockPrisma.accountingEntry.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.refund.delete.mockResolvedValue(makeRefundRow());
      mockPrisma.invoice.update.mockResolvedValue({});

      const result = await caller.refunds.delete({ id: REFUND_ID });

      expect(result).toEqual({ success: true });
      expect(mockPrisma.refund.delete).toHaveBeenCalledWith({
        where: { id: REFUND_ID },
      });
      // La suppression d'un remboursement immédiat restitue le montant : 22000 + 3000 = 25000 → PAID
      expect(mockPrisma.invoice.update).toHaveBeenCalledWith({
        where: { id: 'a0000000-0000-1000-a000-00000000000f' },
        data: { paidAmount: 25000, status: 'PAID' },
      });
    });

    it('cancels accounting entries before deleting refund', async () => {
      mockPrisma.refund.findUnique.mockResolvedValue(makeRefundRow());
      mockPrisma.accountingEntry.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.refund.delete.mockResolvedValue(makeRefundRow());

      await caller.refunds.delete({ id: REFUND_ID });

      expect(mockPrisma.accountingEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            refundId: REFUND_ID,
            isCancelled: false,
          }),
          data: expect.objectContaining({
            isCancelled: true,
          }),
        }),
      );
    });

    it('throws NOT_FOUND when refund does not exist', async () => {
      mockPrisma.refund.findUnique.mockResolvedValue(null);

      await expect(
        caller.refunds.delete({ id: REFUND_ID }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Remboursement non trouvé',
      });

      expect(mockPrisma.refund.delete).not.toHaveBeenCalled();
    });

    it('denies PARENT users from deleting', async () => {
      const { caller: parentCaller } = createTestCaller(PARENT_USER);

      await expect(
        parentCaller.refunds.delete({ id: REFUND_ID }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});
