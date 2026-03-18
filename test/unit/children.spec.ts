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

const CHILD_ID = 'b0000000-0000-4000-a000-000000000001';
const CHILD_ID_2 = 'b0000000-0000-4000-a000-000000000002';
const PARENT_ID_A = 'b0000000-0000-4000-a000-000000000010';
const PARENT_ID_B = 'b0000000-0000-4000-a000-000000000011';
const PARENT_ID_C = 'b0000000-0000-4000-a000-000000000012';
const PARENT_ID_D = 'b0000000-0000-4000-a000-000000000013';
const LINK_ID_A = 'b0000000-0000-4000-a000-000000000020';
const LINK_ID_B = 'b0000000-0000-4000-a000-000000000021';

const now = new Date('2025-06-15T10:00:00Z');

function makeChild(overrides: Record<string, unknown> = {}) {
  return {
    id: CHILD_ID,
    firstName: 'Lucas',
    lastName: 'Dupont',
    birthDate: new Date('2018-05-15'),
    gender: 'MALE',
    ecole: 'Ecole du Centre',
    medicalInfo: {
      allergies: [],
      medications: [],
      conditions: [],
      diet_restrictions: [],
      notes: '',
    },
    emergencyContactName: 'Marie Dupont',
    emergencyContactPhone: '0612345678',
    emergencyContactRelation: 'mother',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    parentLinks: [],
    ...overrides,
  };
}

function makeParentLink(overrides: Record<string, unknown> = {}) {
  return {
    id: LINK_ID_A,
    childId: CHILD_ID,
    parentId: PARENT_ID_A,
    isPrimary: true,
    relationship: 'mother',
    createdAt: now,
    parent: {
      firstName: 'Marie',
      lastName: 'Dupont',
      email: 'marie@test.com',
      phone: '0612345678',
    },
    ...overrides,
  };
}

function makeParentRecord(overrides: Record<string, unknown> = {}) {
  return {
    userId: PARENT_ID_A,
    firstName: 'Marie',
    lastName: 'Dupont',
    email: 'marie@test.com',
    phone: '0612345678',
    deletedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('children router', () => {
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
    it('should deny unauthenticated access', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.children.list({})).rejects.toThrow(TRPCError);
    });

    it('should return children for ADMIN (sees all)', async () => {
      const childWithLinks = makeChild({
        parentLinks: [makeParentLink()],
      });
      admin.mockPrisma.child.findMany.mockResolvedValue([childWithLinks]);
      admin.mockPrisma.child.count.mockResolvedValue(1);

      const result = await admin.caller.children.list({});

      expect(result.children).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.children[0].firstName).toBe('Lucas');
      expect(result.children[0].parents).toHaveLength(1);
      expect(result.children[0].parents[0].firstName).toBe('Marie');
    });

    it('should return children for STAFF (sees all)', async () => {
      staff.mockPrisma.child.findMany.mockResolvedValue([
        makeChild({ parentLinks: [makeParentLink()] }),
      ]);
      staff.mockPrisma.child.count.mockResolvedValue(1);

      const result = await staff.caller.children.list({});
      expect(result.children).toHaveLength(1);
    });

    it('should filter by parentId for PARENT role (sees only own children)', async () => {
      parent.mockPrisma.child.findMany.mockResolvedValue([
        makeChild({ parentLinks: [makeParentLink({ parentId: PARENT_USER.id })] }),
      ]);
      parent.mockPrisma.child.count.mockResolvedValue(1);

      const result = await parent.caller.children.list({});

      expect(result.children).toHaveLength(1);
      // Verify the where clause includes the parentLinks filter
      const findManyCall = parent.mockPrisma.child.findMany.mock.calls[0][0];
      expect(findManyCall.where.parentLinks).toEqual({
        some: { parentId: PARENT_USER.id },
      });
    });

    it('should allow staff to filter by parentId', async () => {
      staff.mockPrisma.child.findMany.mockResolvedValue([]);
      staff.mockPrisma.child.count.mockResolvedValue(0);

      await staff.caller.children.list({ parentId: PARENT_ID_A });

      const findManyCall = staff.mockPrisma.child.findMany.mock.calls[0][0];
      expect(findManyCall.where.parentLinks).toEqual({
        some: { parentId: PARENT_ID_A },
      });
    });

    it('should not add parentLinks filter for ADMIN without parentId', async () => {
      admin.mockPrisma.child.findMany.mockResolvedValue([]);
      admin.mockPrisma.child.count.mockResolvedValue(0);

      await admin.caller.children.list({});

      const findManyCall = admin.mockPrisma.child.findMany.mock.calls[0][0];
      expect(findManyCall.where.parentLinks).toBeUndefined();
    });

    it('should support search filter', async () => {
      admin.mockPrisma.child.findMany.mockResolvedValue([]);
      admin.mockPrisma.child.count.mockResolvedValue(0);

      await admin.caller.children.list({ search: 'Dupont' });

      const findManyCall = admin.mockPrisma.child.findMany.mock.calls[0][0];
      expect(findManyCall.where.OR).toBeDefined();
      expect(findManyCall.where.OR).toHaveLength(3);
    });

    it('should support pagination', async () => {
      admin.mockPrisma.child.findMany.mockResolvedValue([]);
      admin.mockPrisma.child.count.mockResolvedValue(50);

      const result = await admin.caller.children.list({ limit: 10, offset: 20 });

      expect(result.total).toBe(50);
      const findManyCall = admin.mockPrisma.child.findMany.mock.calls[0][0];
      expect(findManyCall.take).toBe(10);
      expect(findManyCall.skip).toBe(20);
    });

    it('should support sorting', async () => {
      admin.mockPrisma.child.findMany.mockResolvedValue([]);
      admin.mockPrisma.child.count.mockResolvedValue(0);

      await admin.caller.children.list({ sortBy: 'birthDate', sortOrder: 'desc' });

      const findManyCall = admin.mockPrisma.child.findMany.mock.calls[0][0];
      expect(findManyCall.orderBy).toEqual({ birthDate: 'desc' });
    });

    it('should use default sort (lastName asc)', async () => {
      admin.mockPrisma.child.findMany.mockResolvedValue([]);
      admin.mockPrisma.child.count.mockResolvedValue(0);

      await admin.caller.children.list({});

      const findManyCall = admin.mockPrisma.child.findMany.mock.calls[0][0];
      expect(findManyCall.orderBy).toEqual({ lastName: 'asc' });
    });

    it('should default medicalInfo when null', async () => {
      admin.mockPrisma.child.findMany.mockResolvedValue([
        makeChild({ medicalInfo: null, parentLinks: [makeParentLink()] }),
      ]);
      admin.mockPrisma.child.count.mockResolvedValue(1);

      const result = await admin.caller.children.list({});

      expect(result.children[0].medicalInfo).toEqual({
        allergies: [],
        medications: [],
        conditions: [],
        diet_restrictions: [],
        notes: '',
      });
    });

    it('should return empty list when no children match', async () => {
      admin.mockPrisma.child.findMany.mockResolvedValue([]);
      admin.mockPrisma.child.count.mockResolvedValue(0);

      const result = await admin.caller.children.list({});

      expect(result.children).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should map parentLinks to parents array correctly', async () => {
      const childWithLinks = makeChild({
        parentLinks: [
          makeParentLink(),
          makeParentLink({
            id: LINK_ID_B,
            parentId: PARENT_ID_B,
            isPrimary: false,
            relationship: 'father',
            parent: {
              firstName: 'Jean',
              lastName: 'Dupont',
              email: 'jean@test.com',
              phone: '0698765432',
            },
          }),
        ],
      });
      admin.mockPrisma.child.findMany.mockResolvedValue([childWithLinks]);
      admin.mockPrisma.child.count.mockResolvedValue(1);

      const result = await admin.caller.children.list({});

      expect(result.children[0].parents).toHaveLength(2);
      expect(result.children[0].parents[0].parentId).toBe(PARENT_ID_A);
      expect(result.children[0].parents[0].isPrimary).toBe(true);
      expect(result.children[0].parents[1].parentId).toBe(PARENT_ID_B);
      expect(result.children[0].parents[1].isPrimary).toBe(false);
      expect(result.children[0].parents[1].relationship).toBe('father');
    });
  });

  // =========================================================================
  // getById
  // =========================================================================

  describe('getById', () => {
    it('should deny unauthenticated access', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.children.getById({ id: CHILD_ID })).rejects.toThrow(TRPCError);
    });

    it('should return child for ADMIN', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(
        makeChild({ parentLinks: [makeParentLink()] }),
      );

      const result = await admin.caller.children.getById({ id: CHILD_ID });

      expect(result).not.toBeNull();
      expect(result!.id).toBe(CHILD_ID);
      expect(result!.parents).toHaveLength(1);
    });

    it('should return child for PARENT with access', async () => {
      parent.mockPrisma.child.findFirst.mockResolvedValue(
        makeChild({ parentLinks: [makeParentLink({ parentId: PARENT_USER.id })] }),
      );

      const result = await parent.caller.children.getById({ id: CHILD_ID });

      expect(result).not.toBeNull();
      // Verify parentLinks filter is included in the where clause
      const findFirstCall = parent.mockPrisma.child.findFirst.mock.calls[0][0];
      expect(findFirstCall.where.parentLinks).toEqual({
        some: { parentId: PARENT_USER.id },
      });
    });

    it('should return null for non-existent child', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(null);

      const result = await admin.caller.children.getById({ id: CHILD_ID });

      expect(result).toBeNull();
    });

    it('should return null for PARENT without access', async () => {
      parent.mockPrisma.child.findFirst.mockResolvedValue(null);

      const result = await parent.caller.children.getById({ id: CHILD_ID });

      expect(result).toBeNull();
    });

    it('should include deletedAt: null in the where clause', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(null);

      await admin.caller.children.getById({ id: CHILD_ID });

      const findFirstCall = admin.mockPrisma.child.findFirst.mock.calls[0][0];
      expect(findFirstCall.where.deletedAt).toBeNull();
    });

    it('should include parentInclude in the query', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(
        makeChild({ parentLinks: [makeParentLink()] }),
      );

      await admin.caller.children.getById({ id: CHILD_ID });

      const findFirstCall = admin.mockPrisma.child.findFirst.mock.calls[0][0];
      expect(findFirstCall.include.parentLinks).toBeDefined();
      expect(findFirstCall.include.parentLinks.include.parent).toBeDefined();
    });
  });

  // =========================================================================
  // create
  // =========================================================================

  describe('create', () => {
    const validInput = {
      firstName: 'Lucas',
      lastName: 'Dupont',
      birthDate: '2018-05-15T00:00:00.000Z',
      gender: 'MALE' as const,
      ecole: 'Ecole du Centre',
      emergencyContactName: 'Marie Dupont',
      emergencyContactPhone: '0612345678',
      emergencyContactRelation: 'mother',
      parents: [
        { parentId: PARENT_ID_A, isPrimary: true, relationship: 'mother' as const },
      ],
    };

    it('should deny PARENT from creating children', async () => {
      await expect(parent.caller.children.create(validInput)).rejects.toThrow(TRPCError);
    });

    it('should deny unauthenticated users', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.children.create(validInput)).rejects.toThrow(TRPCError);
    });

    it('should create a child with one parent (ADMIN)', async () => {
      admin.mockPrisma.parent.findFirst.mockResolvedValue(makeParentRecord());
      admin.mockPrisma.child.create.mockResolvedValue(makeChild());
      admin.mockPrisma.childParent.create.mockResolvedValue(makeParentLink());
      admin.mockPrisma.child.findUniqueOrThrow.mockResolvedValue(
        makeChild({ parentLinks: [makeParentLink()] }),
      );

      const result = await admin.caller.children.create(validInput);

      expect(result.firstName).toBe('Lucas');
      expect(result.parents).toHaveLength(1);
      expect(result.parents[0].isPrimary).toBe(true);
    });

    it('should create a child with multiple parents', async () => {
      const inputMultiParent = {
        ...validInput,
        parents: [
          { parentId: PARENT_ID_A, isPrimary: true, relationship: 'mother' as const },
          { parentId: PARENT_ID_B, isPrimary: false, relationship: 'father' as const },
        ],
      };

      admin.mockPrisma.parent.findFirst
        .mockResolvedValueOnce(makeParentRecord({ userId: PARENT_ID_A }))
        .mockResolvedValueOnce(makeParentRecord({ userId: PARENT_ID_B }));
      admin.mockPrisma.child.create.mockResolvedValue(makeChild());
      admin.mockPrisma.childParent.create.mockResolvedValue(makeParentLink());
      admin.mockPrisma.child.findUniqueOrThrow.mockResolvedValue(
        makeChild({
          parentLinks: [
            makeParentLink(),
            makeParentLink({
              id: LINK_ID_B,
              parentId: PARENT_ID_B,
              isPrimary: false,
              relationship: 'father',
              parent: {
                firstName: 'Jean',
                lastName: 'Dupont',
                email: 'jean@test.com',
                phone: '0698765432',
              },
            }),
          ],
        }),
      );

      const result = await admin.caller.children.create(inputMultiParent);

      expect(result.parents).toHaveLength(2);
    });

    it('should allow STAFF to create children', async () => {
      staff.mockPrisma.parent.findFirst.mockResolvedValue(makeParentRecord());
      staff.mockPrisma.child.create.mockResolvedValue(makeChild());
      staff.mockPrisma.childParent.create.mockResolvedValue(makeParentLink());
      staff.mockPrisma.child.findUniqueOrThrow.mockResolvedValue(
        makeChild({ parentLinks: [makeParentLink()] }),
      );

      const result = await staff.caller.children.create(validInput);

      expect(result.firstName).toBe('Lucas');
    });

    it('should throw NOT_FOUND when parent does not exist', async () => {
      admin.mockPrisma.parent.findFirst.mockResolvedValue(null);

      await expect(admin.caller.children.create(validInput)).rejects.toThrow(
        `Parent ${PARENT_ID_A} non trouvé`,
      );
    });

    it('should reject input with no parents', async () => {
      const inputNoParent = { ...validInput, parents: [] };

      await expect(admin.caller.children.create(inputNoParent as any)).rejects.toThrow();
    });

    it('should reject input with more than 3 parents', async () => {
      const inputTooMany = {
        ...validInput,
        parents: [
          { parentId: PARENT_ID_A, isPrimary: true },
          { parentId: PARENT_ID_B, isPrimary: false },
          { parentId: PARENT_ID_C, isPrimary: false },
          { parentId: PARENT_ID_D, isPrimary: false },
        ],
      };

      await expect(admin.caller.children.create(inputTooMany)).rejects.toThrow();
    });

    it('should reject input with no primary parent', async () => {
      const inputNoPrimary = {
        ...validInput,
        parents: [
          { parentId: PARENT_ID_A, isPrimary: false },
        ],
      };

      await expect(admin.caller.children.create(inputNoPrimary)).rejects.toThrow();
    });

    it('should reject input with multiple primary parents', async () => {
      const inputMultiplePrimary = {
        ...validInput,
        parents: [
          { parentId: PARENT_ID_A, isPrimary: true },
          { parentId: PARENT_ID_B, isPrimary: true },
        ],
      };

      await expect(admin.caller.children.create(inputMultiplePrimary)).rejects.toThrow();
    });

    it('should use $transaction for creating child and parent links', async () => {
      admin.mockPrisma.parent.findFirst.mockResolvedValue(makeParentRecord());
      admin.mockPrisma.child.create.mockResolvedValue(makeChild());
      admin.mockPrisma.childParent.create.mockResolvedValue(makeParentLink());
      admin.mockPrisma.child.findUniqueOrThrow.mockResolvedValue(
        makeChild({ parentLinks: [makeParentLink()] }),
      );

      await admin.caller.children.create(validInput);

      expect(admin.mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      // $transaction is called with a callback function
      expect(typeof admin.mockPrisma.$transaction.mock.calls[0][0]).toBe('function');
    });

    it('should convert birthDate string to Date in the create call', async () => {
      admin.mockPrisma.parent.findFirst.mockResolvedValue(makeParentRecord());
      admin.mockPrisma.child.create.mockResolvedValue(makeChild());
      admin.mockPrisma.childParent.create.mockResolvedValue(makeParentLink());
      admin.mockPrisma.child.findUniqueOrThrow.mockResolvedValue(
        makeChild({ parentLinks: [makeParentLink()] }),
      );

      await admin.caller.children.create(validInput);

      const createCall = admin.mockPrisma.child.create.mock.calls[0][0];
      expect(createCall.data.birthDate).toBeInstanceOf(Date);
    });

    it('should set ecole to null when not provided', async () => {
      const inputNoEcole = { ...validInput, ecole: undefined };
      admin.mockPrisma.parent.findFirst.mockResolvedValue(makeParentRecord());
      admin.mockPrisma.child.create.mockResolvedValue(makeChild({ ecole: null }));
      admin.mockPrisma.childParent.create.mockResolvedValue(makeParentLink());
      admin.mockPrisma.child.findUniqueOrThrow.mockResolvedValue(
        makeChild({ ecole: null, parentLinks: [makeParentLink()] }),
      );

      await admin.caller.children.create(inputNoEcole);

      const createCall = admin.mockPrisma.child.create.mock.calls[0][0];
      expect(createCall.data.ecole).toBeNull();
    });

    it('should verify each parent exists before creating', async () => {
      const inputTwoParents = {
        ...validInput,
        parents: [
          { parentId: PARENT_ID_A, isPrimary: true, relationship: 'mother' as const },
          { parentId: PARENT_ID_B, isPrimary: false, relationship: 'father' as const },
        ],
      };

      admin.mockPrisma.parent.findFirst
        .mockResolvedValueOnce(makeParentRecord({ userId: PARENT_ID_A }))
        .mockResolvedValueOnce(null); // Second parent doesn't exist

      await expect(admin.caller.children.create(inputTwoParents)).rejects.toThrow(
        `Parent ${PARENT_ID_B} non trouvé`,
      );
    });
  });

  // =========================================================================
  // update
  // =========================================================================

  describe('update', () => {
    it('should deny PARENT from updating children', async () => {
      await expect(
        parent.caller.children.update({ id: CHILD_ID, firstName: 'Updated' }),
      ).rejects.toThrow(TRPCError);
    });

    it('should deny unauthenticated access', async () => {
      const { caller } = createTestCaller(null);
      await expect(
        caller.children.update({ id: CHILD_ID, firstName: 'Updated' }),
      ).rejects.toThrow(TRPCError);
    });

    it('should update child fields', async () => {
      const updated = makeChild({
        firstName: 'Updated',
        parentLinks: [makeParentLink()],
      });
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChild());
      admin.mockPrisma.child.update.mockResolvedValue(updated);

      const result = await admin.caller.children.update({
        id: CHILD_ID,
        firstName: 'Updated',
      });

      expect(result.firstName).toBe('Updated');
    });

    it('should throw NOT_FOUND for non-existent child', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(null);

      await expect(
        admin.caller.children.update({ id: CHILD_ID, firstName: 'Xx' }),
      ).rejects.toThrow('Enfant non trouvé ou accès refusé');
    });

    it('should throw BAD_REQUEST when no updates provided', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChild());

      await expect(
        admin.caller.children.update({ id: CHILD_ID }),
      ).rejects.toThrow('Aucune modification fournie');
    });

    it('should update multiple fields at once', async () => {
      const updated = makeChild({
        firstName: 'NewFirst',
        lastName: 'NewLast',
        ecole: 'New School',
        parentLinks: [makeParentLink()],
      });
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChild());
      admin.mockPrisma.child.update.mockResolvedValue(updated);

      const result = await admin.caller.children.update({
        id: CHILD_ID,
        firstName: 'NewFirst',
        lastName: 'NewLast',
        ecole: 'New School',
      });

      expect(result.firstName).toBe('NewFirst');
      expect(result.lastName).toBe('NewLast');
      expect(result.ecole).toBe('New School');
    });

    it('should allow setting ecole to null', async () => {
      const updated = makeChild({ ecole: null, parentLinks: [makeParentLink()] });
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChild());
      admin.mockPrisma.child.update.mockResolvedValue(updated);

      const result = await admin.caller.children.update({
        id: CHILD_ID,
        ecole: null,
      });

      expect(result.ecole).toBeNull();
    });

    it('should allow STAFF to update children', async () => {
      const updated = makeChild({ firstName: 'StaffEdit', parentLinks: [makeParentLink()] });
      staff.mockPrisma.child.findFirst.mockResolvedValue(makeChild());
      staff.mockPrisma.child.update.mockResolvedValue(updated);

      const result = await staff.caller.children.update({
        id: CHILD_ID,
        firstName: 'StaffEdit',
      });

      expect(result.firstName).toBe('StaffEdit');
    });

    it('should convert birthDate string to Date in the update data', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChild());
      admin.mockPrisma.child.update.mockResolvedValue(
        makeChild({ birthDate: new Date('2019-01-01'), parentLinks: [makeParentLink()] }),
      );

      await admin.caller.children.update({
        id: CHILD_ID,
        birthDate: '2019-01-01T00:00:00.000Z',
      });

      const updateCall = admin.mockPrisma.child.update.mock.calls[0][0];
      expect(updateCall.data.birthDate).toBeInstanceOf(Date);
    });

    it('should update medicalInfo', async () => {
      const newMedical = {
        allergies: ['peanuts'],
        medications: [],
        conditions: ['asthma'],
        diet_restrictions: [],
        notes: 'Attention aux arachides',
      };
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChild());
      admin.mockPrisma.child.update.mockResolvedValue(
        makeChild({ medicalInfo: newMedical, parentLinks: [makeParentLink()] }),
      );

      const result = await admin.caller.children.update({
        id: CHILD_ID,
        medicalInfo: newMedical,
      });

      expect(result.medicalInfo.allergies).toEqual(['peanuts']);
      expect(result.medicalInfo.conditions).toEqual(['asthma']);
    });
  });

  // =========================================================================
  // delete
  // =========================================================================

  describe('delete', () => {
    it('should deny PARENT from deleting children', async () => {
      await expect(
        parent.caller.children.delete({ id: CHILD_ID }),
      ).rejects.toThrow(TRPCError);
    });

    it('should deny unauthenticated access', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.children.delete({ id: CHILD_ID })).rejects.toThrow(TRPCError);
    });

    it('should soft-delete a child without active registrations', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChild());
      admin.mockPrisma.registration.count.mockResolvedValue(0);
      admin.mockPrisma.child.update.mockResolvedValue(
        makeChild({ deletedAt: new Date() }),
      );

      const result = await admin.caller.children.delete({ id: CHILD_ID });

      expect(result.success).toBe(true);
      expect(admin.mockPrisma.child.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CHILD_ID },
          data: { deletedAt: expect.any(Date) },
        }),
      );
    });

    it('should throw NOT_FOUND for non-existent child', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(null);

      await expect(
        admin.caller.children.delete({ id: CHILD_ID }),
      ).rejects.toThrow('Enfant non trouvé ou accès refusé');
    });

    it('should block deletion when active registrations exist', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChild());
      admin.mockPrisma.registration.count.mockResolvedValue(2);

      await expect(
        admin.caller.children.delete({ id: CHILD_ID }),
      ).rejects.toThrow('Impossible de supprimer cet enfant : des inscriptions actives existent');
    });

    it('should check for CONFIRMED registrations only', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChild());
      admin.mockPrisma.registration.count.mockResolvedValue(0);
      admin.mockPrisma.child.update.mockResolvedValue(
        makeChild({ deletedAt: new Date() }),
      );

      await admin.caller.children.delete({ id: CHILD_ID });

      const countCall = admin.mockPrisma.registration.count.mock.calls[0][0];
      expect(countCall.where.status).toBe('CONFIRMED');
      expect(countCall.where.deletedAt).toBeNull();
    });

    it('should allow STAFF to delete children', async () => {
      staff.mockPrisma.child.findFirst.mockResolvedValue(makeChild());
      staff.mockPrisma.registration.count.mockResolvedValue(0);
      staff.mockPrisma.child.update.mockResolvedValue(
        makeChild({ deletedAt: new Date() }),
      );

      const result = await staff.caller.children.delete({ id: CHILD_ID });

      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // getParents
  // =========================================================================

  describe('getParents', () => {
    it('should deny unauthenticated access', async () => {
      const { caller } = createTestCaller(null);
      await expect(
        caller.children.getParents({ childId: CHILD_ID }),
      ).rejects.toThrow(TRPCError);
    });

    it('should return parents for ADMIN', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChild());
      admin.mockPrisma.childParent.findMany.mockResolvedValue([
        makeParentLink(),
        makeParentLink({
          id: LINK_ID_B,
          parentId: PARENT_ID_B,
          isPrimary: false,
          relationship: 'father',
          parent: {
            firstName: 'Jean',
            lastName: 'Dupont',
            email: 'jean@test.com',
            phone: '0698765432',
          },
        }),
      ]);

      const result = await admin.caller.children.getParents({ childId: CHILD_ID });

      expect(result).toHaveLength(2);
      expect(result[0].isPrimary).toBe(true);
      expect(result[0].firstName).toBe('Marie');
      expect(result[1].firstName).toBe('Jean');
    });

    it('should allow PARENT to see parents of their own child', async () => {
      parent.mockPrisma.child.findFirst.mockResolvedValue(makeChild());
      parent.mockPrisma.childParent.findMany.mockResolvedValue([makeParentLink()]);

      const result = await parent.caller.children.getParents({ childId: CHILD_ID });

      expect(result).toHaveLength(1);
      // Verify access check was called with parentLinks filter
      const findFirstCall = parent.mockPrisma.child.findFirst.mock.calls[0][0];
      expect(findFirstCall.where.parentLinks).toEqual({
        some: { parentId: PARENT_USER.id },
      });
    });

    it('should throw NOT_FOUND when child does not exist', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(null);

      await expect(
        admin.caller.children.getParents({ childId: CHILD_ID }),
      ).rejects.toThrow('Enfant non trouvé ou accès refusé');
    });

    it('should throw NOT_FOUND when PARENT has no access to child', async () => {
      parent.mockPrisma.child.findFirst.mockResolvedValue(null);

      await expect(
        parent.caller.children.getParents({ childId: CHILD_ID }),
      ).rejects.toThrow('Enfant non trouvé ou accès refusé');
    });

    it('should return relationship field for each parent', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChild());
      admin.mockPrisma.childParent.findMany.mockResolvedValue([
        makeParentLink({ relationship: 'guardian' }),
      ]);

      const result = await admin.caller.children.getParents({ childId: CHILD_ID });

      expect(result[0].relationship).toBe('guardian');
    });

    it('should return null relationship when not set', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChild());
      admin.mockPrisma.childParent.findMany.mockResolvedValue([
        makeParentLink({ relationship: null }),
      ]);

      const result = await admin.caller.children.getParents({ childId: CHILD_ID });

      expect(result[0].relationship).toBeNull();
    });
  });

  // =========================================================================
  // addParent
  // =========================================================================

  describe('addParent', () => {
    it('should deny PARENT from adding parents', async () => {
      await expect(
        parent.caller.children.addParent({
          childId: CHILD_ID,
          parentId: PARENT_ID_B,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it('should deny unauthenticated access', async () => {
      const { caller } = createTestCaller(null);
      await expect(
        caller.children.addParent({
          childId: CHILD_ID,
          parentId: PARENT_ID_B,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it('should add a parent to a child', async () => {
      const parentRecord = makeParentRecord({
        userId: PARENT_ID_B,
        firstName: 'Jean',
        email: 'jean@test.com',
      });
      const newLink = makeParentLink({
        id: LINK_ID_B,
        parentId: PARENT_ID_B,
        isPrimary: false,
        relationship: 'father',
      });

      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChild());
      admin.mockPrisma.parent.findFirst.mockResolvedValue(parentRecord);
      admin.mockPrisma.childParent.count.mockResolvedValue(1);
      admin.mockPrisma.childParent.findUnique.mockResolvedValue(null);
      admin.mockPrisma.childParent.create.mockResolvedValue(newLink);

      const result = await admin.caller.children.addParent({
        childId: CHILD_ID,
        parentId: PARENT_ID_B,
        isPrimary: false,
        relationship: 'father',
      });

      expect(result.parentId).toBe(PARENT_ID_B);
      expect(result.firstName).toBe('Jean');
      expect(result.isPrimary).toBe(false);
    });

    it('should throw NOT_FOUND when child does not exist', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(null);

      await expect(
        admin.caller.children.addParent({
          childId: CHILD_ID,
          parentId: PARENT_ID_B,
        }),
      ).rejects.toThrow('Enfant non trouvé');
    });

    it('should throw NOT_FOUND when parent does not exist', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChild());
      admin.mockPrisma.parent.findFirst.mockResolvedValue(null);

      await expect(
        admin.caller.children.addParent({
          childId: CHILD_ID,
          parentId: PARENT_ID_B,
        }),
      ).rejects.toThrow('Parent non trouvé');
    });

    it('should throw PRECONDITION_FAILED when child already has 3 parents', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChild());
      admin.mockPrisma.parent.findFirst.mockResolvedValue(makeParentRecord({ userId: PARENT_ID_D }));
      admin.mockPrisma.childParent.count.mockResolvedValue(3);

      await expect(
        admin.caller.children.addParent({
          childId: CHILD_ID,
          parentId: PARENT_ID_D,
        }),
      ).rejects.toThrow('Un enfant ne peut avoir plus de 3 parents associés');
    });

    it('should throw CONFLICT when parent is already linked', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChild());
      admin.mockPrisma.parent.findFirst.mockResolvedValue(makeParentRecord());
      admin.mockPrisma.childParent.count.mockResolvedValue(1);
      admin.mockPrisma.childParent.findUnique.mockResolvedValue(makeParentLink());

      await expect(
        admin.caller.children.addParent({
          childId: CHILD_ID,
          parentId: PARENT_ID_A,
        }),
      ).rejects.toThrow('Ce parent est déjà associé à cet enfant');
    });

    it('should allow STAFF to add a parent', async () => {
      staff.mockPrisma.child.findFirst.mockResolvedValue(makeChild());
      staff.mockPrisma.parent.findFirst.mockResolvedValue(makeParentRecord({ userId: PARENT_ID_B }));
      staff.mockPrisma.childParent.count.mockResolvedValue(1);
      staff.mockPrisma.childParent.findUnique.mockResolvedValue(null);
      staff.mockPrisma.childParent.create.mockResolvedValue(
        makeParentLink({ id: LINK_ID_B, parentId: PARENT_ID_B, isPrimary: false }),
      );

      const result = await staff.caller.children.addParent({
        childId: CHILD_ID,
        parentId: PARENT_ID_B,
      });

      expect(result.parentId).toBe(PARENT_ID_B);
    });

    it('should default isPrimary to false', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChild());
      admin.mockPrisma.parent.findFirst.mockResolvedValue(makeParentRecord({ userId: PARENT_ID_B }));
      admin.mockPrisma.childParent.count.mockResolvedValue(1);
      admin.mockPrisma.childParent.findUnique.mockResolvedValue(null);
      admin.mockPrisma.childParent.create.mockResolvedValue(
        makeParentLink({ id: LINK_ID_B, parentId: PARENT_ID_B, isPrimary: false }),
      );

      await admin.caller.children.addParent({
        childId: CHILD_ID,
        parentId: PARENT_ID_B,
        // isPrimary not provided -- should default to false
      });

      const createCall = admin.mockPrisma.childParent.create.mock.calls[0][0];
      expect(createCall.data.isPrimary).toBe(false);
    });

    it('should set relationship to null when not provided', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChild());
      admin.mockPrisma.parent.findFirst.mockResolvedValue(makeParentRecord({ userId: PARENT_ID_B }));
      admin.mockPrisma.childParent.count.mockResolvedValue(1);
      admin.mockPrisma.childParent.findUnique.mockResolvedValue(null);
      admin.mockPrisma.childParent.create.mockResolvedValue(
        makeParentLink({ id: LINK_ID_B, parentId: PARENT_ID_B, isPrimary: false, relationship: null }),
      );

      await admin.caller.children.addParent({
        childId: CHILD_ID,
        parentId: PARENT_ID_B,
      });

      const createCall = admin.mockPrisma.childParent.create.mock.calls[0][0];
      expect(createCall.data.relationship).toBeNull();
    });
  });

  // =========================================================================
  // removeParent
  // =========================================================================

  describe('removeParent', () => {
    it('should deny PARENT from removing parents', async () => {
      await expect(
        parent.caller.children.removeParent({
          childId: CHILD_ID,
          parentId: PARENT_ID_A,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it('should deny unauthenticated access', async () => {
      const { caller } = createTestCaller(null);
      await expect(
        caller.children.removeParent({
          childId: CHILD_ID,
          parentId: PARENT_ID_A,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it('should remove a parent when multiple exist', async () => {
      admin.mockPrisma.childParent.findUnique.mockResolvedValue(
        makeParentLink({ parentId: PARENT_ID_B, isPrimary: false }),
      );
      admin.mockPrisma.childParent.count.mockResolvedValue(2);
      admin.mockPrisma.childParent.delete.mockResolvedValue({});

      const result = await admin.caller.children.removeParent({
        childId: CHILD_ID,
        parentId: PARENT_ID_B,
      });

      expect(result.success).toBe(true);
    });

    it('should throw NOT_FOUND when link does not exist', async () => {
      admin.mockPrisma.childParent.findUnique.mockResolvedValue(null);

      await expect(
        admin.caller.children.removeParent({
          childId: CHILD_ID,
          parentId: PARENT_ID_B,
        }),
      ).rejects.toThrow('Association parent-enfant non trouvée');
    });

    it('should block removing the last parent', async () => {
      admin.mockPrisma.childParent.findUnique.mockResolvedValue(makeParentLink());
      admin.mockPrisma.childParent.count.mockResolvedValue(1);

      await expect(
        admin.caller.children.removeParent({
          childId: CHILD_ID,
          parentId: PARENT_ID_A,
        }),
      ).rejects.toThrow("Impossible de retirer le dernier parent d'un enfant");
    });

    it('should allow STAFF to remove a parent', async () => {
      staff.mockPrisma.childParent.findUnique.mockResolvedValue(
        makeParentLink({ parentId: PARENT_ID_B, isPrimary: false }),
      );
      staff.mockPrisma.childParent.count.mockResolvedValue(2);
      staff.mockPrisma.childParent.delete.mockResolvedValue({});

      const result = await staff.caller.children.removeParent({
        childId: CHILD_ID,
        parentId: PARENT_ID_B,
      });

      expect(result.success).toBe(true);
    });

    it('should use composite key for finding and deleting the link', async () => {
      admin.mockPrisma.childParent.findUnique.mockResolvedValue(
        makeParentLink({ parentId: PARENT_ID_B }),
      );
      admin.mockPrisma.childParent.count.mockResolvedValue(2);
      admin.mockPrisma.childParent.delete.mockResolvedValue({});

      await admin.caller.children.removeParent({
        childId: CHILD_ID,
        parentId: PARENT_ID_B,
      });

      expect(admin.mockPrisma.childParent.findUnique).toHaveBeenCalledWith({
        where: { childId_parentId: { childId: CHILD_ID, parentId: PARENT_ID_B } },
      });
      expect(admin.mockPrisma.childParent.delete).toHaveBeenCalledWith({
        where: { childId_parentId: { childId: CHILD_ID, parentId: PARENT_ID_B } },
      });
    });
  });

  // =========================================================================
  // setPrimaryParent
  // =========================================================================

  describe('setPrimaryParent', () => {
    it('should deny PARENT from setting primary parent', async () => {
      await expect(
        parent.caller.children.setPrimaryParent({
          childId: CHILD_ID,
          parentId: PARENT_ID_B,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it('should deny unauthenticated access', async () => {
      const { caller } = createTestCaller(null);
      await expect(
        caller.children.setPrimaryParent({
          childId: CHILD_ID,
          parentId: PARENT_ID_B,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it('should set a new primary parent', async () => {
      admin.mockPrisma.childParent.findUnique.mockResolvedValue(
        makeParentLink({ parentId: PARENT_ID_B, isPrimary: false }),
      );
      admin.mockPrisma.childParent.updateMany.mockResolvedValue({ count: 2 });
      admin.mockPrisma.childParent.update.mockResolvedValue(
        makeParentLink({ parentId: PARENT_ID_B, isPrimary: true }),
      );

      const result = await admin.caller.children.setPrimaryParent({
        childId: CHILD_ID,
        parentId: PARENT_ID_B,
      });

      expect(result.success).toBe(true);
      // Verify $transaction was called with array of promises
      expect(admin.mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should throw NOT_FOUND when link does not exist', async () => {
      admin.mockPrisma.childParent.findUnique.mockResolvedValue(null);

      await expect(
        admin.caller.children.setPrimaryParent({
          childId: CHILD_ID,
          parentId: PARENT_ID_B,
        }),
      ).rejects.toThrow('Association parent-enfant non trouvée');
    });

    it('should allow STAFF to set primary parent', async () => {
      staff.mockPrisma.childParent.findUnique.mockResolvedValue(
        makeParentLink({ parentId: PARENT_ID_B, isPrimary: false }),
      );
      staff.mockPrisma.childParent.updateMany.mockResolvedValue({ count: 2 });
      staff.mockPrisma.childParent.update.mockResolvedValue(
        makeParentLink({ parentId: PARENT_ID_B, isPrimary: true }),
      );

      const result = await staff.caller.children.setPrimaryParent({
        childId: CHILD_ID,
        parentId: PARENT_ID_B,
      });

      expect(result.success).toBe(true);
    });

    it('should reset all isPrimary then set target in transaction', async () => {
      admin.mockPrisma.childParent.findUnique.mockResolvedValue(
        makeParentLink({ parentId: PARENT_ID_B, isPrimary: false }),
      );
      admin.mockPrisma.childParent.updateMany.mockResolvedValue({ count: 2 });
      admin.mockPrisma.childParent.update.mockResolvedValue(
        makeParentLink({ parentId: PARENT_ID_B, isPrimary: true }),
      );

      await admin.caller.children.setPrimaryParent({
        childId: CHILD_ID,
        parentId: PARENT_ID_B,
      });

      // updateMany resets all to false
      expect(admin.mockPrisma.childParent.updateMany).toHaveBeenCalledWith({
        where: { childId: CHILD_ID },
        data: { isPrimary: false },
      });
      // update sets target to true
      expect(admin.mockPrisma.childParent.update).toHaveBeenCalledWith({
        where: { childId_parentId: { childId: CHILD_ID, parentId: PARENT_ID_B } },
        data: { isPrimary: true },
      });
    });

    it('should call $transaction with an array of two operations', async () => {
      admin.mockPrisma.childParent.findUnique.mockResolvedValue(
        makeParentLink({ parentId: PARENT_ID_B, isPrimary: false }),
      );
      admin.mockPrisma.childParent.updateMany.mockResolvedValue({ count: 2 });
      admin.mockPrisma.childParent.update.mockResolvedValue(
        makeParentLink({ parentId: PARENT_ID_B, isPrimary: true }),
      );

      await admin.caller.children.setPrimaryParent({
        childId: CHILD_ID,
        parentId: PARENT_ID_B,
      });

      // $transaction is called with an array (not a callback)
      const txArg = admin.mockPrisma.$transaction.mock.calls[0][0];
      expect(Array.isArray(txArg)).toBe(true);
      expect(txArg).toHaveLength(2);
    });
  });
});
