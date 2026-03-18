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

const USER_ID = 'b0000000-0000-4000-a000-000000000010';
const USER_ID_2 = 'b0000000-0000-4000-a000-000000000011';
const CHILD_ID_1 = 'b0000000-0000-4000-a000-000000000020';
const CHILD_ID_2 = 'b0000000-0000-4000-a000-000000000021';

const now = new Date('2025-06-15T10:00:00Z');

function makeDbUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: 'john@test.com',
    name: 'John Doe',
    image: null,
    role: 'PARENT' as const,
    emailVerified: now,
    createdAt: now,
    updatedAt: now,
    parent: {
      userId: USER_ID,
      firstName: 'John',
      lastName: 'Doe',
      phone: '+687123456',
      email: 'john@test.com',
      address: '10 rue Test',
      city: 'Noumea',
      postalCode: '98800',
    },
    staffMember: null,
    ...overrides,
  };
}

function makeDbStaffUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID_2,
    email: 'jane@test.com',
    name: 'Jane Staff',
    image: null,
    role: 'STAFF' as const,
    emailVerified: now,
    createdAt: now,
    updatedAt: now,
    parent: null,
    staffMember: {
      userId: USER_ID_2,
      firstName: 'Jane',
      lastName: 'Staff',
      phone: '+687654321',
      email: 'jane@test.com',
    },
    ...overrides,
  };
}

function makeDbAdminUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: 'admin2@test.com',
    name: 'Admin Two',
    image: null,
    role: 'ADMIN' as const,
    emailVerified: now,
    createdAt: now,
    updatedAt: now,
    parent: null,
    staffMember: null,
    ...overrides,
  };
}

/** Expected mapped output for a parent user */
function expectedMappedUser(dbUser = makeDbUser()) {
  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    image: dbUser.image,
    role: dbUser.role,
    emailVerified: dbUser.emailVerified,
    createdAt: dbUser.createdAt,
    updatedAt: dbUser.updatedAt,
    parentProfile: dbUser.parent
      ? {
          id: dbUser.parent.userId,
          firstName: dbUser.parent.firstName,
          lastName: dbUser.parent.lastName,
          phone: dbUser.parent.phone,
          email: dbUser.parent.email,
          address: dbUser.parent.address || null,
          city: dbUser.parent.city || null,
          postalCode: dbUser.parent.postalCode || null,
        }
      : null,
    staffProfile: dbUser.staffMember
      ? {
          id: dbUser.staffMember.userId,
          firstName: dbUser.staffMember.firstName,
          lastName: dbUser.staffMember.lastName,
          phone: dbUser.staffMember.phone,
          email: dbUser.staffMember.email,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('users router', () => {
  let admin: TestCaller;
  let staff: TestCaller;

  beforeEach(() => {
    admin = createTestCaller(ADMIN_USER);
    staff = createTestCaller(STAFF_USER);
  });

  // =========================================================================
  // Access control
  // =========================================================================

  describe('access control', () => {
    // --- staffProcedure routes (list, getById) ---

    it('should deny unauthenticated access to list', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.users.list({})).rejects.toThrow(TRPCError);
    });

    it('should deny PARENT access to list', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.users.list({})).rejects.toThrow(TRPCError);
    });

    it('should deny unauthenticated access to getById', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.users.getById({ id: USER_ID })).rejects.toThrow(TRPCError);
    });

    it('should deny PARENT access to getById', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.users.getById({ id: USER_ID })).rejects.toThrow(TRPCError);
    });

    // --- adminProcedure routes (create, update, delete, resetPassword) ---

    it('should deny STAFF access to create', async () => {
      await expect(
        staff.caller.users.create({
          email: 'new@test.com',
          name: 'New User',
          role: 'ADMIN',
          password: 'Password1',
        }),
      ).rejects.toThrow(TRPCError);
    });

    it('should deny STAFF access to update', async () => {
      await expect(
        staff.caller.users.update({ id: USER_ID, name: 'Updated' }),
      ).rejects.toThrow(TRPCError);
    });

    it('should deny STAFF access to delete', async () => {
      await expect(
        staff.caller.users.delete({ id: USER_ID }),
      ).rejects.toThrow(TRPCError);
    });

    it('should deny STAFF access to resetPassword', async () => {
      await expect(
        staff.caller.users.resetPassword({ userId: USER_ID }),
      ).rejects.toThrow(TRPCError);
    });

    it('should deny unauthenticated access to create', async () => {
      const { caller } = createTestCaller(null);
      await expect(
        caller.users.create({
          email: 'new@test.com',
          name: 'New User',
          role: 'ADMIN',
          password: 'Password1',
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  // =========================================================================
  // list
  // =========================================================================

  describe('list', () => {
    it('should return mapped users with total', async () => {
      const dbUser = makeDbUser();
      staff.mockPrisma.user.findMany.mockResolvedValue([dbUser]);
      staff.mockPrisma.user.count.mockResolvedValue(1);

      const result = await staff.caller.users.list({});

      expect(result.total).toBe(1);
      expect(result.users).toHaveLength(1);
      expect(result.users[0]).toEqual(expectedMappedUser(dbUser));
    });

    it('should pass role filter to query', async () => {
      staff.mockPrisma.user.findMany.mockResolvedValue([]);
      staff.mockPrisma.user.count.mockResolvedValue(0);

      await staff.caller.users.list({ role: 'PARENT' });

      expect(staff.mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'PARENT' }),
        }),
      );
    });

    it('should pass search filter as OR conditions', async () => {
      staff.mockPrisma.user.findMany.mockResolvedValue([]);
      staff.mockPrisma.user.count.mockResolvedValue(0);

      await staff.caller.users.list({ search: 'john' });

      expect(staff.mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { email: { contains: 'john', mode: 'insensitive' } },
              { name: { contains: 'john', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });

    it('should apply limit and offset', async () => {
      staff.mockPrisma.user.findMany.mockResolvedValue([]);
      staff.mockPrisma.user.count.mockResolvedValue(0);

      await staff.caller.users.list({ limit: 10, offset: 5 });

      expect(staff.mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 5,
        }),
      );
    });

    it('should allow ADMIN access to list', async () => {
      admin.mockPrisma.user.findMany.mockResolvedValue([]);
      admin.mockPrisma.user.count.mockResolvedValue(0);

      const result = await admin.caller.users.list({});
      expect(result.total).toBe(0);
      expect(result.users).toEqual([]);
    });
  });

  // =========================================================================
  // getById
  // =========================================================================

  describe('getById', () => {
    it('should return a mapped user when found', async () => {
      const dbUser = makeDbUser();
      staff.mockPrisma.user.findUnique.mockResolvedValue(dbUser);

      const result = await staff.caller.users.getById({ id: USER_ID });

      expect(result).toEqual(expectedMappedUser(dbUser));
    });

    it('should return null for non-existent user', async () => {
      staff.mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await staff.caller.users.getById({ id: USER_ID });

      expect(result).toBeNull();
    });

    it('should return a staff user with staffProfile mapped', async () => {
      const dbUser = makeDbStaffUser();
      staff.mockPrisma.user.findUnique.mockResolvedValue(dbUser);

      const result = await staff.caller.users.getById({ id: USER_ID_2 });

      expect(result).not.toBeNull();
      expect(result!.staffProfile).toEqual({
        id: USER_ID_2,
        firstName: 'Jane',
        lastName: 'Staff',
        phone: '+687654321',
        email: 'jane@test.com',
      });
      expect(result!.parentProfile).toBeNull();
    });
  });

  // =========================================================================
  // create
  // =========================================================================

  describe('create', () => {
    it('should create a PARENT user with parentProfile', async () => {
      const dbUser = makeDbUser();
      // First findUnique for duplicate email check returns null
      admin.mockPrisma.user.findUnique.mockResolvedValue(null);
      // Inside $transaction: create, account.create, parent.create, findUniqueOrThrow
      admin.mockPrisma.user.create.mockResolvedValue({ id: USER_ID });
      admin.mockPrisma.account.create.mockResolvedValue({});
      admin.mockPrisma.parent.create.mockResolvedValue({});
      admin.mockPrisma.user.findUniqueOrThrow.mockResolvedValue(dbUser);

      const result = await admin.caller.users.create({
        email: 'john@test.com',
        name: 'John Doe',
        role: 'PARENT',
        password: 'Password1',
        parentProfile: {
          firstName: 'John',
          lastName: 'Doe',
          phone: '+687123456',
          address: '10 rue Test',
          city: 'Noumea',
          postalCode: '98800',
        },
      });

      expect(result).toEqual(expectedMappedUser(dbUser));
      expect(admin.mockPrisma.user.create).toHaveBeenCalledOnce();
      expect(admin.mockPrisma.account.create).toHaveBeenCalledOnce();
      expect(admin.mockPrisma.parent.create).toHaveBeenCalledOnce();
    });

    it('should create a STAFF user with staffProfile', async () => {
      const dbUser = makeDbStaffUser();
      admin.mockPrisma.user.findUnique.mockResolvedValue(null);
      admin.mockPrisma.user.create.mockResolvedValue({ id: USER_ID_2 });
      admin.mockPrisma.account.create.mockResolvedValue({});
      admin.mockPrisma.staffMember.create.mockResolvedValue({});
      admin.mockPrisma.user.findUniqueOrThrow.mockResolvedValue(dbUser);

      const result = await admin.caller.users.create({
        email: 'jane@test.com',
        name: 'Jane Staff',
        role: 'STAFF',
        password: 'Password1',
        staffProfile: {
          firstName: 'Jane',
          lastName: 'Staff',
          phone: '+687654321',
        },
      });

      expect(result.staffProfile).not.toBeNull();
      expect(result.staffProfile!.firstName).toBe('Jane');
      expect(admin.mockPrisma.staffMember.create).toHaveBeenCalledOnce();
    });

    it('should create an ADMIN user without profiles', async () => {
      const dbUser = makeDbAdminUser();
      admin.mockPrisma.user.findUnique.mockResolvedValue(null);
      admin.mockPrisma.user.create.mockResolvedValue({ id: USER_ID });
      admin.mockPrisma.account.create.mockResolvedValue({});
      admin.mockPrisma.user.findUniqueOrThrow.mockResolvedValue(dbUser);

      const result = await admin.caller.users.create({
        email: 'admin2@test.com',
        name: 'Admin Two',
        role: 'ADMIN',
        password: 'Password1',
      });

      expect(result.role).toBe('ADMIN');
      expect(result.parentProfile).toBeNull();
      expect(result.staffProfile).toBeNull();
      expect(admin.mockPrisma.parent.create).not.toHaveBeenCalled();
      expect(admin.mockPrisma.staffMember.create).not.toHaveBeenCalled();
    });

    it('should reject duplicate email', async () => {
      admin.mockPrisma.user.findUnique.mockResolvedValue(makeDbUser());

      await expect(
        admin.caller.users.create({
          email: 'john@test.com',
          name: 'John Duplicate',
          role: 'PARENT',
          password: 'Password1',
          parentProfile: {
            firstName: 'John',
            lastName: 'Duplicate',
            phone: '+687111111',
          },
        }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'CONFLICT' }),
      );
    });

    it('should reject PARENT role without parentProfile', async () => {
      admin.mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        admin.caller.users.create({
          email: 'noparent@test.com',
          name: 'No Parent Profile',
          role: 'PARENT',
          password: 'Password1',
        }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'BAD_REQUEST' }),
      );
    });

    it('should reject STAFF role without staffProfile', async () => {
      admin.mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        admin.caller.users.create({
          email: 'nostaff@test.com',
          name: 'No Staff Profile',
          role: 'STAFF',
          password: 'Password1',
        }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'BAD_REQUEST' }),
      );
    });

    it('should reject password without uppercase letter', async () => {
      await expect(
        admin.caller.users.create({
          email: 'weak@test.com',
          name: 'Weak Pass',
          role: 'ADMIN',
          password: 'password1',
        }),
      ).rejects.toThrow();
    });

    it('should reject password without lowercase letter', async () => {
      await expect(
        admin.caller.users.create({
          email: 'weak@test.com',
          name: 'Weak Pass',
          role: 'ADMIN',
          password: 'PASSWORD1',
        }),
      ).rejects.toThrow();
    });

    it('should reject password without digit', async () => {
      await expect(
        admin.caller.users.create({
          email: 'weak@test.com',
          name: 'Weak Pass',
          role: 'ADMIN',
          password: 'PasswordX',
        }),
      ).rejects.toThrow();
    });

    it('should reject password shorter than 8 characters', async () => {
      await expect(
        admin.caller.users.create({
          email: 'weak@test.com',
          name: 'Weak Pass',
          role: 'ADMIN',
          password: 'Pass1',
        }),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // update
  // =========================================================================

  describe('update', () => {
    it('should update a user and return mapped result', async () => {
      const dbUser = makeDbUser();
      const updatedDbUser = makeDbUser({ name: 'John Updated' });
      // First findUnique for existence check
      admin.mockPrisma.user.findUnique.mockResolvedValueOnce(dbUser);
      // Inside transaction: user.update
      admin.mockPrisma.user.update.mockResolvedValue({});
      // After transaction: findUniqueOrThrow
      admin.mockPrisma.user.findUniqueOrThrow.mockResolvedValue(updatedDbUser);

      const result = await admin.caller.users.update({
        id: USER_ID,
        name: 'John Updated',
      });

      expect(result.name).toBe('John Updated');
    });

    it('should reject update for non-existent user', async () => {
      admin.mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        admin.caller.users.update({ id: USER_ID, name: 'Ghost' }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' }),
      );
    });

    it('should reject update with duplicate email', async () => {
      const existingUser = makeDbUser();
      // First findUnique: user exists
      admin.mockPrisma.user.findUnique.mockResolvedValueOnce(existingUser);
      // Second findFirst: another user has the same email
      admin.mockPrisma.user.findFirst.mockResolvedValue(
        makeDbUser({ id: USER_ID_2, email: 'taken@test.com' }),
      );

      await expect(
        admin.caller.users.update({ id: USER_ID, email: 'taken@test.com' }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'CONFLICT' }),
      );
    });

    it('should skip email uniqueness check when email unchanged', async () => {
      const dbUser = makeDbUser();
      admin.mockPrisma.user.findUnique.mockResolvedValueOnce(dbUser);
      admin.mockPrisma.user.update.mockResolvedValue({});
      admin.mockPrisma.user.findUniqueOrThrow.mockResolvedValue(dbUser);

      await admin.caller.users.update({ id: USER_ID, email: 'john@test.com' });

      expect(admin.mockPrisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('should update parentProfile when provided', async () => {
      const dbUser = makeDbUser();
      admin.mockPrisma.user.findUnique.mockResolvedValueOnce(dbUser);
      admin.mockPrisma.parent.updateMany.mockResolvedValue({ count: 1 });
      admin.mockPrisma.user.findUniqueOrThrow.mockResolvedValue(
        makeDbUser({
          parent: {
            userId: USER_ID,
            firstName: 'Johnny',
            lastName: 'Doe',
            phone: '+687123456',
            email: 'john@test.com',
            address: '10 rue Test',
            city: 'Noumea',
            postalCode: '98800',
          },
        }),
      );

      const result = await admin.caller.users.update({
        id: USER_ID,
        parentProfile: { firstName: 'Johnny' },
      });

      expect(result.parentProfile!.firstName).toBe('Johnny');
      expect(admin.mockPrisma.parent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, deletedAt: null },
        }),
      );
    });

    it('should update staffProfile when provided', async () => {
      const dbUser = makeDbStaffUser();
      admin.mockPrisma.user.findUnique.mockResolvedValueOnce(dbUser);
      admin.mockPrisma.staffMember.updateMany.mockResolvedValue({ count: 1 });
      admin.mockPrisma.user.findUniqueOrThrow.mockResolvedValue(
        makeDbStaffUser({
          staffMember: {
            userId: USER_ID_2,
            firstName: 'Janet',
            lastName: 'Staff',
            phone: '+687654321',
            email: 'jane@test.com',
          },
        }),
      );

      const result = await admin.caller.users.update({
        id: USER_ID_2,
        staffProfile: { firstName: 'Janet' },
      });

      expect(result.staffProfile!.firstName).toBe('Janet');
      expect(admin.mockPrisma.staffMember.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID_2, deletedAt: null },
        }),
      );
    });
  });

  // =========================================================================
  // delete
  // =========================================================================

  describe('delete', () => {
    it('should soft-delete a PARENT user and return success', async () => {
      const dbUser = makeDbUser();
      admin.mockPrisma.user.findUnique.mockResolvedValue(dbUser);
      // Not admin, so admin count check is skipped
      admin.mockPrisma.registration.count.mockResolvedValue(0);
      // Transaction: soft-delete parent, staffMember, find child links, delete links
      admin.mockPrisma.parent.updateMany.mockResolvedValue({ count: 1 });
      admin.mockPrisma.staffMember.updateMany.mockResolvedValue({ count: 0 });
      admin.mockPrisma.childParent.findMany.mockResolvedValue([]);
      admin.mockPrisma.childParent.deleteMany.mockResolvedValue({ count: 0 });

      const result = await admin.caller.users.delete({ id: USER_ID });

      expect(result).toEqual({ success: true });
      expect(admin.mockPrisma.parent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, deletedAt: null },
          data: { deletedAt: expect.any(Date) },
        }),
      );
    });

    it('should reject deletion of non-existent user', async () => {
      admin.mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        admin.caller.users.delete({ id: USER_ID }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' }),
      );
    });

    it('should reject deletion of the last ADMIN', async () => {
      const adminUser = makeDbAdminUser();
      admin.mockPrisma.user.findUnique.mockResolvedValue(adminUser);
      admin.mockPrisma.user.count.mockResolvedValue(1);

      await expect(
        admin.caller.users.delete({ id: USER_ID }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'PRECONDITION_FAILED' }),
      );
    });

    it('should allow deletion of an ADMIN when more than one exists', async () => {
      const adminUser = makeDbAdminUser();
      admin.mockPrisma.user.findUnique.mockResolvedValue(adminUser);
      admin.mockPrisma.user.count.mockResolvedValue(2);
      admin.mockPrisma.registration.count.mockResolvedValue(0);
      admin.mockPrisma.parent.updateMany.mockResolvedValue({ count: 0 });
      admin.mockPrisma.staffMember.updateMany.mockResolvedValue({ count: 0 });
      admin.mockPrisma.childParent.findMany.mockResolvedValue([]);
      admin.mockPrisma.childParent.deleteMany.mockResolvedValue({ count: 0 });

      const result = await admin.caller.users.delete({ id: USER_ID });
      expect(result).toEqual({ success: true });
    });

    it('should reject deletion when user has active registrations', async () => {
      const dbUser = makeDbUser();
      admin.mockPrisma.user.findUnique.mockResolvedValue(dbUser);
      admin.mockPrisma.registration.count.mockResolvedValue(2);

      await expect(
        admin.caller.users.delete({ id: USER_ID }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'PRECONDITION_FAILED' }),
      );
    });

    it('should soft-delete children with only one parent link', async () => {
      const dbUser = makeDbUser();
      admin.mockPrisma.user.findUnique.mockResolvedValue(dbUser);
      admin.mockPrisma.registration.count.mockResolvedValue(0);
      admin.mockPrisma.parent.updateMany.mockResolvedValue({ count: 1 });
      admin.mockPrisma.staffMember.updateMany.mockResolvedValue({ count: 0 });
      admin.mockPrisma.childParent.findMany.mockResolvedValue([
        { childId: CHILD_ID_1 },
        { childId: CHILD_ID_2 },
      ]);
      // Child 1 has only this parent (count=1) → soft-delete
      // Child 2 has two parents (count=2) → keep
      admin.mockPrisma.childParent.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2);
      admin.mockPrisma.child.update.mockResolvedValue({});
      admin.mockPrisma.childParent.deleteMany.mockResolvedValue({ count: 2 });

      const result = await admin.caller.users.delete({ id: USER_ID });

      expect(result).toEqual({ success: true });
      // Only child 1 should be soft-deleted (the one with a single parent link)
      expect(admin.mockPrisma.child.update).toHaveBeenCalledTimes(1);
      expect(admin.mockPrisma.child.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CHILD_ID_1 },
          data: { deletedAt: expect.any(Date) },
        }),
      );
    });

    it('should not soft-delete children that have other parents', async () => {
      const dbUser = makeDbUser();
      admin.mockPrisma.user.findUnique.mockResolvedValue(dbUser);
      admin.mockPrisma.registration.count.mockResolvedValue(0);
      admin.mockPrisma.parent.updateMany.mockResolvedValue({ count: 1 });
      admin.mockPrisma.staffMember.updateMany.mockResolvedValue({ count: 0 });
      admin.mockPrisma.childParent.findMany.mockResolvedValue([
        { childId: CHILD_ID_1 },
      ]);
      // Child has 2 parent links → not soft-deleted
      admin.mockPrisma.childParent.count.mockResolvedValue(2);
      admin.mockPrisma.childParent.deleteMany.mockResolvedValue({ count: 1 });

      await admin.caller.users.delete({ id: USER_ID });

      expect(admin.mockPrisma.child.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // resetPassword
  // =========================================================================

  describe('resetPassword', () => {
    it('should reset password with a provided newPassword', async () => {
      admin.mockPrisma.user.findUnique.mockResolvedValue(makeDbUser());
      admin.mockPrisma.account.updateMany.mockResolvedValue({ count: 1 });

      const result = await admin.caller.users.resetPassword({
        userId: USER_ID,
        newPassword: 'NewPass123',
      });

      expect(result.success).toBe(true);
      expect(result.tempPassword).toBe('NewPass123');
      expect(admin.mockPrisma.account.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, provider: 'credentials' },
          data: { providerAccountId: expect.any(String) },
        }),
      );
    });

    it('should generate a temp password when newPassword is not provided', async () => {
      admin.mockPrisma.user.findUnique.mockResolvedValue(makeDbUser());
      admin.mockPrisma.account.updateMany.mockResolvedValue({ count: 1 });

      const result = await admin.caller.users.resetPassword({
        userId: USER_ID,
      });

      expect(result.success).toBe(true);
      // Generated temp password follows XXX-XXXX-XX pattern (3-4-2 segments)
      expect(result.tempPassword).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{4}-[A-Z0-9]{2}$/);
    });

    it('should reject reset for non-existent user', async () => {
      admin.mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        admin.caller.users.resetPassword({ userId: USER_ID }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' }),
      );
    });

    it('should reject reset when no credentials account exists', async () => {
      admin.mockPrisma.user.findUnique.mockResolvedValue(makeDbUser());
      admin.mockPrisma.account.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        admin.caller.users.resetPassword({ userId: USER_ID }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' }),
      );
    });

    it('should reject newPassword that does not meet complexity requirements', async () => {
      await expect(
        admin.caller.users.resetPassword({
          userId: USER_ID,
          newPassword: 'weak',
        }),
      ).rejects.toThrow();
    });
  });
});
