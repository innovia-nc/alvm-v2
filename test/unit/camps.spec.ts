import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  createTestCaller,
  ADMIN_USER,
  STAFF_USER,
  PARENT_USER,
  ANIMATOR_USER,
  type TestCaller,
} from '../helpers/test-caller';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const CAMP_TYPE_ID = 'd1a00000-0000-4000-a000-000000000010';
const CAMP_ID = 'd1a00000-0000-4000-a000-000000000020';
const CAMP_ID_2 = 'd1a00000-0000-4000-a000-000000000021';

const now = new Date('2026-03-07T00:00:00Z');
const startDate = new Date('2026-07-01T00:00:00Z');
const endDate = new Date('2026-07-10T00:00:00Z'); // 10 days
const registrationDeadline = new Date('2026-06-15T00:00:00Z');

function makeCampType(overrides: Record<string, unknown> = {}) {
  return {
    id: CAMP_TYPE_ID,
    name: 'Centre aere',
    description: 'Camp de jour',
    active: true,
    ...overrides,
  };
}

function makeCampRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CAMP_ID,
    name: 'Camp Ete 2026',
    description: 'Un super camp pour les enfants',
    campTypeId: CAMP_TYPE_ID,
    location: 'Noumea',
    maxCapacity: 30,
    startDate,
    endDate,
    registrationDeadline,
    pricePerDay: 1500,
    status: 'PUBLISHED',
    createdBy: ANIMATOR_USER.id,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeCampWithIncludes(overrides: Record<string, unknown> = {}) {
  const base = makeCampRow(overrides);
  return {
    ...base,
    campType: { id: CAMP_TYPE_ID, name: 'Centre aere', description: 'Camp de jour' },
    creator: {
      name: 'Test Animator',
      staffMember: { firstName: 'Animateur', lastName: 'Test' },
    },
    _count: { registrations: 5 },
  };
}

// ---------------------------------------------------------------------------
// camps.list
// ---------------------------------------------------------------------------

describe('camps.list', () => {
  let caller: TestCaller['caller'];
  let mockPrisma: TestCaller['mockPrisma'];

  const defaultInput = {
    limit: 20,
    offset: 0,
    sortBy: 'createdAt' as const,
    sortOrder: 'desc' as const,
  };

  describe('access control', () => {
    it('should reject unauthenticated users', async () => {
      const { caller: anonCaller } = createTestCaller(null);
      await expect(anonCaller.camps.list(defaultInput)).rejects.toThrow(TRPCError);
    });

    it('should allow PARENT users', async () => {
      const { caller: parentCaller, mockPrisma: pMock } = createTestCaller(PARENT_USER);
      pMock.camp.findMany.mockResolvedValue([]);
      pMock.camp.count.mockResolvedValue(0);

      const result = await parentCaller.camps.list(defaultInput);
      expect(result).toEqual({ camps: [], total: 0 });
    });

    it('should allow STAFF users', async () => {
      const { caller: staffCaller, mockPrisma: sMock } = createTestCaller(STAFF_USER);
      sMock.camp.findMany.mockResolvedValue([]);
      sMock.camp.count.mockResolvedValue(0);

      const result = await staffCaller.camps.list(defaultInput);
      expect(result).toEqual({ camps: [], total: 0 });
    });

    it('should allow ADMIN users', async () => {
      const { caller: adminCaller, mockPrisma: aMock } = createTestCaller(ADMIN_USER);
      aMock.camp.findMany.mockResolvedValue([]);
      aMock.camp.count.mockResolvedValue(0);

      const result = await adminCaller.camps.list(defaultInput);
      expect(result).toEqual({ camps: [], total: 0 });
    });
  });

  describe('PARENT visibility filter', () => {
    it('should force status PUBLISHED for PARENT users', async () => {
      const { caller: parentCaller, mockPrisma: pMock } = createTestCaller(PARENT_USER);
      pMock.camp.findMany.mockResolvedValue([]);
      pMock.camp.count.mockResolvedValue(0);

      // Parent tries to request DRAFT — ignored, forced to PUBLISHED
      await parentCaller.camps.list({ ...defaultInput, status: 'DRAFT' });

      const findManyCall = pMock.camp.findMany.mock.calls[0][0];
      expect(findManyCall.where.status).toBe('PUBLISHED');
    });

    it('should allow ADMIN to filter by DRAFT status', async () => {
      const { caller: adminCaller, mockPrisma: aMock } = createTestCaller(ADMIN_USER);
      aMock.camp.findMany.mockResolvedValue([]);
      aMock.camp.count.mockResolvedValue(0);

      await adminCaller.camps.list({ ...defaultInput, status: 'DRAFT' });

      const findManyCall = aMock.camp.findMany.mock.calls[0][0];
      expect(findManyCall.where.status).toBe('DRAFT');
    });

    it('should allow STAFF to see all statuses when no filter is provided', async () => {
      const { caller: staffCaller, mockPrisma: sMock } = createTestCaller(STAFF_USER);
      sMock.camp.findMany.mockResolvedValue([]);
      sMock.camp.count.mockResolvedValue(0);

      await staffCaller.camps.list(defaultInput);

      const findManyCall = sMock.camp.findMany.mock.calls[0][0];
      expect(findManyCall.where.status).toBeUndefined();
    });
  });

  describe('result mapping', () => {
    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
    });

    it('should map camps with details correctly', async () => {
      const campRow = makeCampWithIncludes();
      mockPrisma.camp.findMany.mockResolvedValue([campRow]);
      mockPrisma.camp.count.mockResolvedValue(1);

      const result = await caller.camps.list(defaultInput);

      expect(result.total).toBe(1);
      expect(result.camps).toHaveLength(1);
      const camp = result.camps[0];
      expect(camp.id).toBe(CAMP_ID);
      expect(camp.name).toBe('Camp Ete 2026');
      expect(camp.campType.name).toBe('Centre aere');
      expect(camp.creator.firstName).toBe('Animateur');
      expect(camp.creator.lastName).toBe('Test');
      expect(camp.daysCount).toBe(10);
      expect(camp.registrationsCount).toBe(5);
      expect(camp.availableSpots).toBe(25); // 30 - 5
      expect(camp.pricePerDay).toBe(1500);
    });

    it('should compute daysCount = 0 when dates are null', async () => {
      const campRow = makeCampWithIncludes({ startDate: null, endDate: null });
      mockPrisma.camp.findMany.mockResolvedValue([campRow]);
      mockPrisma.camp.count.mockResolvedValue(1);

      const result = await caller.camps.list(defaultInput);
      expect(result.camps[0].daysCount).toBe(0);
    });

    it('should fallback creator name when staffMember is null', async () => {
      const campRow = makeCampWithIncludes();
      campRow.creator = { name: 'Fallback Name', staffMember: null as any };
      mockPrisma.camp.findMany.mockResolvedValue([campRow]);
      mockPrisma.camp.count.mockResolvedValue(1);

      const result = await caller.camps.list(defaultInput);
      expect(result.camps[0].creator.firstName).toBe('Fallback Name');
      expect(result.camps[0].creator.lastName).toBe('');
    });

    it('should fallback to "Unknown" when both staffMember and name are null', async () => {
      const campRow = makeCampWithIncludes();
      campRow.creator = { name: null, staffMember: null as any };
      mockPrisma.camp.findMany.mockResolvedValue([campRow]);
      mockPrisma.camp.count.mockResolvedValue(1);

      const result = await caller.camps.list(defaultInput);
      expect(result.camps[0].creator.firstName).toBe('Unknown');
    });

    it('should compute availableSpots as maxCapacity minus registrationsCount', async () => {
      const campRow = makeCampWithIncludes({ maxCapacity: 10 });
      campRow._count = { registrations: 8 };
      mockPrisma.camp.findMany.mockResolvedValue([campRow]);
      mockPrisma.camp.count.mockResolvedValue(1);

      const result = await caller.camps.list(defaultInput);
      expect(result.camps[0].availableSpots).toBe(2);
    });
  });

  describe('filtering', () => {
    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
      mockPrisma.camp.findMany.mockResolvedValue([]);
      mockPrisma.camp.count.mockResolvedValue(0);
    });

    it('should filter by campTypeId', async () => {
      await caller.camps.list({ ...defaultInput, campTypeId: CAMP_TYPE_ID });

      const where = mockPrisma.camp.findMany.mock.calls[0][0].where;
      expect(where.campTypeId).toBe(CAMP_TYPE_ID);
    });

    it('should filter by location (case-insensitive)', async () => {
      await caller.camps.list({ ...defaultInput, location: 'Noumea' });

      const where = mockPrisma.camp.findMany.mock.calls[0][0].where;
      expect(where.location).toEqual({ contains: 'Noumea', mode: 'insensitive' });
    });

    it('should search by name, description, and campType name', async () => {
      await caller.camps.list({ ...defaultInput, search: 'ete' });

      const where = mockPrisma.camp.findMany.mock.calls[0][0].where;
      expect(where.OR).toHaveLength(3);
      expect(where.OR[0]).toEqual({ name: { contains: 'ete', mode: 'insensitive' } });
      expect(where.OR[1]).toEqual({ description: { contains: 'ete', mode: 'insensitive' } });
      expect(where.OR[2]).toEqual({ campType: { name: { contains: 'ete', mode: 'insensitive' } } });
    });

    it('should always include deletedAt: null filter', async () => {
      await caller.camps.list(defaultInput);

      const where = mockPrisma.camp.findMany.mock.calls[0][0].where;
      expect(where.deletedAt).toBeNull();
    });
  });

  describe('sorting', () => {
    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
      mockPrisma.camp.findMany.mockResolvedValue([]);
      mockPrisma.camp.count.mockResolvedValue(0);
    });

    it('should sort by specified column and order', async () => {
      await caller.camps.list({ ...defaultInput, sortBy: 'name', sortOrder: 'asc' });

      const call = mockPrisma.camp.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual({ name: 'asc' });
    });

    it('should default to createdAt desc', async () => {
      await caller.camps.list({ limit: 20, offset: 0 });

      const call = mockPrisma.camp.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  describe('pagination', () => {
    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
      mockPrisma.camp.findMany.mockResolvedValue([]);
      mockPrisma.camp.count.mockResolvedValue(50);
    });

    it('should pass limit and offset to prisma', async () => {
      await caller.camps.list({ ...defaultInput, limit: 10, offset: 20 });

      const call = mockPrisma.camp.findMany.mock.calls[0][0];
      expect(call.take).toBe(10);
      expect(call.skip).toBe(20);
    });

    it('should return total count separately from paged results', async () => {
      const result = await caller.camps.list({ ...defaultInput, limit: 10, offset: 0 });
      expect(result.total).toBe(50);
      expect(result.camps).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// camps.getById
// ---------------------------------------------------------------------------

describe('camps.getById', () => {
  it('should reject unauthenticated users', async () => {
    const { caller } = createTestCaller(null);
    await expect(caller.camps.getById({ id: CAMP_ID })).rejects.toThrow(TRPCError);
  });

  it('should return null when camp not found', async () => {
    const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
    mockPrisma.camp.findFirst.mockResolvedValue(null);

    const result = await caller.camps.getById({ id: CAMP_ID });
    expect(result).toBeNull();
  });

  it('should return camp with details for ADMIN', async () => {
    const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
    mockPrisma.camp.findFirst.mockResolvedValue(makeCampWithIncludes());

    const result = await caller.camps.getById({ id: CAMP_ID });
    expect(result).not.toBeNull();
    expect(result!.id).toBe(CAMP_ID);
    expect(result!.daysCount).toBe(10);
    expect(result!.availableSpots).toBe(25);
  });

  it('should force PUBLISHED filter for PARENT user', async () => {
    const { caller, mockPrisma } = createTestCaller(PARENT_USER);
    mockPrisma.camp.findFirst.mockResolvedValue(null);

    await caller.camps.getById({ id: CAMP_ID });

    const where = mockPrisma.camp.findFirst.mock.calls[0][0].where;
    expect(where.status).toBe('PUBLISHED');
    expect(where.deletedAt).toBeNull();
  });

  it('should NOT force PUBLISHED filter for STAFF user', async () => {
    const { caller, mockPrisma } = createTestCaller(STAFF_USER);
    mockPrisma.camp.findFirst.mockResolvedValue(null);

    await caller.camps.getById({ id: CAMP_ID });

    const where = mockPrisma.camp.findFirst.mock.calls[0][0].where;
    expect(where.status).toBeUndefined();
  });

  it('should include campType, creator, and _count in query', async () => {
    const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
    mockPrisma.camp.findFirst.mockResolvedValue(makeCampWithIncludes());

    await caller.camps.getById({ id: CAMP_ID });

    const call = mockPrisma.camp.findFirst.mock.calls[0][0];
    expect(call.include.campType).toBeDefined();
    expect(call.include.creator).toBeDefined();
    expect(call.include._count).toBeDefined();
  });

  it('should compute daysCount and availableSpots correctly', async () => {
    const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
    const camp = makeCampWithIncludes({ maxCapacity: 20 });
    camp._count = { registrations: 12 };
    mockPrisma.camp.findFirst.mockResolvedValue(camp);

    const result = await caller.camps.getById({ id: CAMP_ID });
    expect(result!.daysCount).toBe(10);
    expect(result!.registrationsCount).toBe(12);
    expect(result!.availableSpots).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// camps.create
// ---------------------------------------------------------------------------

describe('camps.create', () => {
  const createInput = {
    name: 'Nouveau Camp',
    description: 'Description du nouveau camp avec au moins dix caractères',
    campTypeId: CAMP_TYPE_ID,
    location: 'Noumea',
    maxCapacity: 20,
    startDate: '2026-07-01',
    endDate: '2026-07-10',
    registrationDeadline: '2026-06-15',
    totalPrice: 15000,
    status: 'DRAFT' as const,
  };

  describe('access control', () => {
    it('should reject unauthenticated users', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.camps.create(createInput)).rejects.toThrow(TRPCError);
    });

    it('should reject PARENT users', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.camps.create(createInput)).rejects.toThrow(TRPCError);
    });

    it('should allow STAFF users', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.campType.findFirst.mockResolvedValue(makeCampType());
      mockPrisma.camp.create.mockResolvedValue(makeCampRow({
        createdBy: STAFF_USER.id,
      }));

      const result = await caller.camps.create(createInput);
      expect(result.id).toBe(CAMP_ID);
    });

    it('should allow ANIMATOR users', async () => {
      const { caller, mockPrisma } = createTestCaller(ANIMATOR_USER);
      mockPrisma.campType.findFirst.mockResolvedValue(makeCampType());
      mockPrisma.camp.create.mockResolvedValue(makeCampRow({
        createdBy: ANIMATOR_USER.id,
      }));

      const result = await caller.camps.create(createInput);
      expect(result.id).toBe(CAMP_ID);
    });

    it('should allow ADMIN users (bypass staffRole check)', async () => {
      const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
      mockPrisma.campType.findFirst.mockResolvedValue(makeCampType());
      mockPrisma.camp.create.mockResolvedValue(makeCampRow({
        createdBy: ADMIN_USER.id,
      }));

      const result = await caller.camps.create(createInput);
      expect(result.id).toBe(CAMP_ID);
    });
  });

  describe('business rules', () => {
    let caller: TestCaller['caller'];
    let mockPrisma: TestCaller['mockPrisma'];

    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(ANIMATOR_USER));
    });

    it('should reject if campType is not found or inactive', async () => {
      mockPrisma.campType.findFirst.mockResolvedValue(null);

      await expect(caller.camps.create(createInput)).rejects.toThrow('Type de camp non trouvé ou inactif');
    });

    it('should compute pricePerDay from totalPrice / daysCount', async () => {
      mockPrisma.campType.findFirst.mockResolvedValue(makeCampType());
      mockPrisma.camp.create.mockResolvedValue(makeCampRow({ pricePerDay: 1500 }));

      await caller.camps.create(createInput);

      const createCall = mockPrisma.camp.create.mock.calls[0][0];
      // 10 days (July 1 to July 10 inclusive), 15000 / 10 = 1500
      expect(createCall.data.pricePerDay).toBe(1500);
    });

    it('should set createdBy to current user id', async () => {
      mockPrisma.campType.findFirst.mockResolvedValue(makeCampType());
      mockPrisma.camp.create.mockResolvedValue(makeCampRow());

      await caller.camps.create(createInput);

      const createCall = mockPrisma.camp.create.mock.calls[0][0];
      expect(createCall.data.createdBy).toBe(ANIMATOR_USER.id);
    });

    it('should reject if endDate < startDate (Zod refine)', async () => {
      const badInput = {
        ...createInput,
        startDate: '2026-07-10',
        endDate: '2026-07-01',
      };

      await expect(caller.camps.create(badInput)).rejects.toThrow();
    });

    it('should compute pricePerDay correctly for same-day camp (1 day)', async () => {
      const sameDay = {
        ...createInput,
        startDate: '2026-07-01',
        endDate: '2026-07-01',
        totalPrice: 5000,
      };
      mockPrisma.campType.findFirst.mockResolvedValue(makeCampType());
      // 1 day, so pricePerDay = 5000
      mockPrisma.camp.create.mockResolvedValue(makeCampRow({ pricePerDay: 5000 }));

      await caller.camps.create(sameDay);

      const createCall = mockPrisma.camp.create.mock.calls[0][0];
      expect(createCall.data.pricePerDay).toBe(5000);
    });

    it('should convert string dates to Date objects for storage', async () => {
      mockPrisma.campType.findFirst.mockResolvedValue(makeCampType());
      mockPrisma.camp.create.mockResolvedValue(makeCampRow());

      await caller.camps.create(createInput);

      const createCall = mockPrisma.camp.create.mock.calls[0][0];
      expect(createCall.data.startDate).toEqual(new Date('2026-07-01'));
      expect(createCall.data.endDate).toEqual(new Date('2026-07-10'));
      expect(createCall.data.registrationDeadline).toEqual(new Date('2026-06-15'));
    });

    it('should set the requested status on the camp', async () => {
      mockPrisma.campType.findFirst.mockResolvedValue(makeCampType());
      mockPrisma.camp.create.mockResolvedValue(makeCampRow({ status: 'PUBLISHED' }));

      await caller.camps.create({ ...createInput, status: 'PUBLISHED' });

      const createCall = mockPrisma.camp.create.mock.calls[0][0];
      expect(createCall.data.status).toBe('PUBLISHED');
    });

    it('should set pricePerDay to 0 when totalPrice is 0', async () => {
      mockPrisma.campType.findFirst.mockResolvedValue(makeCampType());
      mockPrisma.camp.create.mockResolvedValue(makeCampRow({ pricePerDay: 0 }));

      await caller.camps.create({ ...createInput, totalPrice: 0 });

      const createCall = mockPrisma.camp.create.mock.calls[0][0];
      expect(createCall.data.pricePerDay).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// camps.update
// ---------------------------------------------------------------------------

describe('camps.update', () => {
  const updateInput = {
    id: CAMP_ID,
    name: 'Camp Modifie',
  };

  describe('access control', () => {
    it('should reject unauthenticated users', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.camps.update(updateInput)).rejects.toThrow(TRPCError);
    });

    it('should reject PARENT users', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.camps.update(updateInput)).rejects.toThrow(TRPCError);
    });

    it('should allow STAFF to update any camp regardless of creator', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.camp.findFirst.mockResolvedValue(makeCampRow({
        createdBy: 'd1a00000-0000-4000-a000-000000000099',
      }));
      mockPrisma.camp.update.mockResolvedValue(makeCampRow({ name: 'Camp Modifie' }));

      const result = await caller.camps.update(updateInput);
      expect(result.name).toBe('Camp Modifie');
    });

    it('should reject ANIMATOR who is not the creator and not ADMIN', async () => {
      const { caller, mockPrisma } = createTestCaller(ANIMATOR_USER);
      mockPrisma.camp.findFirst.mockResolvedValue(makeCampRow({
        createdBy: 'd1a00000-0000-4000-a000-000000000099',
      }));

      await expect(caller.camps.update(updateInput)).rejects.toThrow('Vous ne pouvez pas modifier ce camp');
    });

    it('should allow ADMIN to update any camp regardless of creator', async () => {
      const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
      mockPrisma.camp.findFirst.mockResolvedValue(makeCampRow({
        createdBy: 'd1a00000-0000-4000-a000-000000000099',
      }));
      mockPrisma.camp.update.mockResolvedValue(makeCampRow({ name: 'Camp Modifie' }));

      const result = await caller.camps.update(updateInput);
      expect(result.name).toBe('Camp Modifie');
    });

    it('should allow creator ANIMATOR to update their own camp', async () => {
      const { caller, mockPrisma } = createTestCaller(ANIMATOR_USER);
      mockPrisma.camp.findFirst.mockResolvedValue(makeCampRow({
        createdBy: ANIMATOR_USER.id,
      }));
      mockPrisma.camp.update.mockResolvedValue(makeCampRow({ name: 'Camp Modifie' }));

      const result = await caller.camps.update(updateInput);
      expect(result.name).toBe('Camp Modifie');
    });
  });

  describe('business rules', () => {
    let caller: TestCaller['caller'];
    let mockPrisma: TestCaller['mockPrisma'];

    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
    });

    it('should throw NOT_FOUND when camp does not exist', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue(null);

      await expect(caller.camps.update(updateInput)).rejects.toThrow('Camp non trouvé');
    });

    it('should throw BAD_REQUEST when no modifications provided', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue(makeCampRow());

      await expect(caller.camps.update({ id: CAMP_ID })).rejects.toThrow('Aucune modification fournie');
    });

    it('should recalculate pricePerDay when totalPrice is provided', async () => {
      const existing = makeCampRow();
      mockPrisma.camp.findFirst.mockResolvedValue(existing);
      mockPrisma.camp.update.mockResolvedValue(makeCampRow({ pricePerDay: 2000 }));

      await caller.camps.update({ id: CAMP_ID, totalPrice: 20000 });

      const updateCall = mockPrisma.camp.update.mock.calls[0][0];
      // 10 days (existing dates), 20000 / 10 = 2000
      expect(updateCall.data.pricePerDay).toBe(2000);
    });

    it('should use new dates for pricePerDay calculation when dates change', async () => {
      const existing = makeCampRow();
      mockPrisma.camp.findFirst.mockResolvedValue(existing);
      mockPrisma.camp.update.mockResolvedValue(makeCampRow({ pricePerDay: 3000 }));

      await caller.camps.update({
        id: CAMP_ID,
        startDate: '2026-07-01',
        endDate: '2026-07-05',
        totalPrice: 15000,
      });

      const updateCall = mockPrisma.camp.update.mock.calls[0][0];
      // 5 days (July 1-5 inclusive), 15000 / 5 = 3000
      expect(updateCall.data.pricePerDay).toBe(3000);
    });

    it('should reject update when endDate < startDate (Zod refine)', async () => {
      await expect(caller.camps.update({
        id: CAMP_ID,
        startDate: '2026-07-10',
        endDate: '2026-07-01',
      })).rejects.toThrow();
    });

    it('should update only the provided fields', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue(makeCampRow());
      mockPrisma.camp.update.mockResolvedValue(makeCampRow({ location: 'Bourail' }));

      await caller.camps.update({ id: CAMP_ID, location: 'Bourail' });

      const updateCall = mockPrisma.camp.update.mock.calls[0][0];
      expect(updateCall.data.location).toBe('Bourail');
      expect(updateCall.data.name).toBeUndefined();
      expect(updateCall.data.description).toBeUndefined();
    });

    it('should use existing dates when only totalPrice changes', async () => {
      const existing = makeCampRow();
      mockPrisma.camp.findFirst.mockResolvedValue(existing);
      mockPrisma.camp.update.mockResolvedValue(makeCampRow({ pricePerDay: 1000 }));

      await caller.camps.update({ id: CAMP_ID, totalPrice: 10000 });

      const updateCall = mockPrisma.camp.update.mock.calls[0][0];
      // Uses existing startDate/endDate (10 days), 10000/10 = 1000
      expect(updateCall.data.pricePerDay).toBe(1000);
    });

    it('should convert date strings to Date objects', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue(makeCampRow());
      mockPrisma.camp.update.mockResolvedValue(makeCampRow());

      await caller.camps.update({
        id: CAMP_ID,
        startDate: '2026-08-01',
        endDate: '2026-08-15',
      });

      const updateCall = mockPrisma.camp.update.mock.calls[0][0];
      expect(updateCall.data.startDate).toEqual(new Date('2026-08-01'));
      expect(updateCall.data.endDate).toEqual(new Date('2026-08-15'));
    });

    it('should update status', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue(makeCampRow());
      mockPrisma.camp.update.mockResolvedValue(makeCampRow({ status: 'CLOSED' }));

      await caller.camps.update({ id: CAMP_ID, status: 'CLOSED' });

      const updateCall = mockPrisma.camp.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('CLOSED');
    });
  });
});

// ---------------------------------------------------------------------------
// camps.delete
// ---------------------------------------------------------------------------

describe('camps.delete', () => {
  describe('access control', () => {
    it('should reject unauthenticated users', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.camps.delete({ id: CAMP_ID })).rejects.toThrow(TRPCError);
    });

    it('should reject PARENT users', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.camps.delete({ id: CAMP_ID })).rejects.toThrow(TRPCError);
    });

    it('should allow STAFF users', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.registration.count.mockResolvedValue(0);
      mockPrisma.camp.updateMany.mockResolvedValue({ count: 1 });

      const result = await caller.camps.delete({ id: CAMP_ID });
      expect(result.success).toBe(true);
    });

    it('should allow ADMIN users', async () => {
      const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
      mockPrisma.registration.count.mockResolvedValue(0);
      mockPrisma.camp.updateMany.mockResolvedValue({ count: 1 });

      const result = await caller.camps.delete({ id: CAMP_ID });
      expect(result.success).toBe(true);
    });
  });

  describe('business rules', () => {
    let caller: TestCaller['caller'];
    let mockPrisma: TestCaller['mockPrisma'];

    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
    });

    it('should block deletion when confirmed registrations exist', async () => {
      mockPrisma.registration.count.mockResolvedValue(3);

      await expect(caller.camps.delete({ id: CAMP_ID })).rejects.toThrow(
        'Impossible de supprimer ce camp : des inscriptions confirmées existent',
      );
    });

    it('should soft-delete camp (set deletedAt)', async () => {
      mockPrisma.registration.count.mockResolvedValue(0);
      mockPrisma.camp.updateMany.mockResolvedValue({ count: 1 });

      const result = await caller.camps.delete({ id: CAMP_ID });

      expect(result.success).toBe(true);
      const call = mockPrisma.camp.updateMany.mock.calls[0][0];
      expect(call.where.id).toBe(CAMP_ID);
      expect(call.where.deletedAt).toBeNull();
      expect(call.data.deletedAt).toBeInstanceOf(Date);
    });

    it('should throw NOT_FOUND when camp does not exist (updateMany returns 0)', async () => {
      mockPrisma.registration.count.mockResolvedValue(0);
      mockPrisma.camp.updateMany.mockResolvedValue({ count: 0 });

      await expect(caller.camps.delete({ id: CAMP_ID })).rejects.toThrow('Camp non trouvé');
    });

    it('should check for CONFIRMED registrations with deletedAt null', async () => {
      mockPrisma.registration.count.mockResolvedValue(0);
      mockPrisma.camp.updateMany.mockResolvedValue({ count: 1 });

      await caller.camps.delete({ id: CAMP_ID });

      const countCall = mockPrisma.registration.count.mock.calls[0][0];
      expect(countCall.where.campId).toBe(CAMP_ID);
      expect(countCall.where.status).toBe('CONFIRMED');
      expect(countCall.where.deletedAt).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// camps.listCampTypes
// ---------------------------------------------------------------------------

describe('camps.listCampTypes', () => {
  it('should be accessible without authentication (publicProcedure)', async () => {
    const { caller, mockPrisma } = createTestCaller(null);
    const types = [makeCampType()];
    mockPrisma.campType.findMany.mockResolvedValue(types);

    const result = await caller.camps.listCampTypes();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Centre aere');
  });

  it('should return only active camp types', async () => {
    const { caller, mockPrisma } = createTestCaller(null);
    mockPrisma.campType.findMany.mockResolvedValue([]);

    await caller.camps.listCampTypes();

    const call = mockPrisma.campType.findMany.mock.calls[0][0];
    expect(call.where.active).toBe(true);
  });

  it('should order by name ascending', async () => {
    const { caller, mockPrisma } = createTestCaller(null);
    mockPrisma.campType.findMany.mockResolvedValue([]);

    await caller.camps.listCampTypes();

    const call = mockPrisma.campType.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ name: 'asc' });
  });

  it('should return camp type with nullable description', async () => {
    const { caller, mockPrisma } = createTestCaller(null);
    mockPrisma.campType.findMany.mockResolvedValue([
      makeCampType({ description: null }),
    ]);

    const result = await caller.camps.listCampTypes();
    expect(result[0].description).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// camps.duplicate
// ---------------------------------------------------------------------------

describe('camps.duplicate', () => {
  const duplicateInput = {
    id: CAMP_ID,
    name: 'Camp Ete 2026 - Copie',
  };

  describe('access control', () => {
    it('should reject unauthenticated users', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.camps.duplicate(duplicateInput)).rejects.toThrow(TRPCError);
    });

    it('should reject PARENT users', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.camps.duplicate(duplicateInput)).rejects.toThrow(TRPCError);
    });

    it('should allow STAFF users', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      const sourceCamp = makeCampRow();
      mockPrisma.camp.findFirst.mockResolvedValue(sourceCamp);
      mockPrisma.camp.create.mockResolvedValue(makeCampRow({
        id: CAMP_ID_2,
        name: 'Camp Ete 2026 - Copie',
        status: 'DRAFT',
      }));

      const result = await caller.camps.duplicate(duplicateInput);
      expect(result.id).toBe(CAMP_ID_2);
    });

    it('should allow ANIMATOR users', async () => {
      const { caller, mockPrisma } = createTestCaller(ANIMATOR_USER);
      const sourceCamp = makeCampRow();
      mockPrisma.camp.findFirst.mockResolvedValue(sourceCamp);
      mockPrisma.camp.create.mockResolvedValue(makeCampRow({
        id: CAMP_ID_2,
        name: 'Camp Ete 2026 - Copie',
        status: 'DRAFT',
        createdBy: ANIMATOR_USER.id,
      }));

      const result = await caller.camps.duplicate(duplicateInput);
      expect(result.id).toBe(CAMP_ID_2);
      expect(result.name).toBe('Camp Ete 2026 - Copie');
      expect(result.status).toBe('DRAFT');
    });

    it('should allow ADMIN users', async () => {
      const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
      mockPrisma.camp.findFirst.mockResolvedValue(makeCampRow());
      mockPrisma.camp.create.mockResolvedValue(makeCampRow({
        id: CAMP_ID_2,
        status: 'DRAFT',
        createdBy: ADMIN_USER.id,
      }));

      const result = await caller.camps.duplicate(duplicateInput);
      expect(result.id).toBe(CAMP_ID_2);
    });
  });

  describe('business rules', () => {
    let caller: TestCaller['caller'];
    let mockPrisma: TestCaller['mockPrisma'];

    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(ANIMATOR_USER));
    });

    it('should throw NOT_FOUND when source camp does not exist', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue(null);

      await expect(caller.camps.duplicate(duplicateInput)).rejects.toThrow('Camp source non trouvé');
    });

    it('should create a copy with new name and DRAFT status', async () => {
      const sourceCamp = makeCampRow({ status: 'PUBLISHED' });
      mockPrisma.camp.findFirst.mockResolvedValue(sourceCamp);
      mockPrisma.camp.create.mockResolvedValue(makeCampRow({
        id: CAMP_ID_2,
        name: 'Camp Ete 2026 - Copie',
        status: 'DRAFT',
      }));

      await caller.camps.duplicate(duplicateInput);

      const createCall = mockPrisma.camp.create.mock.calls[0][0];
      expect(createCall.data.name).toBe('Camp Ete 2026 - Copie');
      expect(createCall.data.status).toBe('DRAFT');
      expect(createCall.data.description).toBe(sourceCamp.description);
      expect(createCall.data.campTypeId).toBe(sourceCamp.campTypeId);
      expect(createCall.data.location).toBe(sourceCamp.location);
      expect(createCall.data.maxCapacity).toBe(sourceCamp.maxCapacity);
      expect(createCall.data.pricePerDay).toBe(sourceCamp.pricePerDay);
    });

    it('should set createdBy to the current user, not the original creator', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue(makeCampRow({
        createdBy: 'd1a00000-0000-4000-a000-000000000099',
      }));
      mockPrisma.camp.create.mockResolvedValue(makeCampRow({
        id: CAMP_ID_2,
        createdBy: ANIMATOR_USER.id,
        status: 'DRAFT',
      }));

      await caller.camps.duplicate(duplicateInput);

      const createCall = mockPrisma.camp.create.mock.calls[0][0];
      expect(createCall.data.createdBy).toBe(ANIMATOR_USER.id);
    });

    it('should copy all camp properties from source', async () => {
      const sourceCamp = makeCampRow({
        description: 'Custom description for test',
        location: 'Bourail',
        maxCapacity: 50,
        pricePerDay: 2500,
      });
      mockPrisma.camp.findFirst.mockResolvedValue(sourceCamp);
      mockPrisma.camp.create.mockResolvedValue(makeCampRow({
        id: CAMP_ID_2,
        status: 'DRAFT',
      }));

      await caller.camps.duplicate(duplicateInput);

      const createCall = mockPrisma.camp.create.mock.calls[0][0];
      expect(createCall.data.startDate).toEqual(sourceCamp.startDate);
      expect(createCall.data.endDate).toEqual(sourceCamp.endDate);
      expect(createCall.data.registrationDeadline).toEqual(sourceCamp.registrationDeadline);
    });

    it('should only look for non-deleted source camps', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue(null);

      try {
        await caller.camps.duplicate(duplicateInput);
      } catch {
        // Expected to throw
      }

      const call = mockPrisma.camp.findFirst.mock.calls[0][0];
      expect(call.where.deletedAt).toBeNull();
    });
  });
});
