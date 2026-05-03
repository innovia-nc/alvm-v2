import { describe, it, expect, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  createTestCaller,
  ADMIN_USER,
  STAFF_USER,
  PARENT_USER,
  type TestCaller,
} from '../helpers/test-caller';

const STAFF_ID = 'b0000000-0000-4000-a000-000000000001';
const USER_ID = 'b0000000-0000-4000-a000-000000000002';
const now = new Date('2025-06-01T10:00:00Z');

function makeStaffRow(overrides: Record<string, unknown> = {}) {
  return {
    userId: STAFF_ID,
    firstName: 'Jean',
    lastName: 'Dupont',
    email: 'jean.dupont@test.com',
    phone: '06 12 34 56 78',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    user: {
      email: 'jean.dupont@test.com',
      name: 'Jean Dupont',
      emailVerified: null,
    },
    ...overrides,
  };
}

function expectedStaffOutput(overrides: Record<string, unknown> = {}) {
  return {
    id: STAFF_ID,
    userId: STAFF_ID,
    firstName: 'Jean',
    lastName: 'Dupont',
    email: 'jean.dupont@test.com',
    phone: '06 12 34 56 78',
    createdAt: now,
    updatedAt: now,
    user: {
      email: 'jean.dupont@test.com',
      name: 'Jean Dupont',
      emailVerified: null,
    },
    ...overrides,
  };
}

describe('staff router', () => {
  let admin: TestCaller;
  let staff: TestCaller;

  beforeEach(() => {
    admin = createTestCaller(ADMIN_USER);
    staff = createTestCaller(STAFF_USER);
  });

  describe('list', () => {
    it('should return staff list with total', async () => {
      staff.mockPrisma.staffMember.findMany.mockResolvedValue([makeStaffRow()]);
      staff.mockPrisma.staffMember.count.mockResolvedValue(1);
      const result = await staff.caller.staff.list({
        limit: 20, offset: 0, sortBy: 'lastName', sortOrder: 'asc',
      });
      expect(result.staff).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.staff[0]).toEqual(expectedStaffOutput());
    });

    it('should deny PARENT access', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(
        caller.staff.list({ limit: 20, offset: 0, sortBy: 'lastName', sortOrder: 'asc' }),
      ).rejects.toThrow(TRPCError);
    });

    it('should deny unauthenticated access', async () => {
      const { caller } = createTestCaller(null);
      await expect(
        caller.staff.list({ limit: 20, offset: 0, sortBy: 'lastName', sortOrder: 'asc' }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('getById', () => {
    it('should return a staff member with user data', async () => {
      staff.mockPrisma.staffMember.findFirst.mockResolvedValue(makeStaffRow());
      const result = await staff.caller.staff.getById({ id: STAFF_ID });
      expect(result).toEqual(expectedStaffOutput());
    });

    it('should return null when staff member not found', async () => {
      staff.mockPrisma.staffMember.findFirst.mockResolvedValue(null);
      const result = await staff.caller.staff.getById({
        id: 'b0000000-0000-4000-a000-000000000099',
      });
      expect(result).toBeNull();
    });

    it('should deny PARENT access', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.staff.getById({ id: STAFF_ID })).rejects.toThrow(TRPCError);
    });
  });

  describe('create', () => {
    const createInput = {
      firstName: 'Marie',
      lastName: 'Martin',
      email: 'marie.martin@test.com',
      phone: '+687 12 34 56',
      password: 'Password1',
    };

    const createdRow = {
      userId: USER_ID,
      firstName: 'Marie',
      lastName: 'Martin',
      email: 'marie.martin@test.com',
      phone: '+687 12 34 56',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    it('should create user, account, and staff member in transaction', async () => {
      admin.mockPrisma.user.findUnique.mockResolvedValue(null);
      admin.mockPrisma.staffMember.findFirst.mockResolvedValue(null);
      admin.mockPrisma.user.create.mockResolvedValue({
        id: USER_ID, email: createInput.email, name: 'Marie Martin', role: 'STAFF',
      });
      admin.mockPrisma.account.create.mockResolvedValue({});
      admin.mockPrisma.staffMember.create.mockResolvedValue(createdRow);

      const result = await admin.caller.staff.create(createInput);
      expect(result.id).toBe(USER_ID);
      expect(result.firstName).toBe('Marie');
      expect(admin.mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('should reject duplicate user email', async () => {
      admin.mockPrisma.user.findUnique.mockResolvedValue({ id: 'x', email: createInput.email });
      await expect(admin.caller.staff.create(createInput)).rejects.toThrow(
        'Un compte avec cet email existe déjà',
      );
    });

    it('should reject duplicate staff email', async () => {
      admin.mockPrisma.user.findUnique.mockResolvedValue(null);
      admin.mockPrisma.staffMember.findFirst.mockResolvedValue(makeStaffRow({ email: createInput.email }));
      await expect(admin.caller.staff.create(createInput)).rejects.toThrow(
        'Un membre du personnel avec cet email existe déjà',
      );
    });

    it('should allow STAFF to create', async () => {
      staff.mockPrisma.user.findUnique.mockResolvedValue(null);
      staff.mockPrisma.staffMember.findFirst.mockResolvedValue(null);
      staff.mockPrisma.user.create.mockResolvedValue({
        id: USER_ID, email: createInput.email, name: 'Marie Martin', role: 'STAFF',
      });
      staff.mockPrisma.account.create.mockResolvedValue({});
      staff.mockPrisma.staffMember.create.mockResolvedValue(createdRow);
      const result = await staff.caller.staff.create(createInput);
      expect(result.id).toBe(USER_ID);
    });

    it('should reject password shorter than 8 characters', async () => {
      await expect(
        admin.caller.staff.create({ ...createInput, password: 'Pass1' }),
      ).rejects.toThrow();
    });

    it('should reject password without uppercase', async () => {
      await expect(
        admin.caller.staff.create({ ...createInput, password: 'password1' }),
      ).rejects.toThrow();
    });

    it('should reject password without digit', async () => {
      await expect(
        admin.caller.staff.create({ ...createInput, password: 'Passwordd' }),
      ).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should update firstName and lastName', async () => {
      admin.mockPrisma.staffMember.findFirst.mockResolvedValue(makeStaffRow());
      admin.mockPrisma.staffMember.update.mockResolvedValue({
        ...makeStaffRow(), firstName: 'Pierre', lastName: 'Lefevre', user: undefined,
      });
      const result = await admin.caller.staff.update({
        id: STAFF_ID, firstName: 'Pierre', lastName: 'Lefevre',
      });
      expect(result.firstName).toBe('Pierre');
    });

    it('should reject update on non-existent staff', async () => {
      admin.mockPrisma.staffMember.findFirst.mockResolvedValue(null);
      await expect(
        admin.caller.staff.update({ id: STAFF_ID, firstName: 'Updated' }),
      ).rejects.toThrow('Membre du personnel non trouvé');
    });

    it('should reject empty update', async () => {
      admin.mockPrisma.staffMember.findFirst.mockResolvedValue(makeStaffRow());
      await expect(
        admin.caller.staff.update({ id: STAFF_ID }),
      ).rejects.toThrow('Aucune modification fournie');
    });

    it('should allow STAFF to update', async () => {
      staff.mockPrisma.staffMember.findFirst.mockResolvedValue(makeStaffRow());
      staff.mockPrisma.staffMember.update.mockResolvedValue({
        ...makeStaffRow(), firstName: 'X', user: undefined,
      });
      const result = await staff.caller.staff.update({ id: STAFF_ID, firstName: 'X' });
      expect(result.firstName).toBe('X');
    });
  });

  describe('delete', () => {
    it('should soft-delete a staff member with no camps', async () => {
      admin.mockPrisma.camp.count.mockResolvedValue(0);
      admin.mockPrisma.staffMember.updateMany.mockResolvedValue({ count: 1 });
      const result = await admin.caller.staff.delete({ id: STAFF_ID });
      expect(result.success).toBe(true);
    });

    it('should reject deletion when staff has created camps', async () => {
      admin.mockPrisma.camp.count.mockResolvedValue(3);
      await expect(
        admin.caller.staff.delete({ id: STAFF_ID }),
      ).rejects.toThrow('Impossible de supprimer ce membre');
    });

    it('should reject deletion of non-existent staff', async () => {
      admin.mockPrisma.camp.count.mockResolvedValue(0);
      admin.mockPrisma.staffMember.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        admin.caller.staff.delete({ id: 'b0000000-0000-4000-a000-000000000099' }),
      ).rejects.toThrow('Membre du personnel non trouvé');
    });

    it('should allow STAFF to delete', async () => {
      staff.mockPrisma.camp.count.mockResolvedValue(0);
      staff.mockPrisma.staffMember.updateMany.mockResolvedValue({ count: 1 });
      const result = await staff.caller.staff.delete({ id: STAFF_ID });
      expect(result.success).toBe(true);
    });

    it('should deny PARENT from deleting', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.staff.delete({ id: STAFF_ID })).rejects.toThrow(TRPCError);
    });
  });
});
