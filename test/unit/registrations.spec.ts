import { describe, it, expect, beforeEach } from 'vitest';
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
// Valid RFC 4122 UUIDs for test fixtures
// ---------------------------------------------------------------------------

const REG_ID       = 'd1a00000-0000-4000-a000-000000000001';
const REG_ID_2     = 'd1a00000-0000-4000-a000-000000000002';
const CAMP_ID      = 'e1a00000-0000-4000-a000-000000000001';
const CHILD_ID     = 'f1a00000-0000-4000-a000-000000000001';
const INVOICE_ID   = 'a1a00000-0000-4000-a000-000000000001';
const CREDIT_ID    = 'b1a00000-0000-4000-a000-000000000001';
const PAYMENT_ID   = 'c1a00000-0000-4000-a000-000000000001';
const REFUND_ID    = 'c1a00000-0000-4000-a000-000000000002';
const CAMP_DAY_1   = 'e1a00000-0000-4000-a000-000000000010';
const CAMP_DAY_2   = 'e1a00000-0000-4000-a000-000000000011';
const CREDIT_APP_ID = 'b1a00000-0000-4000-a000-000000000002';

const OTHER_PARENT = 'a1a11111-1111-4111-a111-111111111111';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = new Date('2026-03-07T10:00:00Z');
const futureDate = new Date('2026-06-01T00:00:00Z');
const pastDate = new Date('2025-01-01T00:00:00Z');
const campStart = new Date('2026-07-01T00:00:00Z');
const campEnd = new Date('2026-07-05T00:00:00Z');

function makeRegistrationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REG_ID,
    campId: CAMP_ID,
    childId: CHILD_ID,
    parentId: PARENT_USER.id,
    status: 'CONFIRMED',
    registrationDate: now,
    specialRequirements: null,
    paymentStatus: 'UNPAID',
    selectedDays: [CAMP_DAY_1, CAMP_DAY_2],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeRegistrationWithIncludes(overrides: Record<string, unknown> = {}) {
  const base = makeRegistrationRow(overrides);
  return {
    ...base,
    camp: {
      id: CAMP_ID,
      name: 'Camp Ete 2026',
      location: 'Noumea',
      startDate: campStart,
      endDate: campEnd,
      pricePerDay: 1500,
      registrationDeadline: futureDate,
      status: 'PUBLISHED',
    },
    child: {
      id: CHILD_ID,
      firstName: 'Jean',
      lastName: 'Dupont',
      birthDate: new Date('2018-05-15T00:00:00Z'),
    },
    parent: {
      firstName: 'Marie',
      lastName: 'Dupont',
      email: 'marie@test.com',
      phone: '0601020304',
    },
    invoiceLines: [],
  };
}

function makeCamp(overrides: Record<string, unknown> = {}) {
  return {
    id: CAMP_ID,
    name: 'Camp Ete 2026',
    location: 'Noumea',
    startDate: campStart,
    endDate: campEnd,
    pricePerDay: 1500,
    registrationDeadline: futureDate,
    status: 'PUBLISHED',
    maxCapacity: 30,
    deletedAt: null,
    _count: { registrations: 5 },
    ...overrides,
  };
}

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE_ID,
    invoiceNumber: 'FAC-2026-0001',
    status: 'SENT',
    totalAmount: 7500,
    paidAmount: 0,
    parentId: PARENT_USER.id,
    invoiceType: 'INVOICE',
    taxRate: 0.11,
    taxAmount: 750,
    subtotalHt: 6750,
    deletedAt: null,
    createdAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// registrations.list
// ---------------------------------------------------------------------------

describe('registrations.list', () => {
  const defaultInput = { limit: 20, offset: 0 };

  describe('access control', () => {
    it('should reject unauthenticated users', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.registrations.list(defaultInput)).rejects.toThrow(TRPCError);
    });

    it('should allow PARENT users', async () => {
      const { caller, mockPrisma } = createTestCaller(PARENT_USER);
      mockPrisma.registration.findMany.mockResolvedValue([]);
      mockPrisma.registration.count.mockResolvedValue(0);

      const result = await caller.registrations.list(defaultInput);
      expect(result).toEqual({ registrations: [], total: 0 });
    });

    it('should allow STAFF users', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.registration.findMany.mockResolvedValue([]);
      mockPrisma.registration.count.mockResolvedValue(0);

      const result = await caller.registrations.list(defaultInput);
      expect(result).toEqual({ registrations: [], total: 0 });
    });

    it('should allow ADMIN users', async () => {
      const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
      mockPrisma.registration.findMany.mockResolvedValue([]);
      mockPrisma.registration.count.mockResolvedValue(0);

      const result = await caller.registrations.list(defaultInput);
      expect(result).toEqual({ registrations: [], total: 0 });
    });
  });

  describe('PARENT scoping', () => {
    it('should restrict PARENT to their own registrations', async () => {
      const { caller, mockPrisma } = createTestCaller(PARENT_USER);
      mockPrisma.registration.findMany.mockResolvedValue([]);
      mockPrisma.registration.count.mockResolvedValue(0);

      await caller.registrations.list(defaultInput);

      const where = mockPrisma.registration.findMany.mock.calls[0][0].where;
      expect(where.parentId).toBe(PARENT_USER.id);
    });

    it('should NOT restrict STAFF to specific parent', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.registration.findMany.mockResolvedValue([]);
      mockPrisma.registration.count.mockResolvedValue(0);

      await caller.registrations.list(defaultInput);

      const where = mockPrisma.registration.findMany.mock.calls[0][0].where;
      expect(where.parentId).toBeUndefined();
    });
  });

  describe('filtering', () => {
    let caller: TestCaller['caller'];
    let mockPrisma: TestCaller['mockPrisma'];

    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
      mockPrisma.registration.findMany.mockResolvedValue([]);
      mockPrisma.registration.count.mockResolvedValue(0);
    });

    it('should filter by campId', async () => {
      await caller.registrations.list({ ...defaultInput, campId: CAMP_ID });

      const where = mockPrisma.registration.findMany.mock.calls[0][0].where;
      expect(where.campId).toBe(CAMP_ID);
    });

    it('should filter by childId', async () => {
      await caller.registrations.list({ ...defaultInput, childId: CHILD_ID });

      const where = mockPrisma.registration.findMany.mock.calls[0][0].where;
      expect(where.childId).toBe(CHILD_ID);
    });

    it('should filter by status', async () => {
      await caller.registrations.list({ ...defaultInput, status: 'CONFIRMED' });

      const where = mockPrisma.registration.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('CONFIRMED');
    });

    it('should search across child, parent, and camp fields', async () => {
      await caller.registrations.list({ ...defaultInput, search: 'dupont' });

      const where = mockPrisma.registration.findMany.mock.calls[0][0].where;
      expect(where.OR).toHaveLength(6);
    });

    it('should always filter deletedAt: null', async () => {
      await caller.registrations.list(defaultInput);

      const where = mockPrisma.registration.findMany.mock.calls[0][0].where;
      expect(where.deletedAt).toBeNull();
    });
  });

  describe('sorting', () => {
    let caller: TestCaller['caller'];
    let mockPrisma: TestCaller['mockPrisma'];

    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
      mockPrisma.registration.findMany.mockResolvedValue([]);
      mockPrisma.registration.count.mockResolvedValue(0);
    });

    it('should sort by registrationDate by default', async () => {
      await caller.registrations.list(defaultInput);

      const call = mockPrisma.registration.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual({ registrationDate: 'asc' });
    });

    it('should sort by childName through relation', async () => {
      await caller.registrations.list({ ...defaultInput, sortBy: 'childName', sortOrder: 'desc' });

      const call = mockPrisma.registration.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual({ child: { lastName: 'desc' } });
    });

    it('should sort by status', async () => {
      await caller.registrations.list({ ...defaultInput, sortBy: 'status', sortOrder: 'asc' });

      const call = mockPrisma.registration.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual({ status: 'asc' });
    });
  });

  describe('result mapping', () => {
    it('should map registration with details correctly', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.registration.findMany.mockResolvedValue([makeRegistrationWithIncludes()]);
      mockPrisma.registration.count.mockResolvedValue(1);

      const result = await caller.registrations.list(defaultInput);

      expect(result.total).toBe(1);
      expect(result.registrations).toHaveLength(1);
      const reg = result.registrations[0];
      expect(reg.id).toBe(REG_ID);
      expect(reg.camp.name).toBe('Camp Ete 2026');
      expect(reg.child.firstName).toBe('Jean');
      expect(reg.parent.email).toBe('marie@test.com');
      // 5 days: July 1-5 inclusive
      expect(reg.camp.daysCount).toBe(5);
      // totalAmount = daysCount * pricePerDay = 5 * 1500 = 7500
      expect(reg.totalAmount).toBe(7500);
      expect(reg.invoiceId).toBeNull();
    });

    it('should extract invoiceId from first invoice line', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      const reg = makeRegistrationWithIncludes();
      reg.invoiceLines = [{ invoiceId: INVOICE_ID }];
      mockPrisma.registration.findMany.mockResolvedValue([reg]);
      mockPrisma.registration.count.mockResolvedValue(1);

      const result = await caller.registrations.list(defaultInput);

      expect(result.registrations[0].invoiceId).toBe(INVOICE_ID);
    });

    it('should compute daysCount = 0 when camp dates are null', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      const reg = makeRegistrationWithIncludes();
      reg.camp.startDate = null as any;
      reg.camp.endDate = null as any;
      mockPrisma.registration.findMany.mockResolvedValue([reg]);
      mockPrisma.registration.count.mockResolvedValue(1);

      const result = await caller.registrations.list(defaultInput);

      expect(result.registrations[0].camp.daysCount).toBe(0);
      expect(result.registrations[0].totalAmount).toBe(0);
    });
  });

  describe('pagination', () => {
    it('should pass limit and offset to prisma', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.registration.findMany.mockResolvedValue([]);
      mockPrisma.registration.count.mockResolvedValue(100);

      await caller.registrations.list({ limit: 10, offset: 30 });

      const call = mockPrisma.registration.findMany.mock.calls[0][0];
      expect(call.take).toBe(10);
      expect(call.skip).toBe(30);
    });
  });
});

// ---------------------------------------------------------------------------
// registrations.getById
// ---------------------------------------------------------------------------

describe('registrations.getById', () => {
  it('should reject unauthenticated users', async () => {
    const { caller } = createTestCaller(null);
    await expect(caller.registrations.getById({ id: REG_ID })).rejects.toThrow(TRPCError);
  });

  it('should return null when registration not found', async () => {
    const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
    mockPrisma.registration.findFirst.mockResolvedValue(null);

    const result = await caller.registrations.getById({ id: REG_ID });
    expect(result).toBeNull();
  });

  it('should return registration with details', async () => {
    const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
    mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationWithIncludes());

    const result = await caller.registrations.getById({ id: REG_ID });
    expect(result).not.toBeNull();
    expect(result!.id).toBe(REG_ID);
    expect(result!.camp.name).toBe('Camp Ete 2026');
  });

  it('should restrict PARENT to their own registrations', async () => {
    const { caller, mockPrisma } = createTestCaller(PARENT_USER);
    mockPrisma.registration.findFirst.mockResolvedValue(null);

    await caller.registrations.getById({ id: REG_ID });

    const where = mockPrisma.registration.findFirst.mock.calls[0][0].where;
    expect(where.parentId).toBe(PARENT_USER.id);
  });

  it('should NOT restrict STAFF to specific parent', async () => {
    const { caller, mockPrisma } = createTestCaller(STAFF_USER);
    mockPrisma.registration.findFirst.mockResolvedValue(null);

    await caller.registrations.getById({ id: REG_ID });

    const where = mockPrisma.registration.findFirst.mock.calls[0][0].where;
    expect(where.parentId).toBeUndefined();
  });

  it('should always filter by deletedAt: null', async () => {
    const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
    mockPrisma.registration.findFirst.mockResolvedValue(null);

    await caller.registrations.getById({ id: REG_ID });

    const where = mockPrisma.registration.findFirst.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// registrations.create
// ---------------------------------------------------------------------------

describe('registrations.create', () => {
  const createInput = {
    campId: CAMP_ID,
    childId: CHILD_ID,
  };

  describe('access control', () => {
    it('should reject unauthenticated users', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.registrations.create(createInput)).rejects.toThrow(TRPCError);
    });

    it('should allow PARENT users', async () => {
      const { caller, mockPrisma } = createTestCaller(PARENT_USER);
      mockPrisma.childParent.findFirst.mockResolvedValue({ childId: CHILD_ID, parentId: PARENT_USER.id });
      mockPrisma.camp.findFirst.mockResolvedValue(makeCamp());
      mockPrisma.registration.findFirst.mockResolvedValue(null);
      mockPrisma.campDay.findMany.mockResolvedValue([{ id: CAMP_DAY_1 }, { id: CAMP_DAY_2 }]);
      mockPrisma.registration.create.mockResolvedValue(makeRegistrationRow({ status: 'PENDING' }));

      const result = await caller.registrations.create(createInput);
      expect(result.id).toBe(REG_ID);
    });
  });

  describe('business rules', () => {
    let caller: TestCaller['caller'];
    let mockPrisma: TestCaller['mockPrisma'];

    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(PARENT_USER));
    });

    it('should reject if child does not belong to parent', async () => {
      mockPrisma.childParent.findFirst.mockResolvedValue(null);

      await expect(caller.registrations.create(createInput)).rejects.toThrow(
        'Enfant non trouvé ou ne correspond pas au parent spécifié',
      );
    });

    it('should reject if camp is not found', async () => {
      mockPrisma.childParent.findFirst.mockResolvedValue({ childId: CHILD_ID, parentId: PARENT_USER.id });
      mockPrisma.camp.findFirst.mockResolvedValue(null);

      await expect(caller.registrations.create(createInput)).rejects.toThrow('Camp non trouvé');
    });

    it('should reject if camp is not PUBLISHED', async () => {
      mockPrisma.childParent.findFirst.mockResolvedValue({ childId: CHILD_ID, parentId: PARENT_USER.id });
      mockPrisma.camp.findFirst.mockResolvedValue(makeCamp({ status: 'DRAFT' }));

      await expect(caller.registrations.create(createInput)).rejects.toThrow(
        "Ce camp n'est pas encore ouvert aux inscriptions",
      );
    });

    it('should reject if registration deadline has passed', async () => {
      mockPrisma.childParent.findFirst.mockResolvedValue({ childId: CHILD_ID, parentId: PARENT_USER.id });
      mockPrisma.camp.findFirst.mockResolvedValue(makeCamp({ registrationDeadline: pastDate }));

      await expect(caller.registrations.create(createInput)).rejects.toThrow(
        "La date limite d'inscription est dépassée",
      );
    });

    it('should reject if child is already registered for this camp', async () => {
      mockPrisma.childParent.findFirst.mockResolvedValue({ childId: CHILD_ID, parentId: PARENT_USER.id });
      mockPrisma.camp.findFirst.mockResolvedValue(makeCamp());
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());

      await expect(caller.registrations.create(createInput)).rejects.toThrow(
        'Cet enfant est déjà inscrit à ce camp',
      );
    });

    it('should set status to PENDING when camp has capacity', async () => {
      mockPrisma.childParent.findFirst.mockResolvedValue({ childId: CHILD_ID, parentId: PARENT_USER.id });
      mockPrisma.camp.findFirst.mockResolvedValue(makeCamp({ maxCapacity: 30, _count: { registrations: 5 } }));
      mockPrisma.registration.findFirst.mockResolvedValue(null);
      mockPrisma.campDay.findMany.mockResolvedValue([{ id: CAMP_DAY_1 }]);
      mockPrisma.registration.create.mockResolvedValue(makeRegistrationRow({ status: 'PENDING' }));

      await caller.registrations.create(createInput);

      const createCall = mockPrisma.registration.create.mock.calls[0][0];
      expect(createCall.data.status).toBe('PENDING');
    });

    it('should set status to WAITLIST when camp is full', async () => {
      mockPrisma.childParent.findFirst.mockResolvedValue({ childId: CHILD_ID, parentId: PARENT_USER.id });
      mockPrisma.camp.findFirst.mockResolvedValue(makeCamp({ maxCapacity: 5, _count: { registrations: 5 } }));
      mockPrisma.registration.findFirst.mockResolvedValue(null);
      mockPrisma.campDay.findMany.mockResolvedValue([{ id: CAMP_DAY_1 }]);
      mockPrisma.registration.create.mockResolvedValue(makeRegistrationRow({ status: 'WAITLIST' }));

      await caller.registrations.create(createInput);

      const createCall = mockPrisma.registration.create.mock.calls[0][0];
      expect(createCall.data.status).toBe('WAITLIST');
    });

    it('should set status to WAITLIST when camp is over capacity', async () => {
      mockPrisma.childParent.findFirst.mockResolvedValue({ childId: CHILD_ID, parentId: PARENT_USER.id });
      mockPrisma.camp.findFirst.mockResolvedValue(makeCamp({ maxCapacity: 5, _count: { registrations: 10 } }));
      mockPrisma.registration.findFirst.mockResolvedValue(null);
      mockPrisma.campDay.findMany.mockResolvedValue([{ id: CAMP_DAY_1 }]);
      mockPrisma.registration.create.mockResolvedValue(makeRegistrationRow({ status: 'WAITLIST' }));

      await caller.registrations.create(createInput);

      const createCall = mockPrisma.registration.create.mock.calls[0][0];
      expect(createCall.data.status).toBe('WAITLIST');
    });

    it('should use current user id as parentId by default', async () => {
      mockPrisma.childParent.findFirst.mockResolvedValue({ childId: CHILD_ID, parentId: PARENT_USER.id });
      mockPrisma.camp.findFirst.mockResolvedValue(makeCamp());
      mockPrisma.registration.findFirst.mockResolvedValue(null);
      mockPrisma.campDay.findMany.mockResolvedValue([{ id: CAMP_DAY_1 }]);
      mockPrisma.registration.create.mockResolvedValue(makeRegistrationRow());

      await caller.registrations.create(createInput);

      const createCall = mockPrisma.registration.create.mock.calls[0][0];
      expect(createCall.data.parentId).toBe(PARENT_USER.id);
    });

    it('should set selectedDays from campDays', async () => {
      mockPrisma.childParent.findFirst.mockResolvedValue({ childId: CHILD_ID, parentId: PARENT_USER.id });
      mockPrisma.camp.findFirst.mockResolvedValue(makeCamp());
      mockPrisma.registration.findFirst.mockResolvedValue(null);
      mockPrisma.campDay.findMany.mockResolvedValue([{ id: CAMP_DAY_1 }, { id: CAMP_DAY_2 }]);
      mockPrisma.registration.create.mockResolvedValue(makeRegistrationRow());

      await caller.registrations.create(createInput);

      const createCall = mockPrisma.registration.create.mock.calls[0][0];
      expect(createCall.data.selectedDays).toEqual([CAMP_DAY_1, CAMP_DAY_2]);
    });

    it('should set paymentStatus to UNPAID', async () => {
      mockPrisma.childParent.findFirst.mockResolvedValue({ childId: CHILD_ID, parentId: PARENT_USER.id });
      mockPrisma.camp.findFirst.mockResolvedValue(makeCamp());
      mockPrisma.registration.findFirst.mockResolvedValue(null);
      mockPrisma.campDay.findMany.mockResolvedValue([{ id: CAMP_DAY_1 }]);
      mockPrisma.registration.create.mockResolvedValue(makeRegistrationRow());

      await caller.registrations.create(createInput);

      const createCall = mockPrisma.registration.create.mock.calls[0][0];
      expect(createCall.data.paymentStatus).toBe('UNPAID');
    });

    it('should pass specialRequirements when provided', async () => {
      mockPrisma.childParent.findFirst.mockResolvedValue({ childId: CHILD_ID, parentId: PARENT_USER.id });
      mockPrisma.camp.findFirst.mockResolvedValue(makeCamp());
      mockPrisma.registration.findFirst.mockResolvedValue(null);
      mockPrisma.campDay.findMany.mockResolvedValue([{ id: CAMP_DAY_1 }]);
      mockPrisma.registration.create.mockResolvedValue(makeRegistrationRow({ specialRequirements: 'Allergie arachides' }));

      await caller.registrations.create({ ...createInput, specialRequirements: 'Allergie arachides' });

      const createCall = mockPrisma.registration.create.mock.calls[0][0];
      expect(createCall.data.specialRequirements).toBe('Allergie arachides');
    });
  });
});

// ---------------------------------------------------------------------------
// registrations.createByStaff
// ---------------------------------------------------------------------------

describe('registrations.createByStaff', () => {
  const createByStaffInput = {
    campId: CAMP_ID,
    childId: CHILD_ID,
    parentId: PARENT_USER.id,
    status: 'CONFIRMED' as const,
  };

  describe('access control', () => {
    it('should reject unauthenticated users', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.registrations.createByStaff(createByStaffInput)).rejects.toThrow(TRPCError);
    });

    it('should reject PARENT users', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.registrations.createByStaff(createByStaffInput)).rejects.toThrow(TRPCError);
    });

    it('should allow STAFF users', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.childParent.findFirst.mockResolvedValue({ childId: CHILD_ID, parentId: PARENT_USER.id });
      mockPrisma.camp.findFirst.mockResolvedValue(makeCamp());
      mockPrisma.registration.findFirst.mockResolvedValue(null);
      mockPrisma.campDay.findMany.mockResolvedValue([{ id: CAMP_DAY_1 }]);
      mockPrisma.registration.create.mockResolvedValue(makeRegistrationRow({ status: 'CONFIRMED' }));

      const result = await caller.registrations.createByStaff(createByStaffInput);
      expect(result.id).toBe(REG_ID);
    });
  });

  describe('business rules', () => {
    let caller: TestCaller['caller'];
    let mockPrisma: TestCaller['mockPrisma'];

    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
    });

    it('should reject if child does not belong to specified parent', async () => {
      mockPrisma.childParent.findFirst.mockResolvedValue(null);

      await expect(caller.registrations.createByStaff(createByStaffInput)).rejects.toThrow(
        'Enfant non trouvé ou ne correspond pas au parent spécifié',
      );
    });

    it('should reject if camp does not exist', async () => {
      mockPrisma.childParent.findFirst.mockResolvedValue({ childId: CHILD_ID, parentId: PARENT_USER.id });
      mockPrisma.camp.findFirst.mockResolvedValue(null);

      await expect(caller.registrations.createByStaff(createByStaffInput)).rejects.toThrow('Camp non trouvé');
    });

    it('should reject if child is already registered', async () => {
      mockPrisma.childParent.findFirst.mockResolvedValue({ childId: CHILD_ID, parentId: PARENT_USER.id });
      mockPrisma.camp.findFirst.mockResolvedValue(makeCamp());
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());

      await expect(caller.registrations.createByStaff(createByStaffInput)).rejects.toThrow(
        'Cet enfant est déjà inscrit à ce camp',
      );
    });

    it('should allow staff to set initial status', async () => {
      mockPrisma.childParent.findFirst.mockResolvedValue({ childId: CHILD_ID, parentId: PARENT_USER.id });
      mockPrisma.camp.findFirst.mockResolvedValue(makeCamp());
      mockPrisma.registration.findFirst.mockResolvedValue(null);
      mockPrisma.campDay.findMany.mockResolvedValue([{ id: CAMP_DAY_1 }]);
      mockPrisma.registration.create.mockResolvedValue(makeRegistrationRow({ status: 'CONFIRMED' }));

      await caller.registrations.createByStaff(createByStaffInput);

      const createCall = mockPrisma.registration.create.mock.calls[0][0];
      expect(createCall.data.status).toBe('CONFIRMED');
    });

    it('should not check registration deadline (unlike parent create)', async () => {
      mockPrisma.childParent.findFirst.mockResolvedValue({ childId: CHILD_ID, parentId: PARENT_USER.id });
      // Camp with past deadline - should still work for staff
      mockPrisma.camp.findFirst.mockResolvedValue(makeCamp({ registrationDeadline: pastDate }));
      mockPrisma.registration.findFirst.mockResolvedValue(null);
      mockPrisma.campDay.findMany.mockResolvedValue([{ id: CAMP_DAY_1 }]);
      mockPrisma.registration.create.mockResolvedValue(makeRegistrationRow());

      const result = await caller.registrations.createByStaff(createByStaffInput);
      expect(result.id).toBe(REG_ID);
    });

    it('should set selectedDays from campDays', async () => {
      mockPrisma.childParent.findFirst.mockResolvedValue({ childId: CHILD_ID, parentId: PARENT_USER.id });
      mockPrisma.camp.findFirst.mockResolvedValue(makeCamp());
      mockPrisma.registration.findFirst.mockResolvedValue(null);
      mockPrisma.campDay.findMany.mockResolvedValue([{ id: CAMP_DAY_1 }, { id: CAMP_DAY_2 }]);
      mockPrisma.registration.create.mockResolvedValue(makeRegistrationRow());

      await caller.registrations.createByStaff(createByStaffInput);

      const createCall = mockPrisma.registration.create.mock.calls[0][0];
      expect(createCall.data.selectedDays).toEqual([CAMP_DAY_1, CAMP_DAY_2]);
    });
  });
});

// ---------------------------------------------------------------------------
// registrations.updateByStaff
// ---------------------------------------------------------------------------

describe('registrations.updateByStaff', () => {
  describe('access control', () => {
    it('should reject unauthenticated users', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.registrations.updateByStaff({ id: REG_ID, status: 'CONFIRMED' })).rejects.toThrow(TRPCError);
    });

    it('should reject PARENT users', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.registrations.updateByStaff({ id: REG_ID, status: 'CONFIRMED' })).rejects.toThrow(TRPCError);
    });

    it('should allow STAFF users', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.registration.update.mockResolvedValue(makeRegistrationRow({ status: 'CONFIRMED' }));

      const result = await caller.registrations.updateByStaff({ id: REG_ID, status: 'CONFIRMED' });
      expect(result.id).toBe(REG_ID);
    });
  });

  describe('business rules', () => {
    let caller: TestCaller['caller'];
    let mockPrisma: TestCaller['mockPrisma'];

    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
    });

    it('should throw NOT_FOUND when registration does not exist', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(null);

      await expect(caller.registrations.updateByStaff({ id: REG_ID, status: 'CONFIRMED' })).rejects.toThrow(
        'Inscription non trouvée',
      );
    });

    it('should reject update when paymentStatus is PAID', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow({ paymentStatus: 'PAID' }));

      await expect(caller.registrations.updateByStaff({ id: REG_ID, status: 'CANCELLED' })).rejects.toThrow(
        'Cette inscription a déjà été payée et ne peut plus être modifiée',
      );
    });

    it('should throw BAD_REQUEST when no modifications provided', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());

      await expect(caller.registrations.updateByStaff({ id: REG_ID })).rejects.toThrow(
        'Aucune modification fournie',
      );
    });

    it('should update status', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.registration.update.mockResolvedValue(makeRegistrationRow({ status: 'CANCELLED' }));

      await caller.registrations.updateByStaff({ id: REG_ID, status: 'CANCELLED' });

      const updateCall = mockPrisma.registration.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('CANCELLED');
    });

    it('should update specialRequirements', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.registration.update.mockResolvedValue(makeRegistrationRow({ specialRequirements: 'New req' }));

      await caller.registrations.updateByStaff({ id: REG_ID, specialRequirements: 'New req' });

      const updateCall = mockPrisma.registration.update.mock.calls[0][0];
      expect(updateCall.data.specialRequirements).toBe('New req');
    });
  });
});

// ---------------------------------------------------------------------------
// registrations.updateStatus
// ---------------------------------------------------------------------------

describe('registrations.updateStatus', () => {
  describe('access control', () => {
    it('should reject unauthenticated users', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.registrations.updateStatus({ id: REG_ID, status: 'CONFIRMED' })).rejects.toThrow(TRPCError);
    });

    it('should reject PARENT users', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.registrations.updateStatus({ id: REG_ID, status: 'CONFIRMED' })).rejects.toThrow(TRPCError);
    });

    it('should allow STAFF users', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow({ status: 'PENDING' }));
      mockPrisma.registration.update.mockResolvedValue(makeRegistrationRow({ status: 'CONFIRMED' }));

      const result = await caller.registrations.updateStatus({ id: REG_ID, status: 'CONFIRMED' });
      expect(result.status).toBe('CONFIRMED');
    });
  });

  describe('business rules', () => {
    let caller: TestCaller['caller'];
    let mockPrisma: TestCaller['mockPrisma'];

    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
    });

    it('should throw NOT_FOUND when registration does not exist', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(null);

      await expect(caller.registrations.updateStatus({ id: REG_ID, status: 'CONFIRMED' })).rejects.toThrow(
        'Inscription non trouvée',
      );
    });

    it('should reject when paymentStatus is PAID', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow({ paymentStatus: 'PAID' }));

      await expect(caller.registrations.updateStatus({ id: REG_ID, status: 'CANCELLED' })).rejects.toThrow(
        'Cette inscription a déjà été payée et ne peut plus être modifiée',
      );
    });

    it('should update to CONFIRMED status', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow({ status: 'PENDING' }));
      mockPrisma.registration.update.mockResolvedValue(makeRegistrationRow({ status: 'CONFIRMED' }));

      const result = await caller.registrations.updateStatus({ id: REG_ID, status: 'CONFIRMED' });

      expect(result.status).toBe('CONFIRMED');
      const updateCall = mockPrisma.registration.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('CONFIRMED');
    });

    it('should update to CANCELLED status', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.registration.update.mockResolvedValue(makeRegistrationRow({ status: 'CANCELLED' }));

      const result = await caller.registrations.updateStatus({ id: REG_ID, status: 'CANCELLED' });
      expect(result.status).toBe('CANCELLED');
    });

    it('should update to WAITLIST status', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.registration.update.mockResolvedValue(makeRegistrationRow({ status: 'WAITLIST' }));

      const result = await caller.registrations.updateStatus({ id: REG_ID, status: 'WAITLIST' });
      expect(result.status).toBe('WAITLIST');
    });
  });
});

// ---------------------------------------------------------------------------
// registrations.analyzeRegistrationStatus
// ---------------------------------------------------------------------------

describe('registrations.analyzeRegistrationStatus', () => {
  describe('access control', () => {
    it('should reject unauthenticated users', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.registrations.analyzeRegistrationStatus({ registrationId: REG_ID })).rejects.toThrow(TRPCError);
    });

    it('should reject PARENT users', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.registrations.analyzeRegistrationStatus({ registrationId: REG_ID })).rejects.toThrow(TRPCError);
    });

    it('should allow STAFF users', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      const result = await caller.registrations.analyzeRegistrationStatus({ registrationId: REG_ID });
      expect(result.suggestedCase).toBe('NO_INVOICE');
    });
  });

  describe('business rules', () => {
    let caller: TestCaller['caller'];
    let mockPrisma: TestCaller['mockPrisma'];

    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
    });

    it('should throw NOT_FOUND when registration does not exist', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(null);

      await expect(caller.registrations.analyzeRegistrationStatus({ registrationId: REG_ID })).rejects.toThrow(
        'Inscription non trouvée',
      );
    });

    it('should reject non-CONFIRMED registrations', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow({ status: 'PENDING' }));

      await expect(caller.registrations.analyzeRegistrationStatus({ registrationId: REG_ID })).rejects.toThrow(
        'Seules les inscriptions confirmées peuvent être analysées pour annulation',
      );
    });

    it('should return NO_INVOICE when no invoice exists', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      const result = await caller.registrations.analyzeRegistrationStatus({ registrationId: REG_ID });

      expect(result.suggestedCase).toBe('NO_INVOICE');
      expect(result.hasInvoice).toBe(false);
      expect(result.requiredSteps).toBe(2);
      expect(result.requiresRefundChoice).toBe(false);
      expect(result.requiresPaymentMethod).toBe(false);
    });

    it('should return DRAFT_INVOICE when invoice is DRAFT', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({ status: 'DRAFT', paidAmount: 0 }));

      const result = await caller.registrations.analyzeRegistrationStatus({ registrationId: REG_ID });

      expect(result.suggestedCase).toBe('DRAFT_INVOICE');
      expect(result.hasInvoice).toBe(true);
      expect(result.invoiceStatus).toBe('DRAFT');
      expect(result.requiredSteps).toBe(2);
    });

    it('should return SENT_UNPAID when invoice is SENT with no payment', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({ status: 'SENT', paidAmount: 0 }));

      const result = await caller.registrations.analyzeRegistrationStatus({ registrationId: REG_ID });

      expect(result.suggestedCase).toBe('SENT_UNPAID');
      expect(result.requiresRefundChoice).toBe(false);
    });

    it('should return PARTIALLY_PAID when paid amount is less than total', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({
        status: 'SENT',
        totalAmount: 7500,
        paidAmount: 3000,
      }));

      const result = await caller.registrations.analyzeRegistrationStatus({ registrationId: REG_ID });

      expect(result.suggestedCase).toBe('PARTIALLY_PAID');
      expect(result.totalAmount).toBe(7500);
      expect(result.paidAmount).toBe(3000);
      expect(result.requiredSteps).toBe(3);
      expect(result.requiresRefundChoice).toBe(true);
    });

    it('should return FULLY_PAID when paid amount equals total', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({
        status: 'PAID',
        totalAmount: 7500,
        paidAmount: 7500,
      }));

      const result = await caller.registrations.analyzeRegistrationStatus({ registrationId: REG_ID });

      expect(result.suggestedCase).toBe('FULLY_PAID');
      expect(result.requiredSteps).toBe(4);
      expect(result.requiresRefundChoice).toBe(true);
      expect(result.requiresPaymentMethod).toBe(true);
    });

    it('should return FULLY_PAID when paid amount exceeds total (overpayment)', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({
        status: 'PAID',
        totalAmount: 7500,
        paidAmount: 8000,
      }));

      const result = await caller.registrations.analyzeRegistrationStatus({ registrationId: REG_ID });

      expect(result.suggestedCase).toBe('FULLY_PAID');
    });
  });
});

// ---------------------------------------------------------------------------
// registrations.cancelWithAccounting
// ---------------------------------------------------------------------------

describe('registrations.cancelWithAccounting', () => {
  const cancelInput = {
    registrationId: REG_ID,
    reason: 'Annulation pour raison familiale',
  };

  describe('access control', () => {
    it('should reject unauthenticated users', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.registrations.cancelWithAccounting(cancelInput)).rejects.toThrow(TRPCError);
    });

    it('should reject PARENT users', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.registrations.cancelWithAccounting(cancelInput)).rejects.toThrow(TRPCError);
    });

    it('should allow STAFF users', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.invoice.findFirst.mockResolvedValue(null);
      mockPrisma.registration.update.mockResolvedValue(makeRegistrationRow({ status: 'CANCELLED' }));

      const result = await caller.registrations.cancelWithAccounting(cancelInput);
      expect(result.success).toBe(true);
    });
  });

  describe('business rules', () => {
    let caller: TestCaller['caller'];
    let mockPrisma: TestCaller['mockPrisma'];

    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
    });

    it('should throw NOT_FOUND when registration does not exist', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(null);

      await expect(caller.registrations.cancelWithAccounting(cancelInput)).rejects.toThrow(
        'Inscription non trouvée',
      );
    });

    it('should reject non-CONFIRMED registrations', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow({ status: 'PENDING' }));

      await expect(caller.registrations.cancelWithAccounting(cancelInput)).rejects.toThrow(
        'Seules les inscriptions confirmées peuvent être annulées avec gestion comptable',
      );
    });

    it('should handle NO_INVOICE case (cancel registration only)', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.invoice.findFirst.mockResolvedValue(null);
      mockPrisma.registration.update.mockResolvedValue(makeRegistrationRow({ status: 'CANCELLED' }));

      const result = await caller.registrations.cancelWithAccounting(cancelInput);

      expect(result.success).toBe(true);
      expect(result.case).toBe('NO_INVOICE');
      expect(result.invoice).toBeNull();
      expect(result.creditNote).toBeNull();
      expect(result.refund).toBeNull();
    });

    it('should handle DRAFT_INVOICE case (soft-delete invoice)', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({ status: 'DRAFT', paidAmount: 0 }));
      mockPrisma.invoice.update.mockResolvedValue(makeInvoice({ status: 'DRAFT', deletedAt: new Date() }));
      mockPrisma.registration.update.mockResolvedValue(makeRegistrationRow({ status: 'CANCELLED' }));

      const result = await caller.registrations.cancelWithAccounting(cancelInput);

      expect(result.success).toBe(true);
      expect(result.case).toBe('DRAFT_INVOICE');
      expect(result.invoice).not.toBeNull();
      expect(result.creditNote).toBeNull();

      // Should soft-delete the invoice
      const invoiceUpdateCall = mockPrisma.invoice.update.mock.calls[0][0];
      expect(invoiceUpdateCall.where.id).toBe(INVOICE_ID);
      expect(invoiceUpdateCall.data.deletedAt).toBeInstanceOf(Date);
    });

    it('should handle SENT_UNPAID case (cancel invoice)', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({ status: 'SENT', paidAmount: 0 }));
      mockPrisma.invoice.update.mockResolvedValue(makeInvoice({ status: 'CANCELLED' }));
      mockPrisma.registration.update.mockResolvedValue(makeRegistrationRow({ status: 'CANCELLED' }));

      const result = await caller.registrations.cancelWithAccounting(cancelInput);

      expect(result.success).toBe(true);
      expect(result.case).toBe('SENT_UNPAID');

      // Should cancel the invoice (set status to CANCELLED)
      const invoiceUpdateCall = mockPrisma.invoice.update.mock.calls[0][0];
      expect(invoiceUpdateCall.data.status).toBe('CANCELLED');
    });

    it('should handle PARTIALLY_PAID case (create credit note + refund)', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({
        status: 'SENT',
        totalAmount: 7500,
        paidAmount: 3000,
      }));
      mockPrisma.invoice.create.mockResolvedValue({
        id: 'd1a00000-0000-4000-a000-000000000099',
        invoiceNumber: 'AVO-2026-0001',
        totalAmount: -7500,
      });
      mockPrisma.payment.findMany.mockResolvedValue([{
        id: PAYMENT_ID,
        amount: 3000,
        paymentDate: now,
        refunds: [],
      }]);
      mockPrisma.refund.create.mockResolvedValue({
        id: REFUND_ID,
        amount: 3000,
        refundMethod: 'IMMEDIATE_REFUND',
      });
      mockPrisma.registration.update.mockResolvedValue(makeRegistrationRow({ status: 'CANCELLED' }));

      const result = await caller.registrations.cancelWithAccounting(cancelInput);

      expect(result.success).toBe(true);
      expect(result.case).toBe('PARTIALLY_PAID');
      expect(result.creditNote).not.toBeNull();
      expect(result.refund).not.toBeNull();
    });

    it('should handle FULLY_PAID with IMMEDIATE_REFUND choice', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({
        status: 'PAID',
        totalAmount: 7500,
        paidAmount: 7500,
      }));
      mockPrisma.invoice.create.mockResolvedValue({
        id: 'd1a00000-0000-4000-a000-000000000099',
        invoiceNumber: 'AVO-2026-0001',
        totalAmount: -7500,
      });
      mockPrisma.payment.findMany.mockResolvedValue([{
        id: PAYMENT_ID,
        amount: 7500,
        paymentDate: now,
        refunds: [],
      }]);
      mockPrisma.refund.create.mockResolvedValue({
        id: REFUND_ID,
        amount: 7500,
        refundMethod: 'IMMEDIATE_REFUND',
      });
      mockPrisma.registration.update.mockResolvedValue(makeRegistrationRow({ status: 'CANCELLED' }));

      const result = await caller.registrations.cancelWithAccounting({
        ...cancelInput,
        refundChoice: 'IMMEDIATE_REFUND',
      });

      expect(result.success).toBe(true);
      expect(result.case).toBe('FULLY_PAID_REFUND');
      expect(result.creditNote).not.toBeNull();
      expect(result.refund).not.toBeNull();
    });

    it('should handle FULLY_PAID with FUTURE_CREDIT choice', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({
        status: 'PAID',
        totalAmount: 7500,
        paidAmount: 7500,
      }));
      mockPrisma.invoice.create.mockResolvedValue({
        id: 'd1a00000-0000-4000-a000-000000000099',
        invoiceNumber: 'AVO-2026-0001',
        totalAmount: -7500,
        isFutureCredit: true,
      });
      mockPrisma.parentCredit.create.mockResolvedValue({});
      mockPrisma.registration.update.mockResolvedValue(makeRegistrationRow({ status: 'CANCELLED' }));

      const result = await caller.registrations.cancelWithAccounting({
        ...cancelInput,
        refundChoice: 'FUTURE_CREDIT',
      });

      expect(result.success).toBe(true);
      expect(result.case).toBe('FULLY_PAID_CREDIT');
      expect(result.creditNote).not.toBeNull();
      expect(result.refund).toBeNull(); // No refund for future credit

      // Verify parentCredit is created for future credit
      expect(mockPrisma.parentCredit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            creditNoteId: 'd1a00000-0000-4000-a000-000000000099',
            amountOriginal: 7500,
            amountRemaining: 7500,
            notes: 'Credit automatique suite a annulation',
          }),
        }),
      );
    });

    it('should default to IMMEDIATE_REFUND when no refundChoice for fully paid', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({
        status: 'PAID',
        totalAmount: 7500,
        paidAmount: 7500,
      }));
      mockPrisma.invoice.create.mockResolvedValue({
        id: 'd1a00000-0000-4000-a000-000000000099',
        invoiceNumber: 'AVO-2026-0001',
        totalAmount: -7500,
      });
      mockPrisma.payment.findMany.mockResolvedValue([{
        id: PAYMENT_ID,
        amount: 7500,
        paymentDate: now,
        refunds: [],
      }]);
      mockPrisma.refund.create.mockResolvedValue({
        id: REFUND_ID,
        amount: 7500,
        refundMethod: 'IMMEDIATE_REFUND',
      });
      mockPrisma.registration.update.mockResolvedValue(makeRegistrationRow({ status: 'CANCELLED' }));

      const result = await caller.registrations.cancelWithAccounting(cancelInput);

      expect(result.case).toBe('FULLY_PAID_REFUND');
    });

    it('should cancel the registration in all cases', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.invoice.findFirst.mockResolvedValue(null);
      mockPrisma.registration.update.mockResolvedValue(makeRegistrationRow({ status: 'CANCELLED' }));

      await caller.registrations.cancelWithAccounting(cancelInput);

      const updateCall = mockPrisma.registration.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('CANCELLED');
      expect(updateCall.data.cancellationReason).toBe('Annulation pour raison familiale');
      expect(updateCall.data.cancellationDate).toBeInstanceOf(Date);
      expect(updateCall.data.cancelledBy).toBe(STAFF_USER.id);
    });

    it('should run within a transaction', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow());
      mockPrisma.invoice.findFirst.mockResolvedValue(null);
      mockPrisma.registration.update.mockResolvedValue(makeRegistrationRow({ status: 'CANCELLED' }));

      await caller.registrations.cancelWithAccounting(cancelInput);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should reject reason shorter than 10 characters', async () => {
      await expect(caller.registrations.cancelWithAccounting({
        registrationId: REG_ID,
        reason: 'court',
      })).rejects.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// registrations.delete
// ---------------------------------------------------------------------------

describe('registrations.delete', () => {
  describe('access control', () => {
    it('should reject unauthenticated users', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.registrations.delete({ id: REG_ID })).rejects.toThrow(TRPCError);
    });

    it('should reject PARENT users', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.registrations.delete({ id: REG_ID })).rejects.toThrow(TRPCError);
    });

    it('should reject STAFF users (even ANIMATOR)', async () => {
      const { caller } = createTestCaller(STAFF_USER);
      await expect(caller.registrations.delete({ id: REG_ID })).rejects.toThrow(TRPCError);
    });

    it('should allow ADMIN users', async () => {
      const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow({ paymentStatus: 'UNPAID' }));
      mockPrisma.invoiceLine.findFirst.mockResolvedValue(null);
      mockPrisma.registration.update.mockResolvedValue(makeRegistrationRow({ deletedAt: new Date() }));

      const result = await caller.registrations.delete({ id: REG_ID });
      expect(result.success).toBe(true);
    });
  });

  describe('business rules', () => {
    let caller: TestCaller['caller'];
    let mockPrisma: TestCaller['mockPrisma'];

    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
    });

    it('should throw NOT_FOUND when registration does not exist', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(null);

      await expect(caller.registrations.delete({ id: REG_ID })).rejects.toThrow('Inscription non trouvée');
    });

    it('should reject deletion when paymentStatus is PAID', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow({ paymentStatus: 'PAID' }));

      await expect(caller.registrations.delete({ id: REG_ID })).rejects.toThrow(
        'Cette inscription a déjà été payée et ne peut plus être supprimée',
      );
    });

    it('should reject deletion when invoices exist', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow({ paymentStatus: 'UNPAID' }));
      mockPrisma.invoiceLine.findFirst.mockResolvedValue({ id: 'some-line-id' });

      await expect(caller.registrations.delete({ id: REG_ID })).rejects.toThrow(
        'Impossible de supprimer cette inscription : une facture existe',
      );
    });

    it('should soft-delete registration (set deletedAt)', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow({ paymentStatus: 'UNPAID' }));
      mockPrisma.invoiceLine.findFirst.mockResolvedValue(null);
      mockPrisma.registration.update.mockResolvedValue(makeRegistrationRow({ deletedAt: new Date() }));

      const result = await caller.registrations.delete({ id: REG_ID });

      expect(result.success).toBe(true);
      const updateCall = mockPrisma.registration.update.mock.calls[0][0];
      expect(updateCall.where.id).toBe(REG_ID);
      expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
    });

    it('should check invoiceLines with deletedAt: null and non-deleted invoice', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistrationRow({ paymentStatus: 'UNPAID' }));
      mockPrisma.invoiceLine.findFirst.mockResolvedValue(null);
      mockPrisma.registration.update.mockResolvedValue(makeRegistrationRow({ deletedAt: new Date() }));

      await caller.registrations.delete({ id: REG_ID });

      const invoiceLineCall = mockPrisma.invoiceLine.findFirst.mock.calls[0][0];
      expect(invoiceLineCall.where.registrationId).toBe(REG_ID);
      expect(invoiceLineCall.where.deletedAt).toBeNull();
      expect(invoiceLineCall.where.invoice.deletedAt).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// registrations.getAvailableCredits
// ---------------------------------------------------------------------------

describe('registrations.getAvailableCredits', () => {
  describe('access control', () => {
    it('should reject unauthenticated users', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.registrations.getAvailableCredits({ parentId: PARENT_USER.id })).rejects.toThrow(TRPCError);
    });

    it('should allow PARENT users', async () => {
      const { caller, mockPrisma } = createTestCaller(PARENT_USER);
      mockPrisma.parentCredit.findMany.mockResolvedValue([]);

      const result = await caller.registrations.getAvailableCredits({ parentId: PARENT_USER.id });
      expect(result.credits).toHaveLength(0);
      expect(result.totalAvailable).toBe(0);
    });

    it('should allow STAFF users', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.parentCredit.findMany.mockResolvedValue([]);

      const result = await caller.registrations.getAvailableCredits({ parentId: PARENT_USER.id });
      expect(result.totalAvailable).toBe(0);
    });
  });

  describe('business rules', () => {
    it('should return mapped credits with computed daysUntilExpiry', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      const expiresAt = new Date('2027-03-07T00:00:00Z');
      mockPrisma.parentCredit.findMany.mockResolvedValue([{
        id: CREDIT_ID,
        creditNoteId: INVOICE_ID,
        parentId: PARENT_USER.id,
        amountOriginal: 7500,
        amountRemaining: 5000,
        expiresAt,
        createdAt: now,
        creditNote: { invoiceNumber: 'AVO-2026-0001' },
      }]);

      const result = await caller.registrations.getAvailableCredits({ parentId: PARENT_USER.id });

      expect(result.credits).toHaveLength(1);
      expect(result.credits[0].creditId).toBe(CREDIT_ID);
      expect(result.credits[0].creditNoteNumber).toBe('AVO-2026-0001');
      expect(result.credits[0].amountOriginal).toBe(7500);
      expect(result.credits[0].amountRemaining).toBe(5000);
      expect(result.credits[0].daysUntilExpiry).toBeTypeOf('number');
      expect(result.totalAvailable).toBe(5000);
    });

    it('should return daysUntilExpiry as null when no expiration', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.parentCredit.findMany.mockResolvedValue([{
        id: CREDIT_ID,
        creditNoteId: INVOICE_ID,
        parentId: PARENT_USER.id,
        amountOriginal: 3000,
        amountRemaining: 3000,
        expiresAt: null,
        createdAt: now,
        creditNote: { invoiceNumber: 'AVO-2026-0002' },
      }]);

      const result = await caller.registrations.getAvailableCredits({ parentId: PARENT_USER.id });

      expect(result.credits[0].daysUntilExpiry).toBeNull();
    });

    it('should sum totalAvailable from all credits', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.parentCredit.findMany.mockResolvedValue([
        {
          id: CREDIT_ID,
          creditNoteId: INVOICE_ID,
          parentId: PARENT_USER.id,
          amountOriginal: 5000,
          amountRemaining: 3000,
          expiresAt: null,
          createdAt: now,
          creditNote: { invoiceNumber: 'AVO-2026-0001' },
        },
        {
          id: 'b1a00000-0000-4000-a000-000000000002',
          creditNoteId: 'a1a00000-0000-4000-a000-000000000002',
          parentId: PARENT_USER.id,
          amountOriginal: 2000,
          amountRemaining: 2000,
          expiresAt: null,
          createdAt: now,
          creditNote: { invoiceNumber: 'AVO-2026-0002' },
        },
      ]);

      const result = await caller.registrations.getAvailableCredits({ parentId: PARENT_USER.id });

      expect(result.totalAvailable).toBe(5000); // 3000 + 2000
    });

    it('should only query non-expired credits with remaining balance', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.parentCredit.findMany.mockResolvedValue([]);

      await caller.registrations.getAvailableCredits({ parentId: PARENT_USER.id });

      const call = mockPrisma.parentCredit.findMany.mock.calls[0][0];
      expect(call.where.parentId).toBe(PARENT_USER.id);
      expect(call.where.amountRemaining).toEqual({ gt: 0 });
      expect(call.where.creditNote.deletedAt).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// registrations.applyCredit
// ---------------------------------------------------------------------------

describe('registrations.applyCredit', () => {
  const applyCreditInput = {
    parentCreditId: CREDIT_ID,
    registrationId: REG_ID,
    amount: 3000,
    notes: 'Application de credit',
  };

  describe('access control', () => {
    it('should reject unauthenticated users', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.registrations.applyCredit(applyCreditInput)).rejects.toThrow(TRPCError);
    });

    it('should reject PARENT users', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.registrations.applyCredit(applyCreditInput)).rejects.toThrow(TRPCError);
    });

    it('should allow STAFF users', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{
        id: CREDIT_ID,
        amount_remaining: 5000,
        expires_at: null,
      }]);
      mockPrisma.parentCredit.update.mockResolvedValue({ id: CREDIT_ID });
      mockPrisma.creditApplication.create.mockResolvedValue({ id: CREDIT_APP_ID });

      const result = await caller.registrations.applyCredit(applyCreditInput);
      expect(result.success).toBe(true);
      expect(result.remainingCredit).toBe(2000); // 5000 - 3000
    });
  });

  describe('business rules', () => {
    let caller: TestCaller['caller'];
    let mockPrisma: TestCaller['mockPrisma'];

    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
    });

    it('should throw NOT_FOUND when credit does not exist', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      await expect(caller.registrations.applyCredit(applyCreditInput)).rejects.toThrow('Crédit non trouvé');
    });

    it('should reject when amount exceeds remaining credit', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{
        id: CREDIT_ID,
        amount_remaining: 1000,
        expires_at: null,
      }]);

      await expect(caller.registrations.applyCredit(applyCreditInput)).rejects.toThrow('Montant insuffisant');
    });

    it('should reject when credit is expired', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{
        id: CREDIT_ID,
        amount_remaining: 5000,
        expires_at: pastDate,
      }]);

      await expect(caller.registrations.applyCredit(applyCreditInput)).rejects.toThrow('Crédit expiré');
    });

    it('should update remaining balance and create credit application', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{
        id: CREDIT_ID,
        amount_remaining: 5000,
        expires_at: null,
      }]);
      mockPrisma.parentCredit.update.mockResolvedValue({ id: CREDIT_ID });
      mockPrisma.creditApplication.create.mockResolvedValue({ id: CREDIT_APP_ID });

      const result = await caller.registrations.applyCredit(applyCreditInput);

      expect(result.success).toBe(true);
      expect(result.remainingCredit).toBe(2000);
      expect(result.errorMessage).toBeNull();

      // Verify credit update
      const updateCall = mockPrisma.parentCredit.update.mock.calls[0][0];
      expect(updateCall.data.amountRemaining).toBe(2000);

      // Verify credit application creation
      const createCall = mockPrisma.creditApplication.create.mock.calls[0][0];
      expect(createCall.data.parentCreditId).toBe(CREDIT_ID);
      expect(createCall.data.registrationId).toBe(REG_ID);
      expect(createCall.data.amountUsed).toBe(3000);
      expect(createCall.data.appliedBy).toBe(STAFF_USER.id);
      expect(createCall.data.notes).toBe('Application de credit');
    });

    it('should run within a transaction', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{
        id: CREDIT_ID,
        amount_remaining: 5000,
        expires_at: null,
      }]);
      mockPrisma.parentCredit.update.mockResolvedValue({ id: CREDIT_ID });
      mockPrisma.creditApplication.create.mockResolvedValue({ id: CREDIT_APP_ID });

      await caller.registrations.applyCredit(applyCreditInput);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should accept invoiceId instead of registrationId', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{
        id: CREDIT_ID,
        amount_remaining: 5000,
        expires_at: null,
      }]);
      mockPrisma.parentCredit.update.mockResolvedValue({ id: CREDIT_ID });
      mockPrisma.creditApplication.create.mockResolvedValue({ id: CREDIT_APP_ID });
      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: INVOICE_ID,
        paidAmount: 0,
        totalAmount: 10000,
      });
      mockPrisma.invoice.update.mockResolvedValue({});

      const result = await caller.registrations.applyCredit({
        parentCreditId: CREDIT_ID,
        invoiceId: INVOICE_ID,
        amount: 2000,
      });

      expect(result.success).toBe(true);

      const createCall = mockPrisma.creditApplication.create.mock.calls[0][0];
      expect(createCall.data.invoiceId).toBe(INVOICE_ID);
      expect(createCall.data.registrationId).toBeNull();

      // Verify invoice paidAmount was updated
      expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: INVOICE_ID },
          data: expect.objectContaining({ paidAmount: 2000 }),
        }),
      );
    });

    it('should reject when neither registrationId nor invoiceId is provided', async () => {
      await expect(caller.registrations.applyCredit({
        parentCreditId: CREDIT_ID,
        amount: 1000,
      })).rejects.toThrow();
    });

    it('should accept credit with null expiresAt (no expiry)', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{
        id: CREDIT_ID,
        amount_remaining: 5000,
        expires_at: null,
      }]);
      mockPrisma.parentCredit.update.mockResolvedValue({ id: CREDIT_ID });
      mockPrisma.creditApplication.create.mockResolvedValue({ id: CREDIT_APP_ID });

      const result = await caller.registrations.applyCredit(applyCreditInput);
      expect(result.success).toBe(true);
    });

    it('should accept credit with future expiry date', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{
        id: CREDIT_ID,
        amount_remaining: 5000,
        expires_at: futureDate,
      }]);
      mockPrisma.parentCredit.update.mockResolvedValue({ id: CREDIT_ID });
      mockPrisma.creditApplication.create.mockResolvedValue({ id: CREDIT_APP_ID });

      const result = await caller.registrations.applyCredit(applyCreditInput);
      expect(result.success).toBe(true);
    });

    it('should set notes to null when not provided', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{
        id: CREDIT_ID,
        amount_remaining: 5000,
        expires_at: null,
      }]);
      mockPrisma.parentCredit.update.mockResolvedValue({ id: CREDIT_ID });
      mockPrisma.creditApplication.create.mockResolvedValue({ id: CREDIT_APP_ID });

      await caller.registrations.applyCredit({
        parentCreditId: CREDIT_ID,
        registrationId: REG_ID,
        amount: 1000,
      });

      const createCall = mockPrisma.creditApplication.create.mock.calls[0][0];
      expect(createCall.data.notes).toBeNull();
    });
  });
});
