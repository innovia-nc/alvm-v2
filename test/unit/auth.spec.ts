import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  createTestCaller,
  ADMIN_USER,
  PARENT_USER,
  STAFF_USER,
} from '../helpers/test-caller';
import type { TestCaller } from '../helpers/test-caller';

// ---------------------------------------------------------------------------
// Mock bcryptjs — must be declared before the router is imported
// ---------------------------------------------------------------------------

const mockCompare = vi.fn<(plain: string, hashed: string) => Promise<boolean>>();
const mockHash = vi.fn<(plain: string, rounds: number) => Promise<string>>();

vi.mock('bcryptjs', () => ({
  compare: (...args: any[]) => mockCompare(...(args as [string, string])),
  hash: (...args: any[]) => mockHash(...(args as [string, number])),
}));

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const USER_ID = ADMIN_USER.id; // a0000000-0000-4000-a000-000000000001

const ACCOUNT_ID = 'd1a00000-0000-4000-a000-000000000010';
const CHILD_ID_1 = 'd1a00000-0000-4000-a000-000000000020';
const CHILD_ID_2 = 'd1a00000-0000-4000-a000-000000000021';

function makeDbUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: 'admin@test.com',
    name: 'Test Admin',
    image: null,
    role: 'ADMIN',
    staffMember: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: ACCOUNT_ID,
    userId: USER_ID,
    provider: 'credentials',
    providerAccountId: '$2a$12$hashedpassword',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('auth router', () => {
  let caller: TestCaller['caller'];
  let mockPrisma: TestCaller['mockPrisma'];

  beforeEach(() => {
    vi.clearAllMocks();
    const ctx = createTestCaller(ADMIN_USER);
    caller = ctx.caller;
    mockPrisma = ctx.mockPrisma;
  });

  // =========================================================================
  // Access control — unauthenticated user
  // =========================================================================

  describe('access control', () => {
    it('should reject unauthenticated calls to me', async () => {
      const { caller: anonCaller } = createTestCaller(null);
      await expect(anonCaller.auth.me()).rejects.toThrow(TRPCError);
      await expect(anonCaller.auth.me()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should reject unauthenticated calls to updateProfile', async () => {
      const { caller: anonCaller } = createTestCaller(null);
      await expect(
        anonCaller.auth.updateProfile({ name: 'New Name' }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('should reject unauthenticated calls to changePassword', async () => {
      const { caller: anonCaller } = createTestCaller(null);
      await expect(
        anonCaller.auth.changePassword({
          currentPassword: 'OldPass1',
          newPassword: 'NewPass1A',
        }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('should reject unauthenticated calls to deleteAccount', async () => {
      const { caller: anonCaller } = createTestCaller(null);
      await expect(
        anonCaller.auth.deleteAccount({ password: 'Pass123' }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  // =========================================================================
  // me
  // =========================================================================

  describe('me', () => {
    it('should return the current user profile', async () => {
      const dbUser = makeDbUser();
      mockPrisma.user.findUnique.mockResolvedValueOnce(dbUser);

      const result = await caller.auth.me();

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: USER_ID },
        include: { staffMember: { select: { userId: true } } },
      });
      expect(result).toEqual({
        id: USER_ID,
        email: 'admin@test.com',
        name: 'Test Admin',
        image: null,
        role: 'ADMIN',
        staffRole: null,
        createdAt: dbUser.createdAt,
      });
    });

    it('should return staffRole ANIMATOR when staffMember exists', async () => {
      const dbUser = makeDbUser({
        role: 'STAFF',
        staffMember: { userId: USER_ID },
      });
      mockPrisma.user.findUnique.mockResolvedValueOnce(dbUser);

      const { caller: staffCaller } = createTestCaller(STAFF_USER);
      // Reuse mockPrisma from the staff caller setup — but we need the mock on the right instance.
      // Instead, just reconfigure the current caller's mock and call with the admin caller
      // (the router only uses ctx.user.id to look up, the DB user determines the role in the output).
      const result = await caller.auth.me();

      expect(result.staffRole).toBe('ANIMATOR');
    });

    it('should throw NOT_FOUND when user does not exist in DB', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(caller.auth.me()).rejects.toThrow(TRPCError);
      await expect(caller.auth.me()).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  // =========================================================================
  // updateProfile
  // =========================================================================

  describe('updateProfile', () => {
    it('should update name successfully', async () => {
      const updatedUser = makeDbUser({ name: 'Updated Name' });
      mockPrisma.user.update.mockResolvedValueOnce(updatedUser);

      const result = await caller.auth.updateProfile({ name: 'Updated Name' });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { name: 'Updated Name' },
        include: { staffMember: { select: { userId: true } } },
      });
      expect(result.name).toBe('Updated Name');
    });

    it('should update image successfully', async () => {
      const updatedUser = makeDbUser({ image: 'https://example.com/pic.jpg' });
      mockPrisma.user.update.mockResolvedValueOnce(updatedUser);

      const result = await caller.auth.updateProfile({
        image: 'https://example.com/pic.jpg',
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { image: 'https://example.com/pic.jpg' },
        include: { staffMember: { select: { userId: true } } },
      });
      expect(result.image).toBe('https://example.com/pic.jpg');
    });

    it('should update both name and image', async () => {
      const updatedUser = makeDbUser({
        name: 'New Name',
        image: 'https://example.com/new.jpg',
      });
      mockPrisma.user.update.mockResolvedValueOnce(updatedUser);

      const result = await caller.auth.updateProfile({
        name: 'New Name',
        image: 'https://example.com/new.jpg',
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { name: 'New Name', image: 'https://example.com/new.jpg' },
        include: { staffMember: { select: { userId: true } } },
      });
      expect(result.name).toBe('New Name');
      expect(result.image).toBe('https://example.com/new.jpg');
    });

    it('should throw BAD_REQUEST when no fields are provided', async () => {
      await expect(caller.auth.updateProfile({})).rejects.toThrow(TRPCError);
      await expect(caller.auth.updateProfile({})).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // changePassword
  // =========================================================================

  describe('changePassword', () => {
    const validInput = {
      currentPassword: 'OldPass1',
      newPassword: 'NewPass1A',
    };

    it('should change password successfully', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(makeAccount());
      mockCompare.mockResolvedValueOnce(true);
      mockHash.mockResolvedValueOnce('hashed-new-password');
      mockPrisma.account.update.mockResolvedValueOnce({});

      const result = await caller.auth.changePassword(validInput);

      expect(mockPrisma.account.findFirst).toHaveBeenCalledWith({
        where: { userId: USER_ID, provider: 'credentials' },
      });
      expect(mockCompare).toHaveBeenCalledWith(
        'OldPass1',
        '$2a$12$hashedpassword',
      );
      expect(mockHash).toHaveBeenCalledWith('NewPass1A', 12);
      expect(mockPrisma.account.update).toHaveBeenCalledWith({
        where: { id: ACCOUNT_ID },
        data: { providerAccountId: 'hashed-new-password' },
      });
      expect(result).toEqual({ success: true });
    });

    it('should throw NOT_FOUND when no credentials account exists', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      await expect(
        caller.auth.changePassword(validInput),
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.auth.changePassword(validInput),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('should throw UNAUTHORIZED when current password is wrong', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(makeAccount());
      mockCompare.mockResolvedValueOnce(false);

      const err = await caller.auth
        .changePassword(validInput)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(TRPCError);
      expect(err).toMatchObject({ code: 'UNAUTHORIZED' });
      expect(mockHash).not.toHaveBeenCalled();
    });

    it('should reject new password without uppercase', async () => {
      await expect(
        caller.auth.changePassword({
          currentPassword: 'OldPass1',
          newPassword: 'newpass1a',
        }),
      ).rejects.toThrow();
    });

    it('should reject new password without digit', async () => {
      await expect(
        caller.auth.changePassword({
          currentPassword: 'OldPass1',
          newPassword: 'NewPassAA',
        }),
      ).rejects.toThrow();
    });

    it('should reject new password shorter than 8 characters', async () => {
      await expect(
        caller.auth.changePassword({
          currentPassword: 'OldPass1',
          newPassword: 'Np1aaaa',
        }),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // deleteAccount
  // =========================================================================

  describe('deleteAccount', () => {
    const validInput = { password: 'MyPass1' };

    function setupDeleteSuccess() {
      mockPrisma.account.findFirst.mockResolvedValueOnce(makeAccount());
      mockCompare.mockResolvedValueOnce(true);
      mockPrisma.registration.count.mockResolvedValueOnce(0);
      // Transaction delegates — these are called via the same mockPrisma
      mockPrisma.parent.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.staffMember.updateMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.childParent.findMany.mockResolvedValueOnce([]);
      mockPrisma.childParent.deleteMany.mockResolvedValueOnce({ count: 0 });
    }

    it('should delete account successfully with no children', async () => {
      setupDeleteSuccess();

      const result = await caller.auth.deleteAccount(validInput);

      expect(mockPrisma.account.findFirst).toHaveBeenCalledWith({
        where: { userId: USER_ID, provider: 'credentials' },
      });
      expect(mockCompare).toHaveBeenCalledWith(
        'MyPass1',
        '$2a$12$hashedpassword',
      );
      expect(mockPrisma.registration.count).toHaveBeenCalledWith({
        where: {
          child: {
            parentLinks: { some: { parentId: USER_ID } },
          },
          status: 'CONFIRMED',
          deletedAt: null,
        },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.parent.updateMany).toHaveBeenCalled();
      expect(mockPrisma.staffMember.updateMany).toHaveBeenCalled();
      expect(mockPrisma.childParent.deleteMany).toHaveBeenCalledWith({
        where: { parentId: USER_ID },
      });
      expect(result).toEqual({ success: true });
    });

    it('should throw NOT_FOUND when no credentials account exists', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      await expect(
        caller.auth.deleteAccount(validInput),
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.auth.deleteAccount(validInput),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('should throw UNAUTHORIZED when password is wrong', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(makeAccount());
      mockCompare.mockResolvedValueOnce(false);

      const err = await caller.auth
        .deleteAccount(validInput)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(TRPCError);
      expect(err).toMatchObject({ code: 'UNAUTHORIZED' });
      expect(mockPrisma.registration.count).not.toHaveBeenCalled();
    });

    it('should throw PRECONDITION_FAILED when active registrations exist', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(makeAccount());
      mockCompare.mockResolvedValueOnce(true);
      mockPrisma.registration.count.mockResolvedValueOnce(2);

      const err = await caller.auth
        .deleteAccount(validInput)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(TRPCError);
      expect(err).toMatchObject({ code: 'PRECONDITION_FAILED' });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should soft-delete children when parent is sole parent', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(makeAccount());
      mockCompare.mockResolvedValueOnce(true);
      mockPrisma.registration.count.mockResolvedValueOnce(0);
      mockPrisma.parent.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.staffMember.updateMany.mockResolvedValueOnce({ count: 0 });

      // Two children — first has only this parent, second has two parents
      mockPrisma.childParent.findMany.mockResolvedValueOnce([
        { childId: CHILD_ID_1 },
        { childId: CHILD_ID_2 },
      ]);
      // parentCount for child 1 = 1 (sole parent)
      mockPrisma.childParent.count.mockResolvedValueOnce(1);
      // parentCount for child 2 = 2 (another parent exists)
      mockPrisma.childParent.count.mockResolvedValueOnce(2);
      mockPrisma.child.update.mockResolvedValueOnce({});
      mockPrisma.childParent.deleteMany.mockResolvedValueOnce({ count: 2 });

      const result = await caller.auth.deleteAccount(validInput);

      expect(result).toEqual({ success: true });

      // Child 1 should be soft-deleted (sole parent)
      expect(mockPrisma.child.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.child.update).toHaveBeenCalledWith({
        where: { id: CHILD_ID_1 },
        data: { deletedAt: expect.any(Date) },
      });

      // childParent links should be removed
      expect(mockPrisma.childParent.deleteMany).toHaveBeenCalledWith({
        where: { parentId: USER_ID },
      });
    });

    it('should not soft-delete children when another parent exists', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(makeAccount());
      mockCompare.mockResolvedValueOnce(true);
      mockPrisma.registration.count.mockResolvedValueOnce(0);
      mockPrisma.parent.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.staffMember.updateMany.mockResolvedValueOnce({ count: 0 });

      // One child with two parents
      mockPrisma.childParent.findMany.mockResolvedValueOnce([
        { childId: CHILD_ID_1 },
      ]);
      mockPrisma.childParent.count.mockResolvedValueOnce(2);
      mockPrisma.childParent.deleteMany.mockResolvedValueOnce({ count: 1 });

      await caller.auth.deleteAccount(validInput);

      // child.update should NOT have been called — the child has another parent
      expect(mockPrisma.child.update).not.toHaveBeenCalled();
    });

    it('should work for a parent user', async () => {
      const { caller: parentCaller, mockPrisma: parentMock } =
        createTestCaller(PARENT_USER);

      parentMock.account.findFirst.mockResolvedValueOnce(
        makeAccount({ userId: PARENT_USER.id }),
      );
      mockCompare.mockResolvedValueOnce(true);
      parentMock.registration.count.mockResolvedValueOnce(0);
      parentMock.parent.updateMany.mockResolvedValueOnce({ count: 1 });
      parentMock.staffMember.updateMany.mockResolvedValueOnce({ count: 0 });
      parentMock.childParent.findMany.mockResolvedValueOnce([]);
      parentMock.childParent.deleteMany.mockResolvedValueOnce({ count: 0 });

      const result = await parentCaller.auth.deleteAccount(validInput);
      expect(result).toEqual({ success: true });
    });
  });
});
