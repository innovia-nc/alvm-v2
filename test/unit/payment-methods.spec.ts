import { describe, it, expect, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  createTestCaller,
  ADMIN_USER,
  STAFF_USER,
  PARENT_USER,
  type TestCaller,
} from '../helpers/test-caller';

const PM_ID = 'b0000000-0000-4000-a000-000000000010';
const PM_ID_2 = 'b0000000-0000-4000-a000-000000000011';
const now = new Date('2025-06-01T10:00:00Z');

function makePaymentMethod(overrides: Record<string, unknown> = {}) {
  return {
    id: PM_ID,
    code: 'ESPECES',
    name: 'Especes',
    description: 'Paiement en especes',
    accountingCode: '512000',
    active: true,
    displayOrder: 1,
    isSystem: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('paymentMethods router', () => {
  let admin: TestCaller;

  beforeEach(() => {
    admin = createTestCaller(ADMIN_USER);
  });

  describe('list', () => {
    it('should return active payment methods without auth', async () => {
      const { caller, mockPrisma } = createTestCaller(null);
      mockPrisma.paymentMethod.findMany.mockResolvedValue([makePaymentMethod()]);
      const result = await caller.paymentMethods.list();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Especes');
    });

    it('should return empty array when no active methods exist', async () => {
      const { caller, mockPrisma } = createTestCaller(null);
      mockPrisma.paymentMethod.findMany.mockResolvedValue([]);
      const result = await caller.paymentMethods.list();
      expect(result).toEqual([]);
    });
  });

  describe('listAll', () => {
    it('should return all payment methods for admin', async () => {
      admin.mockPrisma.paymentMethod.findMany.mockResolvedValue([
        makePaymentMethod(),
        makePaymentMethod({ id: PM_ID_2, code: 'CHEQUE', name: 'Cheque', active: false }),
      ]);
      const result = await admin.caller.paymentMethods.listAll();
      expect(result).toHaveLength(2);
    });

    it('should deny STAFF access', async () => {
      const { caller } = createTestCaller(STAFF_USER);
      await expect(caller.paymentMethods.listAll()).rejects.toThrow(TRPCError);
    });

    it('should deny PARENT access', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.paymentMethods.listAll()).rejects.toThrow(TRPCError);
    });
  });

  describe('create', () => {
    it('should create a payment method with generated code', async () => {
      admin.mockPrisma.paymentMethod.findFirst.mockResolvedValue(null);
      admin.mockPrisma.paymentMethod.create.mockResolvedValue(
        makePaymentMethod({ code: 'VIREMENT_BANCAIRE', name: 'Virement Bancaire' }),
      );
      const result = await admin.caller.paymentMethods.create({
        name: 'Virement Bancaire',
        accountingCode: '512100',
      });
      expect(result.name).toBe('Virement Bancaire');
      expect(admin.mockPrisma.paymentMethod.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ code: 'VIREMENT_BANCAIRE' }),
      });
    });

    it('should reject duplicate name', async () => {
      admin.mockPrisma.paymentMethod.findFirst.mockResolvedValue(makePaymentMethod());
      await expect(
        admin.caller.paymentMethods.create({ name: 'Especes' }),
      ).rejects.toThrow('Une methode de paiement avec ce nom existe deja');
    });

    it('should reject invalid accountingCode format', async () => {
      await expect(
        admin.caller.paymentMethods.create({ name: 'Test', accountingCode: '123' }),
      ).rejects.toThrow();
    });

    it('should deny STAFF from creating', async () => {
      const { caller } = createTestCaller(STAFF_USER);
      await expect(caller.paymentMethods.create({ name: 'Test' })).rejects.toThrow(TRPCError);
    });
  });

  describe('update', () => {
    it('should update name of a payment method', async () => {
      const existing = makePaymentMethod();
      admin.mockPrisma.paymentMethod.findUnique.mockResolvedValue(existing);
      admin.mockPrisma.paymentMethod.findFirst.mockResolvedValue(null);
      admin.mockPrisma.paymentMethod.update.mockResolvedValue({ ...existing, name: 'Especes Modifie' });
      const result = await admin.caller.paymentMethods.update({ id: PM_ID, name: 'Especes Modifie' });
      expect(result.name).toBe('Especes Modifie');
    });

    it('should reject update on non-existent payment method', async () => {
      admin.mockPrisma.paymentMethod.findUnique.mockResolvedValue(null);
      await expect(
        admin.caller.paymentMethods.update({ id: PM_ID, name: 'Updated' }),
      ).rejects.toThrow('Methode de paiement non trouvee');
    });

    it('should reject duplicate name when renaming', async () => {
      admin.mockPrisma.paymentMethod.findUnique.mockResolvedValue(makePaymentMethod());
      admin.mockPrisma.paymentMethod.findFirst.mockResolvedValue(
        makePaymentMethod({ id: PM_ID_2, name: 'Cheque' }),
      );
      await expect(
        admin.caller.paymentMethods.update({ id: PM_ID, name: 'Cheque' }),
      ).rejects.toThrow('Une methode de paiement avec ce nom existe deja');
    });
  });

  describe('toggleActive', () => {
    it('should activate an inactive payment method', async () => {
      admin.mockPrisma.paymentMethod.findUnique.mockResolvedValue(makePaymentMethod({ active: false }));
      admin.mockPrisma.paymentMethod.update.mockResolvedValue(makePaymentMethod({ active: true }));
      const result = await admin.caller.paymentMethods.toggleActive({ id: PM_ID });
      expect(result.active).toBe(true);
      expect(admin.mockPrisma.payment.count).not.toHaveBeenCalled();
    });

    it('should reject deactivation when recent payments exist', async () => {
      admin.mockPrisma.paymentMethod.findUnique.mockResolvedValue(makePaymentMethod({ active: true }));
      admin.mockPrisma.payment.count.mockResolvedValue(5);
      await expect(
        admin.caller.paymentMethods.toggleActive({ id: PM_ID }),
      ).rejects.toThrow('Impossible de desactiver une methode utilisee recemment (30 jours)');
    });
  });

  describe('delete', () => {
    it('should delete a non-system payment method with no payments', async () => {
      admin.mockPrisma.paymentMethod.findUnique.mockResolvedValue(makePaymentMethod());
      admin.mockPrisma.payment.count.mockResolvedValue(0);
      admin.mockPrisma.paymentMethod.delete.mockResolvedValue(makePaymentMethod());
      const result = await admin.caller.paymentMethods.delete({ id: PM_ID });
      expect(result.success).toBe(true);
    });

    it('should reject deletion of system payment method', async () => {
      admin.mockPrisma.paymentMethod.findUnique.mockResolvedValue(makePaymentMethod({ isSystem: true }));
      await expect(
        admin.caller.paymentMethods.delete({ id: PM_ID }),
      ).rejects.toThrow('Impossible de supprimer une methode de paiement systeme');
    });

    it('should reject deletion when payments reference the method', async () => {
      admin.mockPrisma.paymentMethod.findUnique.mockResolvedValue(makePaymentMethod());
      admin.mockPrisma.payment.count.mockResolvedValue(10);
      await expect(
        admin.caller.paymentMethods.delete({ id: PM_ID }),
      ).rejects.toThrow('Impossible de supprimer une methode utilisee par des paiements');
    });
  });
});
