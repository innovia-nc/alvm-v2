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

const CAMP_ID = 'd1a00000-0000-4000-a000-000000000020';
const REG_ID = 'd1a00000-0000-4000-a000-000000000030';
const REG_ID_2 = 'd1a00000-0000-4000-a000-000000000031';
const ATTENDANCE_ID = 'd1a00000-0000-4000-a000-000000000040';
const CHILD_ID = 'd1a00000-0000-4000-a000-000000000050';

const campStartDate = new Date('2026-07-01T00:00:00Z');
const campEndDate = new Date('2026-07-10T00:00:00Z');
const attDate = new Date('2026-07-05T00:00:00Z');
const now = new Date('2026-03-07T00:00:00Z');

function makeAttendanceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ATTENDANCE_ID,
    registrationId: REG_ID,
    attendanceDate: attDate,
    status: 'PRESENT',
    arrivalTime: new Date('1970-01-01T08:00:00Z'),
    departureTime: new Date('1970-01-01T16:00:00Z'),
    notes: null,
    recordedBy: STAFF_USER.id,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeAttendanceWithIncludes(overrides: Record<string, unknown> = {}) {
  const base = makeAttendanceRow(overrides);
  return {
    ...base,
    registration: {
      child: { id: CHILD_ID, firstName: 'Jean', lastName: 'Dupont' },
      camp: { id: CAMP_ID, name: 'Camp Ete 2026' },
    },
    recorder: {
      role: 'STAFF',
      name: 'Test Staff',
      staffMember: { firstName: 'Staff', lastName: 'Member' },
    },
  };
}

function makeRegistration(overrides: Record<string, unknown> = {}) {
  return {
    id: REG_ID,
    campId: CAMP_ID,
    childId: CHILD_ID,
    parentId: PARENT_USER.id,
    status: 'CONFIRMED',
    deletedAt: null,
    camp: { startDate: campStartDate, endDate: campEndDate },
    child: { id: CHILD_ID, firstName: 'Jean', lastName: 'Dupont' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// attendances.getGridForCamp
// ---------------------------------------------------------------------------

describe('attendances.getGridForCamp', () => {
  describe('access control', () => {
    it('should reject unauthenticated users', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.attendances.getGridForCamp({ campId: CAMP_ID })).rejects.toThrow(TRPCError);
    });

    it('should reject PARENT users', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.attendances.getGridForCamp({ campId: CAMP_ID })).rejects.toThrow(TRPCError);
    });

    it('should allow STAFF users', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.camp.findFirst.mockResolvedValue({
        startDate: campStartDate,
        endDate: campEndDate,
      });
      mockPrisma.registration.findMany.mockResolvedValue([]);

      const result = await caller.attendances.getGridForCamp({ campId: CAMP_ID });
      expect(result.campId).toBe(CAMP_ID);
    });

    it('should allow ADMIN users', async () => {
      const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
      mockPrisma.camp.findFirst.mockResolvedValue({
        startDate: campStartDate,
        endDate: campEndDate,
      });
      mockPrisma.registration.findMany.mockResolvedValue([]);

      const result = await caller.attendances.getGridForCamp({ campId: CAMP_ID });
      expect(result.campId).toBe(CAMP_ID);
    });
  });

  describe('business rules', () => {
    let caller: TestCaller['caller'];
    let mockPrisma: TestCaller['mockPrisma'];

    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
    });

    it('should throw NOT_FOUND when camp does not exist', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue(null);

      await expect(caller.attendances.getGridForCamp({ campId: CAMP_ID })).rejects.toThrow('Camp non trouve');
    });

    it('should generate dates from startDate to endDate inclusive', async () => {
      const start = new Date('2026-07-01T00:00:00Z');
      const end = new Date('2026-07-03T00:00:00Z');
      mockPrisma.camp.findFirst.mockResolvedValue({ startDate: start, endDate: end });
      mockPrisma.registration.findMany.mockResolvedValue([]);

      const result = await caller.attendances.getGridForCamp({ campId: CAMP_ID });
      expect(result.dates).toHaveLength(3); // July 1, 2, 3
    });

    it('should generate a single date when start equals end', async () => {
      const sameDay = new Date('2026-07-05T00:00:00Z');
      mockPrisma.camp.findFirst.mockResolvedValue({ startDate: sameDay, endDate: sameDay });
      mockPrisma.registration.findMany.mockResolvedValue([]);

      const result = await caller.attendances.getGridForCamp({ campId: CAMP_ID });
      expect(result.dates).toHaveLength(1);
    });

    it('should build grid with children and their attendances', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue({
        startDate: new Date('2026-07-01T00:00:00Z'),
        endDate: new Date('2026-07-02T00:00:00Z'),
      });
      mockPrisma.registration.findMany.mockResolvedValue([
        makeRegistration(),
      ]);
      mockPrisma.attendance.findMany.mockResolvedValue([
        makeAttendanceRow({ attendanceDate: new Date('2026-07-01T00:00:00Z') }),
      ]);

      const result = await caller.attendances.getGridForCamp({ campId: CAMP_ID });

      expect(result.children).toHaveLength(1);
      expect(result.children[0].childId).toBe(CHILD_ID);
      expect(result.children[0].firstName).toBe('Jean');
      expect(result.children[0].attendances).toHaveLength(2); // 2 dates
      // First date has attendance
      expect(result.children[0].attendances[0].status).toBe('PRESENT');
      // Second date has no attendance
      expect(result.children[0].attendances[1].status).toBeNull();
    });

    it('should not query attendances when no registrations exist', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue({
        startDate: campStartDate,
        endDate: campEndDate,
      });
      mockPrisma.registration.findMany.mockResolvedValue([]);

      const result = await caller.attendances.getGridForCamp({ campId: CAMP_ID });

      expect(result.children).toHaveLength(0);
      expect(mockPrisma.attendance.findMany).not.toHaveBeenCalled();
    });

    it('should convert arrivalTime/departureTime to HH:mm strings', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue({
        startDate: new Date('2026-07-05T00:00:00Z'),
        endDate: new Date('2026-07-05T00:00:00Z'),
      });
      mockPrisma.registration.findMany.mockResolvedValue([makeRegistration()]);
      mockPrisma.attendance.findMany.mockResolvedValue([
        makeAttendanceRow({
          attendanceDate: new Date('2026-07-05T00:00:00Z'),
          arrivalTime: new Date('1970-01-01T08:30:00Z'),
          departureTime: new Date('1970-01-01T17:15:00Z'),
        }),
      ]);

      const result = await caller.attendances.getGridForCamp({ campId: CAMP_ID });

      const att = result.children[0].attendances[0];
      expect(att.arrivalTime).toBe('08:30');
      expect(att.departureTime).toBe('17:15');
    });

    it('should return null times when attendance has no arrival/departure', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue({
        startDate: new Date('2026-07-05T00:00:00Z'),
        endDate: new Date('2026-07-05T00:00:00Z'),
      });
      mockPrisma.registration.findMany.mockResolvedValue([makeRegistration()]);
      mockPrisma.attendance.findMany.mockResolvedValue([
        makeAttendanceRow({
          attendanceDate: new Date('2026-07-05T00:00:00Z'),
          arrivalTime: null,
          departureTime: null,
        }),
      ]);

      const result = await caller.attendances.getGridForCamp({ campId: CAMP_ID });

      const att = result.children[0].attendances[0];
      expect(att.arrivalTime).toBeNull();
      expect(att.departureTime).toBeNull();
    });

    it('should only query CONFIRMED and non-deleted registrations', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue({
        startDate: campStartDate,
        endDate: campEndDate,
      });
      mockPrisma.registration.findMany.mockResolvedValue([]);

      await caller.attendances.getGridForCamp({ campId: CAMP_ID });

      const call = mockPrisma.registration.findMany.mock.calls[0][0];
      expect(call.where.status).toBe('CONFIRMED');
      expect(call.where.deletedAt).toBeNull();
    });

    it('should map attendance to correct registration via composite key', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue({
        startDate: new Date('2026-07-01T00:00:00Z'),
        endDate: new Date('2026-07-01T00:00:00Z'),
      });
      const reg1 = makeRegistration({ id: REG_ID });
      const reg2 = makeRegistration({
        id: REG_ID_2,
        child: { id: 'd1a00000-0000-4000-a000-000000000051', firstName: 'Marie', lastName: 'Martin' },
      });
      mockPrisma.registration.findMany.mockResolvedValue([reg1, reg2]);
      mockPrisma.attendance.findMany.mockResolvedValue([
        makeAttendanceRow({
          registrationId: REG_ID_2,
          attendanceDate: new Date('2026-07-01T00:00:00Z'),
          status: 'ABSENT',
        }),
      ]);

      const result = await caller.attendances.getGridForCamp({ campId: CAMP_ID });

      // First child (REG_ID) should have null attendance
      expect(result.children[0].attendances[0].status).toBeNull();
      // Second child (REG_ID_2) should have ABSENT
      expect(result.children[1].attendances[0].status).toBe('ABSENT');
    });
  });
});

// ---------------------------------------------------------------------------
// attendances.list
// ---------------------------------------------------------------------------

describe('attendances.list', () => {
  const defaultInput = { limit: 20, offset: 0 };

  describe('access control', () => {
    it('should reject unauthenticated users', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.attendances.list(defaultInput)).rejects.toThrow(TRPCError);
    });

    it('should allow PARENT users (restricted to own registrations)', async () => {
      const { caller, mockPrisma } = createTestCaller(PARENT_USER);
      mockPrisma.attendance.findMany.mockResolvedValue([]);
      mockPrisma.attendance.count.mockResolvedValue(0);

      const result = await caller.attendances.list(defaultInput);
      expect(result).toEqual({ attendances: [], total: 0 });
    });

    it('should allow STAFF users', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.attendance.findMany.mockResolvedValue([]);
      mockPrisma.attendance.count.mockResolvedValue(0);

      const result = await caller.attendances.list(defaultInput);
      expect(result).toEqual({ attendances: [], total: 0 });
    });

    it('should allow ADMIN users', async () => {
      const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
      mockPrisma.attendance.findMany.mockResolvedValue([]);
      mockPrisma.attendance.count.mockResolvedValue(0);

      const result = await caller.attendances.list(defaultInput);
      expect(result).toEqual({ attendances: [], total: 0 });
    });
  });

  describe('PARENT visibility filter', () => {
    it('should restrict PARENT to their own registrations via parentId', async () => {
      const { caller, mockPrisma } = createTestCaller(PARENT_USER);
      mockPrisma.attendance.findMany.mockResolvedValue([]);
      mockPrisma.attendance.count.mockResolvedValue(0);

      await caller.attendances.list(defaultInput);

      const where = mockPrisma.attendance.findMany.mock.calls[0][0].where;
      expect(where.registration).toBeDefined();
      expect(where.registration.parentId).toBe(PARENT_USER.id);
    });

    it('should NOT restrict STAFF to specific registrations', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.attendance.findMany.mockResolvedValue([]);
      mockPrisma.attendance.count.mockResolvedValue(0);

      await caller.attendances.list(defaultInput);

      const where = mockPrisma.attendance.findMany.mock.calls[0][0].where;
      expect(where.registration).toBeUndefined();
    });
  });

  describe('filtering', () => {
    let caller: TestCaller['caller'];
    let mockPrisma: TestCaller['mockPrisma'];

    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
      mockPrisma.attendance.findMany.mockResolvedValue([]);
      mockPrisma.attendance.count.mockResolvedValue(0);
    });

    it('should filter by campId through registration', async () => {
      await caller.attendances.list({ ...defaultInput, campId: CAMP_ID });

      const where = mockPrisma.attendance.findMany.mock.calls[0][0].where;
      expect(where.registration).toBeDefined();
      expect(where.registration.campId).toBe(CAMP_ID);
    });

    it('should filter by registrationId', async () => {
      await caller.attendances.list({ ...defaultInput, registrationId: REG_ID });

      const where = mockPrisma.attendance.findMany.mock.calls[0][0].where;
      expect(where.registrationId).toBe(REG_ID);
    });

    it('should filter by date', async () => {
      await caller.attendances.list({ ...defaultInput, date: '2026-07-05' });

      const where = mockPrisma.attendance.findMany.mock.calls[0][0].where;
      expect(where.attendanceDate).toEqual(new Date('2026-07-05'));
    });

    it('should filter by status', async () => {
      await caller.attendances.list({ ...defaultInput, status: 'ABSENT' });

      const where = mockPrisma.attendance.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('ABSENT');
    });

    it('should combine PARENT restriction with campId filter', async () => {
      const { caller: parentCaller, mockPrisma: pMock } = createTestCaller(PARENT_USER);
      pMock.attendance.findMany.mockResolvedValue([]);
      pMock.attendance.count.mockResolvedValue(0);

      await parentCaller.attendances.list({ ...defaultInput, campId: CAMP_ID });

      const where = pMock.attendance.findMany.mock.calls[0][0].where;
      expect(where.registration.parentId).toBe(PARENT_USER.id);
      expect(where.registration.campId).toBe(CAMP_ID);
    });
  });

  describe('result mapping', () => {
    it('should map attendances with details correctly', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.attendance.findMany.mockResolvedValue([makeAttendanceWithIncludes()]);
      mockPrisma.attendance.count.mockResolvedValue(1);

      const result = await caller.attendances.list(defaultInput);

      expect(result.total).toBe(1);
      expect(result.attendances).toHaveLength(1);
      const att = result.attendances[0];
      expect(att.id).toBe(ATTENDANCE_ID);
      expect(att.status).toBe('PRESENT');
      expect(att.arrivalTime).toBe('08:00');
      expect(att.departureTime).toBe('16:00');
      expect(att.child.firstName).toBe('Jean');
      expect(att.camp.name).toBe('Camp Ete 2026');
      expect(att.recorder.firstName).toBe('Staff');
      expect(att.recorder.lastName).toBe('Member');
      expect(att.recorder.role).toBe('STAFF');
    });

    it('should fallback recorder name when staffMember is null', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      const att = makeAttendanceWithIncludes();
      att.recorder = { role: 'ADMIN', name: 'Admin User', staffMember: null as any };
      mockPrisma.attendance.findMany.mockResolvedValue([att]);
      mockPrisma.attendance.count.mockResolvedValue(1);

      const result = await caller.attendances.list(defaultInput);

      expect(result.attendances[0].recorder.firstName).toBe('Admin User');
      expect(result.attendances[0].recorder.lastName).toBe('');
    });

    it('should convert null times to null strings', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      const att = makeAttendanceWithIncludes();
      att.arrivalTime = null;
      att.departureTime = null;
      mockPrisma.attendance.findMany.mockResolvedValue([att]);
      mockPrisma.attendance.count.mockResolvedValue(1);

      const result = await caller.attendances.list(defaultInput);

      expect(result.attendances[0].arrivalTime).toBeNull();
      expect(result.attendances[0].departureTime).toBeNull();
    });

    it('should include notes field', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      const att = makeAttendanceWithIncludes();
      att.notes = 'Child was late due to traffic';
      mockPrisma.attendance.findMany.mockResolvedValue([att]);
      mockPrisma.attendance.count.mockResolvedValue(1);

      const result = await caller.attendances.list(defaultInput);

      expect(result.attendances[0].notes).toBe('Child was late due to traffic');
    });
  });

  describe('pagination', () => {
    it('should pass limit and offset to prisma', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.attendance.findMany.mockResolvedValue([]);
      mockPrisma.attendance.count.mockResolvedValue(50);

      await caller.attendances.list({ limit: 10, offset: 20 });

      const call = mockPrisma.attendance.findMany.mock.calls[0][0];
      expect(call.take).toBe(10);
      expect(call.skip).toBe(20);
    });

    it('should return total count separately from paged results', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.attendance.findMany.mockResolvedValue([]);
      mockPrisma.attendance.count.mockResolvedValue(42);

      const result = await caller.attendances.list({ limit: 10, offset: 0 });
      expect(result.total).toBe(42);
      expect(result.attendances).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// attendances.markAttendance
// ---------------------------------------------------------------------------

describe('attendances.markAttendance', () => {
  const markInput = {
    registrationId: REG_ID,
    date: '2026-07-05',
    status: 'PRESENT' as const,
    arrivalTime: '08:30',
    departureTime: '16:00',
    notes: 'Arrived on time',
  };

  describe('access control', () => {
    it('should reject unauthenticated users', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.attendances.markAttendance(markInput)).rejects.toThrow(TRPCError);
    });

    it('should reject PARENT users', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.attendances.markAttendance(markInput)).rejects.toThrow(TRPCError);
    });

    it('should allow STAFF users', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistration());
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.attendance.create.mockResolvedValue(makeAttendanceRow());

      const result = await caller.attendances.markAttendance(markInput);
      expect(result.id).toBe(ATTENDANCE_ID);
    });

    it('should allow ADMIN users', async () => {
      const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistration());
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.attendance.create.mockResolvedValue(makeAttendanceRow({ recordedBy: ADMIN_USER.id }));

      const result = await caller.attendances.markAttendance(markInput);
      expect(result.id).toBe(ATTENDANCE_ID);
    });
  });

  describe('business rules', () => {
    let caller: TestCaller['caller'];
    let mockPrisma: TestCaller['mockPrisma'];

    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
    });

    it('should throw NOT_FOUND when registration is not found or not confirmed', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(null);

      await expect(caller.attendances.markAttendance(markInput)).rejects.toThrow(
        'Inscription non trouvee ou non confirmee',
      );
    });

    it('should throw BAD_REQUEST when date is before camp start', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistration());

      await expect(caller.attendances.markAttendance({
        ...markInput,
        date: '2026-06-30', // Before July 1
      })).rejects.toThrow('La date de presence doit etre dans la periode du camp');
    });

    it('should throw BAD_REQUEST when date is after camp end', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistration());

      await expect(caller.attendances.markAttendance({
        ...markInput,
        date: '2026-07-11', // After July 10
      })).rejects.toThrow('La date de presence doit etre dans la periode du camp');
    });

    it('should accept date on camp start boundary', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistration());
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.attendance.create.mockResolvedValue(makeAttendanceRow({
        attendanceDate: campStartDate,
      }));

      const result = await caller.attendances.markAttendance({
        ...markInput,
        date: '2026-07-01',
      });
      expect(result.id).toBe(ATTENDANCE_ID);
    });

    it('should accept date on camp end boundary', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistration());
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.attendance.create.mockResolvedValue(makeAttendanceRow({
        attendanceDate: campEndDate,
      }));

      const result = await caller.attendances.markAttendance({
        ...markInput,
        date: '2026-07-10',
      });
      expect(result.id).toBe(ATTENDANCE_ID);
    });

    it('should create new attendance when none exists', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistration());
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.attendance.create.mockResolvedValue(makeAttendanceRow());

      await caller.attendances.markAttendance(markInput);

      expect(mockPrisma.attendance.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.attendance.update).not.toHaveBeenCalled();

      const createCall = mockPrisma.attendance.create.mock.calls[0][0];
      expect(createCall.data.registrationId).toBe(REG_ID);
      expect(createCall.data.attendanceDate).toEqual(new Date('2026-07-05'));
      expect(createCall.data.status).toBe('PRESENT');
      expect(createCall.data.recordedBy).toBe(STAFF_USER.id);
    });

    it('should update existing attendance when one exists (upsert behavior)', async () => {
      const existingAttendance = makeAttendanceRow({ status: 'ABSENT' });
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistration());
      mockPrisma.attendance.findUnique.mockResolvedValue(existingAttendance);
      mockPrisma.attendance.update.mockResolvedValue(makeAttendanceRow({ status: 'PRESENT' }));

      await caller.attendances.markAttendance(markInput);

      expect(mockPrisma.attendance.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.attendance.create).not.toHaveBeenCalled();

      const updateCall = mockPrisma.attendance.update.mock.calls[0][0];
      expect(updateCall.where.id).toBe(ATTENDANCE_ID);
      expect(updateCall.data.status).toBe('PRESENT');
    });

    it('should convert arrivalTime and departureTime to Date objects', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistration());
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.attendance.create.mockResolvedValue(makeAttendanceRow());

      await caller.attendances.markAttendance(markInput);

      const createCall = mockPrisma.attendance.create.mock.calls[0][0];
      expect(createCall.data.arrivalTime).toEqual(new Date('1970-01-01T08:30:00Z'));
      expect(createCall.data.departureTime).toEqual(new Date('1970-01-01T16:00:00Z'));
    });

    it('should set times to null when not provided', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistration());
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.attendance.create.mockResolvedValue(makeAttendanceRow({
        arrivalTime: null,
        departureTime: null,
      }));

      await caller.attendances.markAttendance({
        registrationId: REG_ID,
        date: '2026-07-05',
        status: 'ABSENT',
      });

      const createCall = mockPrisma.attendance.create.mock.calls[0][0];
      expect(createCall.data.arrivalTime).toBeNull();
      expect(createCall.data.departureTime).toBeNull();
    });

    it('should convert arrivalTime/departureTime to HH:mm strings in output', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistration());
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.attendance.create.mockResolvedValue(makeAttendanceRow({
        arrivalTime: new Date('1970-01-01T09:15:00Z'),
        departureTime: new Date('1970-01-01T17:45:00Z'),
      }));

      const result = await caller.attendances.markAttendance(markInput);

      expect(result.arrivalTime).toBe('09:15');
      expect(result.departureTime).toBe('17:45');
    });

    it('should accept all valid status values', async () => {
      for (const status of ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const) {
        const { caller: c, mockPrisma: m } = createTestCaller(STAFF_USER);
        m.registration.findFirst.mockResolvedValue(makeRegistration());
        m.attendance.findUnique.mockResolvedValue(null);
        m.attendance.create.mockResolvedValue(makeAttendanceRow({ status }));

        const result = await c.attendances.markAttendance({
          ...markInput,
          status,
        });
        expect(result.status).toBe(status);
      }
    });

    it('should set recordedBy to current user id', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistration());
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.attendance.create.mockResolvedValue(makeAttendanceRow());

      await caller.attendances.markAttendance(markInput);

      const createCall = mockPrisma.attendance.create.mock.calls[0][0];
      expect(createCall.data.recordedBy).toBe(STAFF_USER.id);
    });

    it('should look up existing attendance by compound unique key', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistration());
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.attendance.create.mockResolvedValue(makeAttendanceRow());

      await caller.attendances.markAttendance(markInput);

      const findUniqueCall = mockPrisma.attendance.findUnique.mock.calls[0][0];
      expect(findUniqueCall.where.registrationId_attendanceDate).toEqual({
        registrationId: REG_ID,
        attendanceDate: new Date('2026-07-05'),
      });
    });

    it('should store notes', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistration());
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.attendance.create.mockResolvedValue(makeAttendanceRow({ notes: 'Some note' }));

      await caller.attendances.markAttendance(markInput);

      const createCall = mockPrisma.attendance.create.mock.calls[0][0];
      expect(createCall.data.notes).toBe('Arrived on time');
    });

    it('should set notes to null when not provided', async () => {
      mockPrisma.registration.findFirst.mockResolvedValue(makeRegistration());
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.attendance.create.mockResolvedValue(makeAttendanceRow({ notes: null }));

      await caller.attendances.markAttendance({
        registrationId: REG_ID,
        date: '2026-07-05',
        status: 'PRESENT',
      });

      const createCall = mockPrisma.attendance.create.mock.calls[0][0];
      expect(createCall.data.notes).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// attendances.markBulkAttendance
// ---------------------------------------------------------------------------

describe('attendances.markBulkAttendance', () => {
  const bulkInput = {
    campId: CAMP_ID,
    date: '2026-07-05',
    attendances: [
      { registrationId: REG_ID, status: 'PRESENT' as const },
      { registrationId: REG_ID_2, status: 'ABSENT' as const },
    ],
  };

  describe('access control', () => {
    it('should reject unauthenticated users', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.attendances.markBulkAttendance(bulkInput)).rejects.toThrow(TRPCError);
    });

    it('should reject PARENT users', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.attendances.markBulkAttendance(bulkInput)).rejects.toThrow(TRPCError);
    });

    it('should allow STAFF users', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.camp.findFirst.mockResolvedValue({
        startDate: campStartDate,
        endDate: campEndDate,
      });
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.attendance.create.mockResolvedValue(makeAttendanceRow());

      const result = await caller.attendances.markBulkAttendance(bulkInput);
      expect(result.success).toBe(true);
    });

    it('should allow ADMIN users', async () => {
      const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
      mockPrisma.camp.findFirst.mockResolvedValue({
        startDate: campStartDate,
        endDate: campEndDate,
      });
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.attendance.create.mockResolvedValue(makeAttendanceRow());

      const result = await caller.attendances.markBulkAttendance(bulkInput);
      expect(result.success).toBe(true);
    });
  });

  describe('business rules', () => {
    let caller: TestCaller['caller'];
    let mockPrisma: TestCaller['mockPrisma'];

    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
    });

    it('should throw NOT_FOUND when camp does not exist', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue(null);

      await expect(caller.attendances.markBulkAttendance(bulkInput)).rejects.toThrow('Camp non trouve');
    });

    it('should throw BAD_REQUEST when date is outside camp range', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue({
        startDate: campStartDate,
        endDate: campEndDate,
      });

      await expect(caller.attendances.markBulkAttendance({
        ...bulkInput,
        date: '2026-07-11',
      })).rejects.toThrow('La date est en dehors de la periode du camp');
    });

    it('should throw BAD_REQUEST when date is before camp start', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue({
        startDate: campStartDate,
        endDate: campEndDate,
      });

      await expect(caller.attendances.markBulkAttendance({
        ...bulkInput,
        date: '2026-06-30',
      })).rejects.toThrow('La date est en dehors de la periode du camp');
    });

    it('should create attendances when none exist', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue({
        startDate: campStartDate,
        endDate: campEndDate,
      });
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.attendance.create.mockResolvedValue(makeAttendanceRow());

      const result = await caller.attendances.markBulkAttendance(bulkInput);

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(mockPrisma.attendance.create).toHaveBeenCalledTimes(2);
    });

    it('should update existing attendances', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue({
        startDate: campStartDate,
        endDate: campEndDate,
      });
      const existingAtt = makeAttendanceRow();
      mockPrisma.attendance.findUnique.mockResolvedValue(existingAtt);
      mockPrisma.attendance.update.mockResolvedValue(makeAttendanceRow());

      const result = await caller.attendances.markBulkAttendance(bulkInput);

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(mockPrisma.attendance.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.attendance.create).not.toHaveBeenCalled();
    });

    it('should set recordedBy to current user for all entries', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue({
        startDate: campStartDate,
        endDate: campEndDate,
      });
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.attendance.create.mockResolvedValue(makeAttendanceRow());

      await caller.attendances.markBulkAttendance(bulkInput);

      for (const call of mockPrisma.attendance.create.mock.calls) {
        expect(call[0].data.recordedBy).toBe(STAFF_USER.id);
      }
    });

    it('should return count matching number of attendances processed', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue({
        startDate: campStartDate,
        endDate: campEndDate,
      });
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.attendance.create.mockResolvedValue(makeAttendanceRow());

      const result = await caller.attendances.markBulkAttendance({
        campId: CAMP_ID,
        date: '2026-07-05',
        attendances: [
          { registrationId: REG_ID, status: 'PRESENT' },
          { registrationId: REG_ID_2, status: 'ABSENT' },
        ],
      });

      expect(result.count).toBe(2);
    });

    it('should use compound unique key to check for existing attendance', async () => {
      mockPrisma.camp.findFirst.mockResolvedValue({
        startDate: campStartDate,
        endDate: campEndDate,
      });
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.attendance.create.mockResolvedValue(makeAttendanceRow());

      await caller.attendances.markBulkAttendance({
        campId: CAMP_ID,
        date: '2026-07-05',
        attendances: [
          { registrationId: REG_ID, status: 'PRESENT' },
        ],
      });

      const findCall = mockPrisma.attendance.findUnique.mock.calls[0][0];
      expect(findCall.where.registrationId_attendanceDate).toEqual({
        registrationId: REG_ID,
        attendanceDate: new Date('2026-07-05'),
      });
    });
  });
});

// ---------------------------------------------------------------------------
// attendances.delete
// ---------------------------------------------------------------------------

describe('attendances.delete', () => {
  describe('access control', () => {
    it('should reject unauthenticated users', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.attendances.delete({ id: ATTENDANCE_ID })).rejects.toThrow(TRPCError);
    });

    it('should reject PARENT users', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.attendances.delete({ id: ATTENDANCE_ID })).rejects.toThrow(TRPCError);
    });

    it('should allow STAFF users', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.attendance.findUnique.mockResolvedValue(makeAttendanceRow());
      mockPrisma.attendance.delete.mockResolvedValue(makeAttendanceRow());

      const result = await caller.attendances.delete({ id: ATTENDANCE_ID });
      expect(result.success).toBe(true);
    });

    it('should allow ADMIN users', async () => {
      const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
      mockPrisma.attendance.findUnique.mockResolvedValue(makeAttendanceRow());
      mockPrisma.attendance.delete.mockResolvedValue(makeAttendanceRow());

      const result = await caller.attendances.delete({ id: ATTENDANCE_ID });
      expect(result.success).toBe(true);
    });
  });

  describe('business rules', () => {
    it('should throw NOT_FOUND when attendance does not exist', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.attendance.findUnique.mockResolvedValue(null);

      await expect(caller.attendances.delete({ id: ATTENDANCE_ID })).rejects.toThrow('Presence non trouvee');
    });

    it('should perform hard delete (not soft delete)', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.attendance.findUnique.mockResolvedValue(makeAttendanceRow());
      mockPrisma.attendance.delete.mockResolvedValue(makeAttendanceRow());

      await caller.attendances.delete({ id: ATTENDANCE_ID });

      expect(mockPrisma.attendance.delete).toHaveBeenCalledWith({
        where: { id: ATTENDANCE_ID },
      });
      // Verify it's delete, not updateMany with deletedAt
      expect(mockPrisma.attendance.updateMany).not.toHaveBeenCalled();
    });

    it('should return success: true on successful deletion', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.attendance.findUnique.mockResolvedValue(makeAttendanceRow());
      mockPrisma.attendance.delete.mockResolvedValue(makeAttendanceRow());

      const result = await caller.attendances.delete({ id: ATTENDANCE_ID });
      expect(result).toEqual({ success: true });
    });
  });
});

// ---------------------------------------------------------------------------
// attendances.getStatistics
// ---------------------------------------------------------------------------

describe('attendances.getStatistics', () => {
  describe('access control', () => {
    it('should reject unauthenticated users', async () => {
      const { caller } = createTestCaller(null);
      await expect(caller.attendances.getStatistics({ campId: CAMP_ID })).rejects.toThrow(TRPCError);
    });

    it('should reject PARENT users', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.attendances.getStatistics({ campId: CAMP_ID })).rejects.toThrow(TRPCError);
    });

    it('should allow STAFF users', async () => {
      const { caller, mockPrisma } = createTestCaller(STAFF_USER);
      mockPrisma.registration.count.mockResolvedValue(0);
      mockPrisma.registration.findMany.mockResolvedValue([]);

      const result = await caller.attendances.getStatistics({ campId: CAMP_ID });
      expect(result.totalRegistrations).toBe(0);
    });

    it('should allow ADMIN users', async () => {
      const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
      mockPrisma.registration.count.mockResolvedValue(0);
      mockPrisma.registration.findMany.mockResolvedValue([]);

      const result = await caller.attendances.getStatistics({ campId: CAMP_ID });
      expect(result.totalRegistrations).toBe(0);
    });
  });

  describe('statistics computation', () => {
    let caller: TestCaller['caller'];
    let mockPrisma: TestCaller['mockPrisma'];

    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
    });

    it('should return zeros when no registrations or attendances exist', async () => {
      mockPrisma.registration.count.mockResolvedValue(0);
      mockPrisma.registration.findMany.mockResolvedValue([]);

      const result = await caller.attendances.getStatistics({ campId: CAMP_ID });

      expect(result.totalRegistrations).toBe(0);
      expect(result.totalAttendances).toBe(0);
      expect(result.byStatus).toEqual({ present: 0, absent: 0, late: 0, excused: 0 });
      expect(result.byDate).toHaveLength(0);
    });

    it('should not query attendances when no registrations exist', async () => {
      mockPrisma.registration.count.mockResolvedValue(0);
      mockPrisma.registration.findMany.mockResolvedValue([]);

      await caller.attendances.getStatistics({ campId: CAMP_ID });

      expect(mockPrisma.attendance.findMany).not.toHaveBeenCalled();
    });

    it('should aggregate by status correctly', async () => {
      mockPrisma.registration.count.mockResolvedValue(3);
      mockPrisma.registration.findMany.mockResolvedValue([
        { id: REG_ID },
        { id: REG_ID_2 },
      ]);

      const date1 = new Date('2026-07-01T00:00:00Z');
      const date2 = new Date('2026-07-02T00:00:00Z');

      mockPrisma.attendance.findMany.mockResolvedValue([
        makeAttendanceRow({ id: 'd1a00000-0000-4000-a000-000000000041', status: 'PRESENT', attendanceDate: date1 }),
        makeAttendanceRow({ id: 'd1a00000-0000-4000-a000-000000000042', status: 'PRESENT', attendanceDate: date1 }),
        makeAttendanceRow({ id: 'd1a00000-0000-4000-a000-000000000043', status: 'ABSENT', attendanceDate: date2 }),
        makeAttendanceRow({ id: 'd1a00000-0000-4000-a000-000000000044', status: 'LATE', attendanceDate: date2 }),
        makeAttendanceRow({ id: 'd1a00000-0000-4000-a000-000000000045', status: 'EXCUSED', attendanceDate: date2 }),
      ]);

      const result = await caller.attendances.getStatistics({ campId: CAMP_ID });

      expect(result.totalRegistrations).toBe(3);
      expect(result.totalAttendances).toBe(5);
      expect(result.byStatus.present).toBe(2);
      expect(result.byStatus.absent).toBe(1);
      expect(result.byStatus.late).toBe(1);
      expect(result.byStatus.excused).toBe(1);
    });

    it('should aggregate by date correctly', async () => {
      mockPrisma.registration.count.mockResolvedValue(2);
      mockPrisma.registration.findMany.mockResolvedValue([{ id: REG_ID }]);

      const date1 = new Date('2026-07-01T00:00:00Z');
      const date2 = new Date('2026-07-02T00:00:00Z');

      mockPrisma.attendance.findMany.mockResolvedValue([
        makeAttendanceRow({ id: 'd1a00000-0000-4000-a000-000000000041', status: 'PRESENT', attendanceDate: date1 }),
        makeAttendanceRow({ id: 'd1a00000-0000-4000-a000-000000000042', status: 'ABSENT', attendanceDate: date2 }),
        makeAttendanceRow({ id: 'd1a00000-0000-4000-a000-000000000043', status: 'LATE', attendanceDate: date2 }),
      ]);

      const result = await caller.attendances.getStatistics({ campId: CAMP_ID });

      expect(result.byDate).toHaveLength(2);

      // byDate should be sorted by date ascending
      expect(result.byDate[0].date).toEqual(date1);
      expect(result.byDate[0].present).toBe(1);
      expect(result.byDate[0].absent).toBe(0);

      expect(result.byDate[1].date).toEqual(date2);
      expect(result.byDate[1].absent).toBe(1);
      expect(result.byDate[1].late).toBe(1);
    });

    it('should count only CONFIRMED registrations for totalRegistrations', async () => {
      mockPrisma.registration.count.mockResolvedValue(5);
      mockPrisma.registration.findMany.mockResolvedValue([]);

      const result = await caller.attendances.getStatistics({ campId: CAMP_ID });

      // Verify the count query filters for CONFIRMED
      const countCall = mockPrisma.registration.count.mock.calls[0][0];
      expect(countCall.where.status).toBe('CONFIRMED');
      expect(countCall.where.deletedAt).toBeNull();
      expect(result.totalRegistrations).toBe(5);
    });

    it('should sort byDate in ascending chronological order', async () => {
      mockPrisma.registration.count.mockResolvedValue(1);
      mockPrisma.registration.findMany.mockResolvedValue([{ id: REG_ID }]);

      const date1 = new Date('2026-07-03T00:00:00Z');
      const date2 = new Date('2026-07-01T00:00:00Z');
      const date3 = new Date('2026-07-02T00:00:00Z');

      // Attendances come in non-chronological order
      mockPrisma.attendance.findMany.mockResolvedValue([
        makeAttendanceRow({ id: 'd1a00000-0000-4000-a000-000000000041', status: 'PRESENT', attendanceDate: date1 }),
        makeAttendanceRow({ id: 'd1a00000-0000-4000-a000-000000000042', status: 'ABSENT', attendanceDate: date2 }),
        makeAttendanceRow({ id: 'd1a00000-0000-4000-a000-000000000043', status: 'LATE', attendanceDate: date3 }),
      ]);

      const result = await caller.attendances.getStatistics({ campId: CAMP_ID });

      expect(result.byDate[0].date).toEqual(date2); // July 1
      expect(result.byDate[1].date).toEqual(date3); // July 2
      expect(result.byDate[2].date).toEqual(date1); // July 3
    });
  });
});
