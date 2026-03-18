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

const PARENT_ID = 'b0000000-0000-4000-a000-000000000001';
const PARENT_ID_2 = 'b0000000-0000-4000-a000-000000000002';
const CHILD_ID_A = 'b0000000-0000-4000-a000-000000000010';
const CHILD_ID_B = 'b0000000-0000-4000-a000-000000000011';

const now = new Date('2025-06-15T10:00:00Z');

function makeParent(overrides: Record<string, unknown> = {}) {
  return {
    userId: PARENT_ID,
    firstName: 'Marie',
    lastName: 'Dupont',
    phone: '0612345678',
    email: 'marie@test.com',
    address: '12 rue de la Paix',
    city: 'Noumea',
    postalCode: '98800',
    employeur: 'Mairie',
    fonction: 'Secretaire',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    childrenLinks: [],
    ...overrides,
  };
}

function makeParentWithUser(overrides: Record<string, unknown> = {}) {
  return {
    ...makeParent(),
    user: {
      email: 'marie@test.com',
      name: 'Marie Dupont',
      emailVerified: null,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parents router', () => {
  let admin: TestCaller;
  let staff: TestCaller;
  let parent: TestCaller;

  beforeEach(() => {
    admin = createTestCaller(ADMIN_USER);
    staff = createTestCaller(STAFF_USER);
    parent = createTestCaller(PARENT_USER);
  });

  // =========================================================================
  // list
  // =========================================================================

  describe('list', () => {
    it('should deny PARENT access', async () => {
      await expect(
        parent.caller.parents.list({
          limit: 20,
          offset: 0,
          sortBy: 'lastName',
          sortOrder: 'asc',
          status: 'active',
        }),
      ).rejects.toThrow(TRPCError);
    });

    it('should deny unauthenticated access', async () => {
      const { caller } = createTestCaller(null);
      await expect(
        caller.parents.list({
          limit: 20,
          offset: 0,
          sortBy: 'lastName',
          sortOrder: 'asc',
          status: 'active',
        }),
      ).rejects.toThrow(TRPCError);
    });

    it('should return parents with childrenCount and registrationsCount for ADMIN', async () => {
      const parentRecord = makeParentWithUser({
        childrenLinks: [{ id: CHILD_ID_A }, { id: CHILD_ID_B }],
      });
      admin.mockPrisma.parent.findMany.mockResolvedValue([parentRecord]);
      admin.mockPrisma.parent.count.mockResolvedValue(1);
      admin.mockPrisma.registration.groupBy.mockResolvedValue([
        { parentId: PARENT_ID, _count: 3 },
      ]);

      const result = await admin.caller.parents.list({
        limit: 20,
        offset: 0,
        sortBy: 'lastName',
        sortOrder: 'asc',
        status: 'active',
      });

      expect(result.parents).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.parents[0].firstName).toBe('Marie');
      expect(result.parents[0].childrenCount).toBe(2);
      expect(result.parents[0].registrationsCount).toBe(3);
      expect(result.parents[0].user.email).toBe('marie@test.com');
    });

    it('should return parents for STAFF', async () => {
      staff.mockPrisma.parent.findMany.mockResolvedValue([
        makeParentWithUser({ childrenLinks: [] }),
      ]);
      staff.mockPrisma.parent.count.mockResolvedValue(1);
      staff.mockPrisma.registration.groupBy.mockResolvedValue([]);

      const result = await staff.caller.parents.list({
        limit: 20,
        offset: 0,
        sortBy: 'lastName',
        sortOrder: 'asc',
        status: 'active',
      });

      expect(result.parents).toHaveLength(1);
    });

    it('should handle search filter', async () => {
      admin.mockPrisma.parent.findMany.mockResolvedValue([]);
      admin.mockPrisma.parent.count.mockResolvedValue(0);

      await admin.caller.parents.list({
        limit: 20,
        offset: 0,
        search: 'Dupont',
        sortBy: 'lastName',
        sortOrder: 'asc',
        status: 'active',
      });

      const findManyCall = admin.mockPrisma.parent.findMany.mock.calls[0][0];
      expect(findManyCall.where.OR).toBeDefined();
      expect(findManyCall.where.OR).toHaveLength(4);
    });

    it('should filter active parents (deletedAt null)', async () => {
      admin.mockPrisma.parent.findMany.mockResolvedValue([]);
      admin.mockPrisma.parent.count.mockResolvedValue(0);

      await admin.caller.parents.list({
        limit: 20,
        offset: 0,
        sortBy: 'lastName',
        sortOrder: 'asc',
        status: 'active',
      });

      const findManyCall = admin.mockPrisma.parent.findMany.mock.calls[0][0];
      expect(findManyCall.where.deletedAt).toBeNull();
    });

    it('should filter inactive parents (deletedAt not null)', async () => {
      admin.mockPrisma.parent.findMany.mockResolvedValue([]);
      admin.mockPrisma.parent.count.mockResolvedValue(0);

      await admin.caller.parents.list({
        limit: 20,
        offset: 0,
        sortBy: 'lastName',
        sortOrder: 'asc',
        status: 'inactive',
      });

      const findManyCall = admin.mockPrisma.parent.findMany.mock.calls[0][0];
      expect(findManyCall.where.deletedAt).toEqual({ not: null });
    });

    it('should not filter by deletedAt when status is all', async () => {
      admin.mockPrisma.parent.findMany.mockResolvedValue([]);
      admin.mockPrisma.parent.count.mockResolvedValue(0);

      await admin.caller.parents.list({
        limit: 20,
        offset: 0,
        sortBy: 'lastName',
        sortOrder: 'asc',
        status: 'all',
      });

      const findManyCall = admin.mockPrisma.parent.findMany.mock.calls[0][0];
      expect(findManyCall.where.deletedAt).toBeUndefined();
    });

    it('should support pagination', async () => {
      admin.mockPrisma.parent.findMany.mockResolvedValue([]);
      admin.mockPrisma.parent.count.mockResolvedValue(50);

      const result = await admin.caller.parents.list({
        limit: 10,
        offset: 20,
        sortBy: 'lastName',
        sortOrder: 'asc',
        status: 'active',
      });

      expect(result.total).toBe(50);
      const findManyCall = admin.mockPrisma.parent.findMany.mock.calls[0][0];
      expect(findManyCall.take).toBe(10);
      expect(findManyCall.skip).toBe(20);
    });

    it('should support sorting', async () => {
      admin.mockPrisma.parent.findMany.mockResolvedValue([]);
      admin.mockPrisma.parent.count.mockResolvedValue(0);

      await admin.caller.parents.list({
        limit: 20,
        offset: 0,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        status: 'active',
      });

      const findManyCall = admin.mockPrisma.parent.findMany.mock.calls[0][0];
      expect(findManyCall.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('should default registrationsCount to 0 when parent has no registrations', async () => {
      admin.mockPrisma.parent.findMany.mockResolvedValue([
        makeParentWithUser({ childrenLinks: [] }),
      ]);
      admin.mockPrisma.parent.count.mockResolvedValue(1);
      admin.mockPrisma.registration.groupBy.mockResolvedValue([]);

      const result = await admin.caller.parents.list({
        limit: 20,
        offset: 0,
        sortBy: 'lastName',
        sortOrder: 'asc',
        status: 'active',
      });

      expect(result.parents[0].registrationsCount).toBe(0);
    });

    it('should return empty list when no parents match', async () => {
      admin.mockPrisma.parent.findMany.mockResolvedValue([]);
      admin.mockPrisma.parent.count.mockResolvedValue(0);

      const result = await admin.caller.parents.list({
        limit: 20,
        offset: 0,
        sortBy: 'lastName',
        sortOrder: 'asc',
        status: 'active',
      });

      expect(result.parents).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // =========================================================================
  // getMe
  // =========================================================================

  describe('getMe', () => {
    it('should deny unauthenticated access', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.parents.getMe()).rejects.toThrow(TRPCError);
    });

    it('should return parent profile for PARENT user', async () => {
      parent.mockPrisma.parent.findFirst.mockResolvedValue(
        makeParent({ userId: PARENT_USER.id }),
      );

      const result = await parent.caller.parents.getMe();

      expect(result).not.toBeNull();
      expect(result!.id).toBe(PARENT_USER.id);
      expect(result!.userId).toBe(PARENT_USER.id);
      expect(result!.firstName).toBe('Marie');
    });

    it('should return null for STAFF user', async () => {
      const result = await staff.caller.parents.getMe();

      expect(result).toBeNull();
      // Should not even query prisma since role is not PARENT
      expect(staff.mockPrisma.parent.findFirst).not.toHaveBeenCalled();
    });

    it('should return null for ADMIN user', async () => {
      const result = await admin.caller.parents.getMe();

      expect(result).toBeNull();
      expect(admin.mockPrisma.parent.findFirst).not.toHaveBeenCalled();
    });

    it('should return null when parent record not found', async () => {
      parent.mockPrisma.parent.findFirst.mockResolvedValue(null);

      const result = await parent.caller.parents.getMe();

      expect(result).toBeNull();
    });

    it('should query with deletedAt null filter', async () => {
      parent.mockPrisma.parent.findFirst.mockResolvedValue(null);

      await parent.caller.parents.getMe();

      const findFirstCall = parent.mockPrisma.parent.findFirst.mock.calls[0][0];
      expect(findFirstCall.where.userId).toBe(PARENT_USER.id);
      expect(findFirstCall.where.deletedAt).toBeNull();
    });
  });

  // =========================================================================
  // getById
  // =========================================================================

  describe('getById', () => {
    it('should deny PARENT access', async () => {
      await expect(
        parent.caller.parents.getById({ id: PARENT_ID }),
      ).rejects.toThrow(TRPCError);
    });

    it('should deny unauthenticated access', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.parents.getById({ id: PARENT_ID })).rejects.toThrow(TRPCError);
    });

    it('should return parent with user for ADMIN', async () => {
      admin.mockPrisma.parent.findFirst.mockResolvedValue(makeParentWithUser());

      const result = await admin.caller.parents.getById({ id: PARENT_ID });

      expect(result).not.toBeNull();
      expect(result!.id).toBe(PARENT_ID);
      expect(result!.userId).toBe(PARENT_ID);
      expect(result!.firstName).toBe('Marie');
      expect(result!.user.email).toBe('marie@test.com');
    });

    it('should return parent for STAFF', async () => {
      staff.mockPrisma.parent.findFirst.mockResolvedValue(makeParentWithUser());

      const result = await staff.caller.parents.getById({ id: PARENT_ID });

      expect(result).not.toBeNull();
      expect(result!.firstName).toBe('Marie');
    });

    it('should return null for non-existent parent', async () => {
      admin.mockPrisma.parent.findFirst.mockResolvedValue(null);

      const result = await admin.caller.parents.getById({ id: PARENT_ID });

      expect(result).toBeNull();
    });

    it('should query with deletedAt null filter', async () => {
      admin.mockPrisma.parent.findFirst.mockResolvedValue(null);

      await admin.caller.parents.getById({ id: PARENT_ID });

      const findFirstCall = admin.mockPrisma.parent.findFirst.mock.calls[0][0];
      expect(findFirstCall.where.userId).toBe(PARENT_ID);
      expect(findFirstCall.where.deletedAt).toBeNull();
    });
  });

  // =========================================================================
  // update (self-update by PARENT)
  // =========================================================================

  describe('update', () => {
    it('should deny unauthenticated access', async () => {
      const { caller } = createTestCaller(null);
      await expect(
        caller.parents.update({ firstName: 'Updated' }),
      ).rejects.toThrow(TRPCError);
    });

    it('should reject non-PARENT role (STAFF)', async () => {
      await expect(
        staff.caller.parents.update({ firstName: 'Updated' }),
      ).rejects.toThrow('Seuls les parents peuvent modifier leur profil');
    });

    it('should reject non-PARENT role (ADMIN)', async () => {
      await expect(
        admin.caller.parents.update({ firstName: 'Updated' }),
      ).rejects.toThrow('Seuls les parents peuvent modifier leur profil');
    });

    it('should reject empty updates', async () => {
      await expect(
        parent.caller.parents.update({}),
      ).rejects.toThrow('Aucune modification fournie');
    });

    it('should update parent profile', async () => {
      const updated = makeParent({
        userId: PARENT_USER.id,
        firstName: 'Updated',
      });
      parent.mockPrisma.parent.update.mockResolvedValue(updated);

      const result = await parent.caller.parents.update({ firstName: 'Updated' });

      expect(result.firstName).toBe('Updated');
      expect(parent.mockPrisma.parent.update).toHaveBeenCalledWith({
        where: { userId: PARENT_USER.id },
        data: expect.objectContaining({ firstName: 'Updated' }),
      });
    });

    it('should update multiple fields at once', async () => {
      const updated = makeParent({
        userId: PARENT_USER.id,
        firstName: 'NewFirst',
        lastName: 'NewLast',
        phone: '0699999999',
      });
      parent.mockPrisma.parent.update.mockResolvedValue(updated);

      const result = await parent.caller.parents.update({
        firstName: 'NewFirst',
        lastName: 'NewLast',
        phone: '0699999999',
      });

      expect(result.firstName).toBe('NewFirst');
      expect(result.lastName).toBe('NewLast');
      expect(result.phone).toBe('0699999999');
    });

    it('should set employeur to null when empty string provided', async () => {
      const updated = makeParent({
        userId: PARENT_USER.id,
        employeur: null,
      });
      parent.mockPrisma.parent.update.mockResolvedValue(updated);

      await parent.caller.parents.update({ employeur: '' });

      const updateCall = parent.mockPrisma.parent.update.mock.calls[0][0];
      expect(updateCall.data.employeur).toBeNull();
    });

    it('should map result using mapParent (id equals userId)', async () => {
      const updated = makeParent({ userId: PARENT_USER.id });
      parent.mockPrisma.parent.update.mockResolvedValue(updated);

      const result = await parent.caller.parents.update({ firstName: 'Marie' });

      expect(result.id).toBe(PARENT_USER.id);
      expect(result.userId).toBe(PARENT_USER.id);
    });
  });

  // =========================================================================
  // create
  // =========================================================================

  describe('create', () => {
    const validInput = {
      firstName: 'Jean',
      lastName: 'Martin',
      email: 'jean@test.com',
      phone: '0698765432',
      password: 'Password1',
    };

    it('should deny PARENT from creating parents', async () => {
      await expect(
        parent.caller.parents.create(validInput),
      ).rejects.toThrow(TRPCError);
    });

    it('should deny unauthenticated access', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.parents.create(validInput)).rejects.toThrow(TRPCError);
    });

    it('should create a parent with user and account for ADMIN', async () => {
      const createdUser = { id: PARENT_ID, email: 'jean@test.com', name: 'Jean Martin', role: 'PARENT' };
      const createdParent = makeParent({
        userId: PARENT_ID,
        firstName: 'Jean',
        lastName: 'Martin',
        email: 'jean@test.com',
        phone: '0698765432',
        address: '',
        city: '',
        postalCode: '',
        employeur: null,
        fonction: null,
      });

      admin.mockPrisma.user.findUnique.mockResolvedValue(null);
      admin.mockPrisma.parent.findFirst.mockResolvedValue(null);
      admin.mockPrisma.user.create.mockResolvedValue(createdUser);
      admin.mockPrisma.account.create.mockResolvedValue({});
      admin.mockPrisma.parent.create.mockResolvedValue(createdParent);

      const result = await admin.caller.parents.create(validInput);

      expect(result.firstName).toBe('Jean');
      expect(result.lastName).toBe('Martin');
      expect(result.email).toBe('jean@test.com');
      expect(result.id).toBe(PARENT_ID);
      expect(admin.mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should allow STAFF to create parents', async () => {
      const createdParent = makeParent({
        userId: PARENT_ID,
        firstName: 'Jean',
        lastName: 'Martin',
        email: 'jean@test.com',
        phone: '0698765432',
      });

      staff.mockPrisma.user.findUnique.mockResolvedValue(null);
      staff.mockPrisma.parent.findFirst.mockResolvedValue(null);
      staff.mockPrisma.user.create.mockResolvedValue({ id: PARENT_ID, email: 'jean@test.com', name: 'Jean Martin', role: 'PARENT' });
      staff.mockPrisma.account.create.mockResolvedValue({});
      staff.mockPrisma.parent.create.mockResolvedValue(createdParent);

      const result = await staff.caller.parents.create(validInput);

      expect(result.firstName).toBe('Jean');
    });

    it('should reject duplicate user email', async () => {
      admin.mockPrisma.user.findUnique.mockResolvedValue({
        id: PARENT_ID_2,
        email: 'jean@test.com',
      });

      await expect(
        admin.caller.parents.create(validInput),
      ).rejects.toThrow('Un compte avec cet email existe déjà');
    });

    it('should reject duplicate parent email', async () => {
      admin.mockPrisma.user.findUnique.mockResolvedValue(null);
      admin.mockPrisma.parent.findFirst.mockResolvedValue(
        makeParent({ email: 'jean@test.com' }),
      );

      await expect(
        admin.caller.parents.create(validInput),
      ).rejects.toThrow('Un parent avec cet email existe déjà');
    });

    it('should create user with PARENT role and formatted name', async () => {
      admin.mockPrisma.user.findUnique.mockResolvedValue(null);
      admin.mockPrisma.parent.findFirst.mockResolvedValue(null);
      admin.mockPrisma.user.create.mockResolvedValue({ id: PARENT_ID, email: 'jean@test.com', name: 'Jean Martin', role: 'PARENT' });
      admin.mockPrisma.account.create.mockResolvedValue({});
      admin.mockPrisma.parent.create.mockResolvedValue(
        makeParent({ userId: PARENT_ID, firstName: 'Jean', lastName: 'Martin', email: 'jean@test.com' }),
      );

      await admin.caller.parents.create(validInput);

      expect(admin.mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'jean@test.com',
          name: 'Jean Martin',
          role: 'PARENT',
        },
      });
    });

    it('should create account with credentials provider', async () => {
      admin.mockPrisma.user.findUnique.mockResolvedValue(null);
      admin.mockPrisma.parent.findFirst.mockResolvedValue(null);
      admin.mockPrisma.user.create.mockResolvedValue({ id: PARENT_ID, email: 'jean@test.com', name: 'Jean Martin', role: 'PARENT' });
      admin.mockPrisma.account.create.mockResolvedValue({});
      admin.mockPrisma.parent.create.mockResolvedValue(
        makeParent({ userId: PARENT_ID, firstName: 'Jean', lastName: 'Martin', email: 'jean@test.com' }),
      );

      await admin.caller.parents.create(validInput);

      expect(admin.mockPrisma.account.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: PARENT_ID,
          type: 'credentials',
          provider: 'credentials',
          providerAccountId: expect.any(String),
        }),
      });
    });

    it('should create parent record with optional fields defaulting', async () => {
      admin.mockPrisma.user.findUnique.mockResolvedValue(null);
      admin.mockPrisma.parent.findFirst.mockResolvedValue(null);
      admin.mockPrisma.user.create.mockResolvedValue({ id: PARENT_ID, email: 'jean@test.com', name: 'Jean Martin', role: 'PARENT' });
      admin.mockPrisma.account.create.mockResolvedValue({});
      admin.mockPrisma.parent.create.mockResolvedValue(
        makeParent({ userId: PARENT_ID, firstName: 'Jean', lastName: 'Martin', email: 'jean@test.com' }),
      );

      await admin.caller.parents.create(validInput);

      expect(admin.mockPrisma.parent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: PARENT_ID,
          firstName: 'Jean',
          lastName: 'Martin',
          email: 'jean@test.com',
          phone: '0698765432',
          address: '',
          city: '',
          postalCode: '',
          employeur: null,
          fonction: null,
        }),
      });
    });

    it('should reject password without uppercase', async () => {
      await expect(
        admin.caller.parents.create({ ...validInput, password: 'password1' }),
      ).rejects.toThrow();
    });

    it('should reject password without lowercase', async () => {
      await expect(
        admin.caller.parents.create({ ...validInput, password: 'PASSWORD1' }),
      ).rejects.toThrow();
    });

    it('should reject password without digit', async () => {
      await expect(
        admin.caller.parents.create({ ...validInput, password: 'PasswordNoDigit' }),
      ).rejects.toThrow();
    });

    it('should reject password shorter than 8 chars', async () => {
      await expect(
        admin.caller.parents.create({ ...validInput, password: 'Pass1' }),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // updateByStaff
  // =========================================================================

  describe('updateByStaff', () => {
    it('should deny PARENT access', async () => {
      await expect(
        parent.caller.parents.updateByStaff({ id: PARENT_ID, firstName: 'Updated' }),
      ).rejects.toThrow(TRPCError);
    });

    it('should deny unauthenticated access', async () => {
      const { caller } = createTestCaller(null);
      await expect(
        caller.parents.updateByStaff({ id: PARENT_ID, firstName: 'Updated' }),
      ).rejects.toThrow(TRPCError);
    });

    it('should reject not-found parent', async () => {
      admin.mockPrisma.parent.findFirst.mockResolvedValue(null);

      await expect(
        admin.caller.parents.updateByStaff({ id: PARENT_ID, firstName: 'Updated' }),
      ).rejects.toThrow('Parent non trouvé');
    });

    it('should reject empty updates', async () => {
      admin.mockPrisma.parent.findFirst.mockResolvedValue(makeParent());

      await expect(
        admin.caller.parents.updateByStaff({ id: PARENT_ID }),
      ).rejects.toThrow('Aucune modification fournie');
    });

    it('should update parent fields for ADMIN', async () => {
      const updated = makeParent({ firstName: 'Updated' });
      admin.mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      admin.mockPrisma.parent.update.mockResolvedValue(updated);

      const result = await admin.caller.parents.updateByStaff({
        id: PARENT_ID,
        firstName: 'Updated',
      });

      expect(result.firstName).toBe('Updated');
      expect(admin.mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should update parent fields for STAFF', async () => {
      const updated = makeParent({ firstName: 'StaffEdit' });
      staff.mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      staff.mockPrisma.parent.update.mockResolvedValue(updated);

      const result = await staff.caller.parents.updateByStaff({
        id: PARENT_ID,
        firstName: 'StaffEdit',
      });

      expect(result.firstName).toBe('StaffEdit');
    });

    it('should sync email to user table when email is updated', async () => {
      const updated = makeParent({ email: 'new@test.com' });
      admin.mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      admin.mockPrisma.user.update.mockResolvedValue({});
      admin.mockPrisma.parent.update.mockResolvedValue(updated);

      const result = await admin.caller.parents.updateByStaff({
        id: PARENT_ID,
        email: 'new@test.com',
      });

      expect(result.email).toBe('new@test.com');
      expect(admin.mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: PARENT_ID },
        data: { email: 'new@test.com' },
      });
    });

    it('should not call user.update when email is not changed', async () => {
      const updated = makeParent({ firstName: 'Updated' });
      admin.mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      admin.mockPrisma.parent.update.mockResolvedValue(updated);

      await admin.caller.parents.updateByStaff({
        id: PARENT_ID,
        firstName: 'Updated',
      });

      expect(admin.mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should update multiple fields at once', async () => {
      const updated = makeParent({
        firstName: 'NewFirst',
        lastName: 'NewLast',
        phone: '0699999999',
      });
      admin.mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      admin.mockPrisma.parent.update.mockResolvedValue(updated);

      const result = await admin.caller.parents.updateByStaff({
        id: PARENT_ID,
        firstName: 'NewFirst',
        lastName: 'NewLast',
        phone: '0699999999',
      });

      expect(result.firstName).toBe('NewFirst');
      expect(result.lastName).toBe('NewLast');
      expect(result.phone).toBe('0699999999');
    });

    it('should set employeur to null when empty string provided', async () => {
      const updated = makeParent({ employeur: null });
      admin.mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      admin.mockPrisma.parent.update.mockResolvedValue(updated);

      await admin.caller.parents.updateByStaff({
        id: PARENT_ID,
        employeur: '',
      });

      const txFn = admin.mockPrisma.$transaction.mock.calls[0][0];
      // The transaction callback is called with mock prisma;
      // we check that parent.update receives the right data
      expect(admin.mockPrisma.parent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ employeur: null }),
        }),
      );
    });
  });

  // =========================================================================
  // delete
  // =========================================================================

  describe('delete', () => {
    it('should deny PARENT access', async () => {
      await expect(
        parent.caller.parents.delete({ id: PARENT_ID }),
      ).rejects.toThrow(TRPCError);
    });

    it('should deny STAFF access (adminProcedure)', async () => {
      await expect(
        staff.caller.parents.delete({ id: PARENT_ID }),
      ).rejects.toThrow(TRPCError);
    });

    it('should deny unauthenticated access', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.parents.delete({ id: PARENT_ID })).rejects.toThrow(TRPCError);
    });

    it('should soft-delete parent without active registrations', async () => {
      admin.mockPrisma.registration.count.mockResolvedValue(0);
      admin.mockPrisma.parent.updateMany.mockResolvedValue({ count: 1 });
      admin.mockPrisma.childParent.findMany.mockResolvedValue([]);
      admin.mockPrisma.childParent.deleteMany.mockResolvedValue({ count: 0 });

      const result = await admin.caller.parents.delete({ id: PARENT_ID });

      expect(result.success).toBe(true);
      expect(admin.mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(admin.mockPrisma.parent.updateMany).toHaveBeenCalledWith({
        where: { userId: PARENT_ID, deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('should reject deletion when active registrations exist', async () => {
      admin.mockPrisma.registration.count.mockResolvedValue(2);

      await expect(
        admin.caller.parents.delete({ id: PARENT_ID }),
      ).rejects.toThrow('Impossible de supprimer ce parent : des inscriptions actives existent pour ses enfants');
    });

    it('should throw NOT_FOUND when parent does not exist (updateMany count 0)', async () => {
      admin.mockPrisma.registration.count.mockResolvedValue(0);
      admin.mockPrisma.parent.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        admin.caller.parents.delete({ id: PARENT_ID }),
      ).rejects.toThrow('Parent non trouvé');
    });

    it('should soft-delete orphan children (only this parent)', async () => {
      admin.mockPrisma.registration.count.mockResolvedValue(0);
      admin.mockPrisma.parent.updateMany.mockResolvedValue({ count: 1 });
      admin.mockPrisma.childParent.findMany.mockResolvedValue([
        { childId: CHILD_ID_A },
        { childId: CHILD_ID_B },
      ]);
      // CHILD_ID_A has only 1 parent (orphan) — CHILD_ID_B has 2 parents (not orphan)
      admin.mockPrisma.childParent.count
        .mockResolvedValueOnce(1) // CHILD_ID_A — orphan
        .mockResolvedValueOnce(2); // CHILD_ID_B — not orphan
      admin.mockPrisma.child.update.mockResolvedValue({});
      admin.mockPrisma.childParent.deleteMany.mockResolvedValue({ count: 2 });

      const result = await admin.caller.parents.delete({ id: PARENT_ID });

      expect(result.success).toBe(true);
      // Only CHILD_ID_A should be soft-deleted (orphan)
      expect(admin.mockPrisma.child.update).toHaveBeenCalledTimes(1);
      expect(admin.mockPrisma.child.update).toHaveBeenCalledWith({
        where: { id: CHILD_ID_A },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('should not soft-delete children that have other parents', async () => {
      admin.mockPrisma.registration.count.mockResolvedValue(0);
      admin.mockPrisma.parent.updateMany.mockResolvedValue({ count: 1 });
      admin.mockPrisma.childParent.findMany.mockResolvedValue([
        { childId: CHILD_ID_A },
      ]);
      // Child has 2 parents — not orphan
      admin.mockPrisma.childParent.count
        .mockResolvedValueOnce(2);
      admin.mockPrisma.childParent.deleteMany.mockResolvedValue({ count: 1 });

      await admin.caller.parents.delete({ id: PARENT_ID });

      expect(admin.mockPrisma.child.update).not.toHaveBeenCalled();
    });

    it('should clean childParent links', async () => {
      admin.mockPrisma.registration.count.mockResolvedValue(0);
      admin.mockPrisma.parent.updateMany.mockResolvedValue({ count: 1 });
      admin.mockPrisma.childParent.findMany.mockResolvedValue([]);
      admin.mockPrisma.childParent.deleteMany.mockResolvedValue({ count: 0 });

      await admin.caller.parents.delete({ id: PARENT_ID });

      expect(admin.mockPrisma.childParent.deleteMany).toHaveBeenCalledWith({
        where: { parentId: PARENT_ID },
      });
    });

    it('should check registrations with CONFIRMED status and deletedAt null', async () => {
      admin.mockPrisma.registration.count.mockResolvedValue(0);
      admin.mockPrisma.parent.updateMany.mockResolvedValue({ count: 1 });
      admin.mockPrisma.childParent.findMany.mockResolvedValue([]);
      admin.mockPrisma.childParent.deleteMany.mockResolvedValue({ count: 0 });

      await admin.caller.parents.delete({ id: PARENT_ID });

      expect(admin.mockPrisma.registration.count).toHaveBeenCalledWith({
        where: {
          child: { parentLinks: { some: { parentId: PARENT_ID } } },
          status: 'CONFIRMED',
          deletedAt: null,
        },
      });
    });
  });
});
