import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, staffProcedure } from '@/server/trpc/init';
import type { Prisma, AttendanceStatus, UserRole } from '@prisma/client';

type Status = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
type Role = 'PARENT' | 'STAFF' | 'ADMIN';

const attendanceStatusEnum = z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);

const attendanceSchema = z.object({
  id: z.string().uuid(),
  registrationId: z.string().uuid(),
  attendanceDate: z.date(),
  status: attendanceStatusEnum,
  arrivalTime: z.string().nullable(),
  departureTime: z.string().nullable(),
  notes: z.string().nullable(),
  recordedBy: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const attendanceWithDetailsSchema = attendanceSchema.extend({
  child: z.object({
    id: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
  }),
  camp: z.object({
    id: z.string().uuid(),
    name: z.string(),
  }),
  recorder: z.object({
    firstName: z.string(),
    lastName: z.string(),
    role: z.enum(['PARENT', 'STAFF', 'ADMIN']),
  }),
});

const attendanceGridSchema = z.object({
  campId: z.string().uuid(),
  dates: z.array(z.date()),
  children: z.array(z.object({
    registrationId: z.string().uuid(),
    childId: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
    attendances: z.array(z.object({
      date: z.date(),
      status: attendanceStatusEnum.nullable(),
      arrivalTime: z.string().nullable(),
      departureTime: z.string().nullable(),
    })),
  })),
});

/** Convert Prisma Time (Date) to HH:mm string or null */
function timeToStr(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().substring(11, 16);
}

export const attendancesRouter = router({
  getGridForCamp: staffProcedure
    .input(z.object({ campId: z.string().uuid() }))
    .output(attendanceGridSchema)
    .query(async ({ ctx, input }) => {
      const camp = await ctx.prisma.camp.findFirst({
        where: { id: input.campId, deletedAt: null },
        select: { startDate: true, endDate: true },
      });
      if (!camp) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Camp non trouve' });
      }

      // Generate all dates in the camp range
      const dates: Date[] = [];
      const current = new Date(camp.startDate);
      const end = new Date(camp.endDate);
      while (current <= end) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }

      // Get confirmed registrations
      const registrations = await ctx.prisma.registration.findMany({
        where: { campId: input.campId, status: 'CONFIRMED', deletedAt: null },
        include: {
          child: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { child: { lastName: 'asc' } },
      });

      // Get all attendances for this camp
      const regIds = registrations.map((r) => r.id);
      const attendances = regIds.length > 0
        ? await ctx.prisma.attendance.findMany({
            where: { registrationId: { in: regIds } },
          })
        : [];

      // Build lookup map
      const attMap = new Map<string, typeof attendances[0]>();
      for (const a of attendances) {
        const dateStr = a.attendanceDate.toISOString().split('T')[0];
        attMap.set(`${a.registrationId}-${dateStr}`, a);
      }

      const children = registrations.map((reg) => ({
        registrationId: reg.id,
        childId: reg.child.id,
        firstName: reg.child.firstName,
        lastName: reg.child.lastName,
        attendances: dates.map((date) => {
          const dateStr = date.toISOString().split('T')[0];
          const att = attMap.get(`${reg.id}-${dateStr}`);
          return {
            date,
            status: att ? att.status as Status : null,
            arrivalTime: att ? timeToStr(att.arrivalTime) : null,
            departureTime: att ? timeToStr(att.departureTime) : null,
          };
        }),
      }));

      return { campId: input.campId, dates, children };
    }),

  list: protectedProcedure
    .input(z.object({
      campId: z.string().uuid().optional(),
      registrationId: z.string().uuid().optional(),
      date: z.string().date().optional(),
      status: attendanceStatusEnum.optional(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .output(z.object({
      attendances: z.array(attendanceWithDetailsSchema),
      total: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const { campId, registrationId, date, status, limit, offset } = input;

      const where: Prisma.AttendanceWhereInput = {};

      // Parent sees only their registrations
      if (ctx.user.role === 'PARENT') {
        where.registration = { parentId: ctx.user.id };
      }

      if (campId) {
        where.registration = { ...where.registration as any, campId };
      }
      if (registrationId) where.registrationId = registrationId;
      if (date) where.attendanceDate = new Date(date);
      if (status) where.status = status;

      const [attendances, total] = await Promise.all([
        ctx.prisma.attendance.findMany({
          where,
          include: {
            registration: {
              include: {
                child: { select: { id: true, firstName: true, lastName: true } },
                camp: { select: { id: true, name: true } },
              },
            },
            recorder: {
              select: {
                role: true,
                staffMember: { select: { firstName: true, lastName: true } },
                name: true,
              },
            },
          },
          orderBy: [{ attendanceDate: 'desc' }],
          take: limit,
          skip: offset,
        }),
        ctx.prisma.attendance.count({ where }),
      ]);

      return {
        attendances: attendances.map((a) => ({
          id: a.id,
          registrationId: a.registrationId,
          attendanceDate: a.attendanceDate,
          status: a.status as Status,
          arrivalTime: timeToStr(a.arrivalTime),
          departureTime: timeToStr(a.departureTime),
          notes: a.notes,
          recordedBy: a.recordedBy,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
          child: a.registration.child,
          camp: a.registration.camp,
          recorder: {
            firstName: a.recorder.staffMember?.firstName || a.recorder.name || 'Unknown',
            lastName: a.recorder.staffMember?.lastName || '',
            role: a.recorder.role as Role,
          },
        })),
        total,
      };
    }),

  markAttendance: staffProcedure
    .input(z.object({
      registrationId: z.string().uuid(),
      date: z.string().date(),
      status: attendanceStatusEnum,
      arrivalTime: z.string().optional(),
      departureTime: z.string().optional(),
      notes: z.string().optional(),
    }))
    .output(attendanceSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify registration exists and is confirmed
      const reg = await ctx.prisma.registration.findFirst({
        where: { id: input.registrationId, status: 'CONFIRMED', deletedAt: null },
        include: { camp: { select: { startDate: true, endDate: true } } },
      });
      if (!reg) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscription non trouvee ou non confirmee' });
      }

      // Verify date is within camp range
      const attDate = new Date(input.date);
      if (attDate < reg.camp.startDate || attDate > reg.camp.endDate) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'La date de presence doit etre dans la periode du camp',
        });
      }

      // Upsert attendance
      const existing = await ctx.prisma.attendance.findUnique({
        where: {
          registrationId_attendanceDate: {
            registrationId: input.registrationId,
            attendanceDate: attDate,
          },
        },
      });

      const data = {
        status: input.status as AttendanceStatus,
        arrivalTime: input.arrivalTime ? new Date(`1970-01-01T${input.arrivalTime}:00Z`) : null,
        departureTime: input.departureTime ? new Date(`1970-01-01T${input.departureTime}:00Z`) : null,
        notes: input.notes || null,
        recordedBy: ctx.user.id,
      };

      const attendance = existing
        ? await ctx.prisma.attendance.update({
            where: { id: existing.id },
            data,
          })
        : await ctx.prisma.attendance.create({
            data: {
              registrationId: input.registrationId,
              attendanceDate: attDate,
              ...data,
            },
          });

      return {
        id: attendance.id,
        registrationId: attendance.registrationId,
        attendanceDate: attendance.attendanceDate,
        status: attendance.status as Status,
        arrivalTime: timeToStr(attendance.arrivalTime),
        departureTime: timeToStr(attendance.departureTime),
        notes: attendance.notes,
        recordedBy: attendance.recordedBy,
        createdAt: attendance.createdAt,
        updatedAt: attendance.updatedAt,
      };
    }),

  markBulkAttendance: staffProcedure
    .input(z.object({
      campId: z.string().uuid(),
      date: z.string().date(),
      attendances: z.array(z.object({
        registrationId: z.string().uuid(),
        status: attendanceStatusEnum,
      })),
    }))
    .output(z.object({ success: z.boolean(), count: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const camp = await ctx.prisma.camp.findFirst({
        where: { id: input.campId, deletedAt: null },
        select: { startDate: true, endDate: true },
      });
      if (!camp) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Camp non trouve' });
      }

      const attDate = new Date(input.date);
      if (attDate < camp.startDate || attDate > camp.endDate) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'La date est en dehors de la periode du camp' });
      }

      let count = 0;
      for (const att of input.attendances) {
        const existing = await ctx.prisma.attendance.findUnique({
          where: {
            registrationId_attendanceDate: {
              registrationId: att.registrationId,
              attendanceDate: attDate,
            },
          },
        });

        if (existing) {
          await ctx.prisma.attendance.update({
            where: { id: existing.id },
            data: { status: att.status as AttendanceStatus, recordedBy: ctx.user.id },
          });
        } else {
          await ctx.prisma.attendance.create({
            data: {
              registrationId: att.registrationId,
              attendanceDate: attDate,
              status: att.status as AttendanceStatus,
              recordedBy: ctx.user.id,
            },
          });
        }
        count++;
      }

      return { success: true, count };
    }),

  delete: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.attendance.findUnique({
        where: { id: input.id },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Presence non trouvee' });
      }

      await ctx.prisma.attendance.delete({ where: { id: input.id } });
      return { success: true };
    }),

  getStatistics: staffProcedure
    .input(z.object({ campId: z.string().uuid() }))
    .output(z.object({
      totalRegistrations: z.number(),
      totalAttendances: z.number(),
      byStatus: z.object({
        present: z.number(),
        absent: z.number(),
        late: z.number(),
        excused: z.number(),
      }),
      byDate: z.array(z.object({
        date: z.date(),
        present: z.number(),
        absent: z.number(),
        late: z.number(),
        excused: z.number(),
      })),
    }))
    .query(async ({ ctx, input }) => {
      const totalRegistrations = await ctx.prisma.registration.count({
        where: { campId: input.campId, status: 'CONFIRMED', deletedAt: null },
      });

      const regIds = (await ctx.prisma.registration.findMany({
        where: { campId: input.campId },
        select: { id: true },
      })).map((r) => r.id);

      const allAttendances = regIds.length > 0
        ? await ctx.prisma.attendance.findMany({
            where: { registrationId: { in: regIds } },
          })
        : [];

      const totalAttendances = allAttendances.length;

      const byStatus = { present: 0, absent: 0, late: 0, excused: 0 };
      const dateMap = new Map<string, { date: Date; present: number; absent: number; late: number; excused: number }>();

      for (const a of allAttendances) {
        const statusKey = a.status.toLowerCase() as keyof typeof byStatus;
        if (statusKey in byStatus) byStatus[statusKey]++;

        const dateStr = a.attendanceDate.toISOString().split('T')[0];
        if (!dateMap.has(dateStr)) {
          dateMap.set(dateStr, { date: a.attendanceDate, present: 0, absent: 0, late: 0, excused: 0 });
        }
        const entry = dateMap.get(dateStr)!;
        if (statusKey in entry) (entry as any)[statusKey]++;
      }

      const byDate = Array.from(dateMap.values()).sort(
        (a, b) => a.date.getTime() - b.date.getTime(),
      );

      return { totalRegistrations, totalAttendances, byStatus, byDate };
    }),
});
