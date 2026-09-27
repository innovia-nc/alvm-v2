import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, staffProcedure } from '@back/trpc/trpc.init';
import type { Prisma, AttendanceStatus } from '@prisma/client';
import { lockTenant } from '@back/db-context';

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
  // Traçabilité interne : `null` pour un PARENT, comme `notes` (§5.13).
  recorder: z
    .object({
      firstName: z.string(),
      lastName: z.string(),
      role: z.enum(['PARENT', 'STAFF', 'ADMIN']),
    })
    .nullable(),
});

/**
 * Colonnes d'un pointage exposées (§5.9) : ni `organizationId`, ni
 * `recordedBy` (identifiant interne, lu par aucun écran).
 */
const attendanceSelect = {
  id: true,
  registrationId: true,
  attendanceDate: true,
  status: true,
  arrivalTime: true,
  departureTime: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.AttendanceSelect;

const attendanceContextSelect = {
  registration: {
    select: {
      child: { select: { id: true, firstName: true, lastName: true } },
      camp: { select: { id: true, name: true } },
    },
  },
} as const;

/** Vue personnel : + notes internes et auteur du pointage. */
const attendanceStaffListSelect = {
  ...attendanceSelect,
  ...attendanceContextSelect,
  recorder: {
    select: {
      role: true,
      staffMember: { select: { firstName: true, lastName: true } },
      name: true,
    },
  },
} as const satisfies Prisma.AttendanceSelect;

/** Vue parent : ni notes internes ni auteur du pointage (§5.13). */
const { notes: _notes, ...attendanceParentSelect } = {
  ...attendanceSelect,
  ...attendanceContextSelect,
};

const attendanceGridSchema = z.object({
  campId: z.string().uuid(),
  dates: z.array(z.date()),
  children: z.array(
    z.object({
      registrationId: z.string().uuid(),
      childId: z.string().uuid(),
      firstName: z.string(),
      lastName: z.string(),
      attendances: z.array(
        z.object({
          date: z.date(),
          status: attendanceStatusEnum.nullable(),
          arrivalTime: z.string().nullable(),
          departureTime: z.string().nullable(),
        }),
      ),
    }),
  ),
});

type AttendanceRecorder = {
  role: string;
  name: string | null;
  staffMember: { firstName: string; lastName: string } | null;
};

function mapRecorder(recorder: AttendanceRecorder) {
  return {
    firstName: recorder.staffMember?.firstName || recorder.name || 'Unknown',
    lastName: recorder.staffMember?.lastName || '',
    role: recorder.role as Role,
  };
}

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
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Camp non trouvé' });
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
        select: {
          id: true,
          child: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { child: { lastName: 'asc' } },
      });

      // Get all attendances for this camp
      const regIds = registrations.map((r) => r.id);
      const attendances =
        regIds.length > 0
          ? await ctx.prisma.attendance.findMany({
              where: { registrationId: { in: regIds } },
              select: {
                registrationId: true,
                attendanceDate: true,
                status: true,
                arrivalTime: true,
                departureTime: true,
              },
            })
          : [];

      // Build lookup map
      const attMap = new Map<string, (typeof attendances)[0]>();
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
            status: att ? (att.status as Status) : null,
            arrivalTime: att ? timeToStr(att.arrivalTime) : null,
            departureTime: att ? timeToStr(att.departureTime) : null,
          };
        }),
      }));

      return { campId: input.campId, dates, children };
    }),

  list: protectedProcedure
    .input(
      z.object({
        campId: z.string().uuid().optional(),
        registrationId: z.string().uuid().optional(),
        date: z.string().date().optional(),
        status: attendanceStatusEnum.optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }),
    )
    .output(
      z.object({
        attendances: z.array(attendanceWithDetailsSchema),
        total: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { campId, registrationId, date, status, limit, offset } = input;

      const where: Prisma.AttendanceWhereInput = {};

      // Parent sees only their registrations
      if (ctx.user.role === 'PARENT') {
        where.registration = { parentId: ctx.user.id };
      }

      if (campId) {
        where.registration = { ...(where.registration as any), campId };
      }
      if (registrationId) where.registrationId = registrationId;
      if (date) where.attendanceDate = new Date(date);
      if (status) where.status = status;

      const isParent = ctx.user.role === 'PARENT';
      const query = {
        where,
        orderBy: [{ attendanceDate: 'desc' as const }],
        take: limit,
        skip: offset,
      };
      const [attendances, total] = await Promise.all([
        isParent
          ? ctx.prisma.attendance.findMany({ ...query, select: attendanceParentSelect })
          : ctx.prisma.attendance.findMany({ ...query, select: attendanceStaffListSelect }),
        ctx.prisma.attendance.count({ where }),
      ]);

      return {
        attendances: attendances.map((a) => {
          // Champs internes, lus seulement par `attendanceStaffListSelect`.
          const internal = a as { notes?: string | null; recorder?: AttendanceRecorder };
          return {
            id: a.id,
            registrationId: a.registrationId,
            attendanceDate: a.attendanceDate,
            status: a.status as Status,
            arrivalTime: timeToStr(a.arrivalTime),
            departureTime: timeToStr(a.departureTime),
            // Projection par rôle (§5.13) : décidée par le rôle, pas par la forme.
            notes: isParent ? null : (internal.notes ?? null),
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
            child: a.registration.child,
            camp: a.registration.camp,
            recorder: isParent || !internal.recorder ? null : mapRecorder(internal.recorder),
          };
        }),
        total,
      };
    }),

  markAttendance: staffProcedure
    .input(
      z.object({
        registrationId: z.string().uuid(),
        date: z.string().date(),
        status: attendanceStatusEnum,
        arrivalTime: z.string().optional(),
        departureTime: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .output(attendanceSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');

        // Verify registration exists and is confirmed
        const reg = await tx.registration.findFirst({
          where: { id: input.registrationId, status: 'CONFIRMED', deletedAt: null },
          select: { camp: { select: { startDate: true, endDate: true } } },
        });
        if (!reg) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Inscription non trouvée ou non confirmée',
          });
        }

        // Verify date is within camp range
        const attDate = new Date(input.date);
        if (attDate < reg.camp.startDate || attDate > reg.camp.endDate) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'La date de présence doit être dans la période du camp',
          });
        }

        // Upsert attendance
        const existing = await tx.attendance.findUnique({
          where: {
            registrationId_attendanceDate: {
              registrationId: input.registrationId,
              attendanceDate: attDate,
            },
          },
          select: { id: true },
        });

        const data = {
          status: input.status as AttendanceStatus,
          arrivalTime: input.arrivalTime ? new Date(`1970-01-01T${input.arrivalTime}:00Z`) : null,
          departureTime: input.departureTime
            ? new Date(`1970-01-01T${input.departureTime}:00Z`)
            : null,
          notes: input.notes || null,
          recordedBy: ctx.user.id,
        };

        const attendance = existing
          ? await tx.attendance.update({
              where: { id: existing.id },
              data,
              select: attendanceSelect,
            })
          : await tx.attendance.create({
              data: {
                registrationId: input.registrationId,
                attendanceDate: attDate,
                ...data,
              },
              select: attendanceSelect,
            });

        return {
          id: attendance.id,
          registrationId: attendance.registrationId,
          attendanceDate: attendance.attendanceDate,
          status: attendance.status as Status,
          arrivalTime: timeToStr(attendance.arrivalTime),
          departureTime: timeToStr(attendance.departureTime),
          notes: attendance.notes,
          createdAt: attendance.createdAt,
          updatedAt: attendance.updatedAt,
        };
      });
    }),

  markBulkAttendance: staffProcedure
    .input(
      z.object({
        campId: z.string().uuid(),
        date: z.string().date(),
        attendances: z.array(
          z.object({
            registrationId: z.string().uuid(),
            status: attendanceStatusEnum,
          }),
        ),
      }),
    )
    .output(z.object({ success: z.boolean(), count: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');

        const camp = await tx.camp.findFirst({
          where: { id: input.campId, deletedAt: null },
          select: { startDate: true, endDate: true },
        });
        if (!camp) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Camp non trouvé' });
        }

        const attDate = new Date(input.date);
        if (attDate < camp.startDate || attDate > camp.endDate) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'La date est en dehors de la période du camp',
          });
        }

        const ids = input.attendances.map((a) => a.registrationId);
        if (new Set(ids).size !== ids.length)
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Inscription présente plusieurs fois dans le lot',
          });
        const registrations = await tx.registration.findMany({
          where: { id: { in: ids }, campId: input.campId, status: 'CONFIRMED', deletedAt: null },
          select: { id: true },
        });
        if (registrations.length !== ids.length)
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Le lot contient une inscription non confirmée ou étrangère au camp',
          });
        let count = 0;
        for (const att of input.attendances) {
          const existing = await tx.attendance.findUnique({
            where: {
              registrationId_attendanceDate: {
                registrationId: att.registrationId,
                attendanceDate: attDate,
              },
            },
            select: { id: true },
          });

          if (existing) {
            await tx.attendance.update({
              where: { id: existing.id },
              data: { status: att.status as AttendanceStatus, recordedBy: ctx.user.id },
            });
          } else {
            await tx.attendance.create({
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
      });
    }),

  delete: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.attendance.findUnique({
        where: { id: input.id },
        select: { id: true },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Présence non trouvée' });
      }

      await ctx.prisma.attendance.delete({ where: { id: input.id } });
      return { success: true };
    }),

  getStatistics: staffProcedure
    .input(z.object({ campId: z.string().uuid() }))
    .output(
      z.object({
        totalRegistrations: z.number(),
        totalAttendances: z.number(),
        byStatus: z.object({
          present: z.number(),
          absent: z.number(),
          late: z.number(),
          excused: z.number(),
        }),
        byDate: z.array(
          z.object({
            date: z.date(),
            present: z.number(),
            absent: z.number(),
            late: z.number(),
            excused: z.number(),
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      const totalRegistrations = await ctx.prisma.registration.count({
        where: { campId: input.campId, status: 'CONFIRMED', deletedAt: null },
      });

      const regIds = (
        await ctx.prisma.registration.findMany({
          where: { campId: input.campId },
          select: { id: true },
        })
      ).map((r) => r.id);

      const allAttendances =
        regIds.length > 0
          ? await ctx.prisma.attendance.findMany({
              where: { registrationId: { in: regIds } },
              select: { status: true, attendanceDate: true },
            })
          : [];

      const totalAttendances = allAttendances.length;

      const byStatus = { present: 0, absent: 0, late: 0, excused: 0 };
      const dateMap = new Map<
        string,
        { date: Date; present: number; absent: number; late: number; excused: number }
      >();

      for (const a of allAttendances) {
        const statusKey = a.status.toLowerCase() as keyof typeof byStatus;
        if (statusKey in byStatus) byStatus[statusKey]++;

        const dateStr = a.attendanceDate.toISOString().split('T')[0];
        if (!dateMap.has(dateStr)) {
          dateMap.set(dateStr, {
            date: a.attendanceDate,
            present: 0,
            absent: 0,
            late: 0,
            excused: 0,
          });
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
