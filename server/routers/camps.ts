import { syncCampDays } from '@/server/services/camp-days.service';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, staffProcedure } from '@/server/trpc/init';
import type { Prisma } from '@prisma/client';
import { computeDaysCount } from '@/server/helpers/date';
import { toNum } from '@/server/helpers/decimal';
import { lockTenant } from '@/server/db-context';

type Status = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED';

const campSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  campTypeId: z.string().uuid(),
  location: z.string(),
  maxCapacity: z.number(),
  startDate: z.date().nullable(),
  endDate: z.date().nullable(),
  registrationDeadline: z.date(),
  pricePerDay: z.number(),
  totalPrice: z.number(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED']),
  createdBy: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const campWithDetailsSchema = campSchema.extend({
  campType: z.object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
  }),
  creator: z.object({
    firstName: z.string(),
    lastName: z.string(),
  }),
  daysCount: z.number(),
  registrationsCount: z.number(),
  availableSpots: z.number(),
});

function mapCamp(c: any) {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    campTypeId: c.campTypeId,
    location: c.location,
    maxCapacity: c.maxCapacity,
    startDate: c.startDate,
    endDate: c.endDate,
    registrationDeadline: c.registrationDeadline,
    pricePerDay: toNum(c.pricePerDay),
    totalPrice:
      c.totalPrice == null
        ? computeDaysCount(c.startDate, c.endDate) * toNum(c.pricePerDay)
        : toNum(c.totalPrice),
    status: c.status as Status,
    createdBy: c.createdBy,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export const campsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED']).optional(),
        campTypeId: z.string().uuid().optional(),
        location: z.string().optional(),
        search: z.string().optional(),
        sortBy: z
          .enum(['name', 'startDate', 'registrationDeadline', 'createdAt'])
          .default('createdAt'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
      }),
    )
    .output(z.object({ camps: z.array(campWithDetailsSchema), total: z.number() }))
    .query(async ({ ctx, input }) => {
      const { limit, offset, status, campTypeId, location, search, sortBy, sortOrder } = input;

      const where: Prisma.CampWhereInput = { deletedAt: null };

      // Parents only see PUBLISHED camps
      if (ctx.user.role === 'PARENT') {
        where.status = 'PUBLISHED';
      } else if (status) {
        where.status = status;
      }

      if (campTypeId) where.campTypeId = campTypeId;
      if (location) where.location = { contains: location, mode: 'insensitive' };
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { campType: { name: { contains: search, mode: 'insensitive' } } },
        ];
      }

      const [camps, total] = await Promise.all([
        ctx.prisma.camp.findMany({
          where,
          include: {
            campType: { select: { id: true, name: true, description: true } },
            creator: {
              select: {
                name: true,
                staffMember: { select: { firstName: true, lastName: true } },
              },
            },
            _count: {
              select: {
                registrations: {
                  where: { status: 'CONFIRMED', deletedAt: null },
                },
              },
            },
          },
          orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
          take: limit,
          skip: offset,
        }),
        ctx.prisma.camp.count({ where }),
      ]);

      return {
        camps: camps.map((c) => {
          const regCount = c._count.registrations;
          const daysCount = computeDaysCount(c.startDate, c.endDate);
          return {
            ...mapCamp(c),
            campType: c.campType,
            creator: {
              firstName: c.creator.staffMember?.firstName || c.creator.name || 'Unknown',
              lastName: c.creator.staffMember?.lastName || '',
            },
            daysCount,
            registrationsCount: regCount,
            availableSpots: Math.max(0, c.maxCapacity - regCount),
          };
        }),
        total,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(campWithDetailsSchema.nullable())
    .query(async ({ ctx, input }) => {
      const where: Prisma.CampWhereInput = { id: input.id, deletedAt: null };
      if (ctx.user.role === 'PARENT') where.status = 'PUBLISHED';

      const camp = await ctx.prisma.camp.findFirst({
        where,
        include: {
          campType: { select: { id: true, name: true, description: true } },
          creator: {
            select: {
              name: true,
              staffMember: { select: { firstName: true, lastName: true } },
            },
          },
          _count: {
            select: {
              registrations: { where: { status: 'CONFIRMED', deletedAt: null } },
            },
          },
        },
      });

      if (!camp) return null;

      const regCount = camp._count.registrations;
      const daysCount = computeDaysCount(camp.startDate, camp.endDate);

      return {
        ...mapCamp(camp),
        campType: camp.campType,
        creator: {
          firstName: camp.creator.staffMember?.firstName || camp.creator.name || 'Unknown',
          lastName: camp.creator.staffMember?.lastName || '',
        },
        daysCount,
        registrationsCount: regCount,
        availableSpots: Math.max(0, camp.maxCapacity - regCount),
      };
    }),

  create: staffProcedure
    .input(
      z
        .object({
          name: z.string().min(3).max(200),
          description: z.string().min(10),
          campTypeId: z.string().uuid(),
          location: z.string().min(3),
          maxCapacity: z.number().min(1).max(200),
          startDate: z.string().date(),
          endDate: z.string().date(),
          registrationDeadline: z.string().date(),
          totalPrice: z.number().min(0),
          status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
        })
        .refine((d) => new Date(d.endDate) >= new Date(d.startDate), {
          message: 'La date de fin doit être après ou égale à la date de début',
          path: ['endDate'],
        }),
    )
    .output(campSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');

        const campType = await tx.campType.findFirst({
          where: { id: input.campTypeId, active: true },
        });
        if (!campType) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Type de camp non trouvé ou inactif' });
        }

        const daysCount = computeDaysCount(new Date(input.startDate), new Date(input.endDate));
        const pricePerDay = daysCount > 0 ? input.totalPrice / daysCount : 0;

        const camp = await tx.camp.create({
          data: {
            name: input.name,
            description: input.description,
            campTypeId: input.campTypeId,
            location: input.location,
            maxCapacity: input.maxCapacity,
            startDate: new Date(input.startDate),
            endDate: new Date(input.endDate),
            registrationDeadline: new Date(input.registrationDeadline),
            pricePerDay,
            totalPrice: input.totalPrice,
            status: input.status,
            createdBy: ctx.user.id,
          },
        });

        await syncCampDays(tx, camp);
        return mapCamp(camp);
      });
    }),

  update: staffProcedure
    .input(
      z
        .object({
          id: z.string().uuid(),
          name: z.string().min(3).max(200).optional(),
          description: z.string().min(10).optional(),
          campTypeId: z.string().uuid().optional(),
          location: z.string().min(3).optional(),
          maxCapacity: z.number().min(1).max(200).optional(),
          startDate: z.string().date().optional(),
          endDate: z.string().date().optional(),
          registrationDeadline: z.string().date().optional(),
          totalPrice: z.number().min(0).optional(),
          status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED']).optional(),
        })
        .refine(
          (d) => {
            if (d.startDate && d.endDate) return new Date(d.endDate) >= new Date(d.startDate);
            return true;
          },
          {
            message: 'La date de fin doit être après ou égale à la date de début',
            path: ['endDate'],
          },
        ),
    )
    .output(campSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');

        const existing = await tx.camp.findFirst({
          where: { id: input.id, deletedAt: null },
        });
        if (!existing) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Camp non trouvé' });
        }

        const { id, totalPrice, startDate, endDate, ...rest } = input;
        const data: Prisma.CampUpdateInput = {};

        if (rest.name !== undefined) data.name = rest.name;
        if (rest.description !== undefined) data.description = rest.description;
        if (rest.campTypeId !== undefined) data.campType = { connect: { id: rest.campTypeId } };
        if (rest.location !== undefined) data.location = rest.location;
        if (rest.maxCapacity !== undefined) data.maxCapacity = rest.maxCapacity;
        if (startDate !== undefined) data.startDate = new Date(startDate);
        if (endDate !== undefined) data.endDate = new Date(endDate);
        if (rest.registrationDeadline !== undefined)
          data.registrationDeadline = new Date(rest.registrationDeadline);
        if (rest.status !== undefined) data.status = rest.status;

        if (totalPrice !== undefined || startDate !== undefined || endDate !== undefined) {
          const acceptedPrice =
            totalPrice ??
            toNum(
              existing.totalPrice ??
                toNum(existing.pricePerDay) *
                  computeDaysCount(existing.startDate, existing.endDate),
            );
          data.totalPrice = acceptedPrice;
          const sDate = startDate ? new Date(startDate) : existing.startDate;
          const eDate = endDate ? new Date(endDate) : existing.endDate;
          const daysCount = computeDaysCount(sDate, eDate);
          data.pricePerDay = daysCount > 0 ? acceptedPrice / daysCount : 0;
        }

        if (Object.keys(data).length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucune modification fournie' });
        }

        const newStart = startDate ? new Date(startDate) : existing.startDate;
        const newEnd = endDate ? new Date(endDate) : existing.endDate;
        if (newEnd < newStart)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Période invalide' });
        if (
          rest.maxCapacity !== undefined &&
          (await tx.registration.count({
            where: { campId: id, status: 'CONFIRMED', deletedAt: null },
          })) > rest.maxCapacity
        )
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Capacité inférieure aux inscriptions confirmées',
          });
        if (
          (startDate || endDate) &&
          (await tx.attendance.count({
            where: {
              registration: { campId: id },
              OR: [{ attendanceDate: { lt: newStart } }, { attendanceDate: { gt: newEnd } }],
            },
          })) > 0
        )
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Des présences existent hors de cette période',
          });
        const camp = await tx.camp.update({ where: { id }, data });
        await syncCampDays(tx, camp);
        return mapCamp(camp);
      });
    }),

  delete: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');

        const confirmedRegs = await tx.registration.count({
          where: { campId: input.id, status: 'CONFIRMED', deletedAt: null },
        });
        if (confirmedRegs > 0) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Impossible de supprimer ce camp : des inscriptions confirmées existent',
          });
        }

        const result = await tx.camp.updateMany({
          where: { id: input.id, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        if (result.count === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Camp non trouvé' });
        }

        return { success: true };
      });
    }),

  // Types d'ACM de l'association de la session (données de tenant).
  listCampTypes: protectedProcedure
    .output(
      z.array(
        z.object({
          id: z.string().uuid(),
          name: z.string(),
          description: z.string().nullable(),
          active: z.boolean(),
        }),
      ),
    )
    .query(async ({ ctx }) => {
      return ctx.prisma.campType.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, description: true, active: true },
      });
    }),

  duplicate: staffProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(3).max(200),
        campTypeId: z.string().uuid().optional(),
      }),
    )
    .output(campSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        await lockTenant(tx, 'billing');

        const source = await tx.camp.findFirst({
          where: { id: input.id, deletedAt: null },
        });
        if (!source) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Camp source non trouvé' });
        }

        const targetCampTypeId = input.campTypeId ?? source.campTypeId;

        if (input.campTypeId && input.campTypeId !== source.campTypeId) {
          const campType = await tx.campType.findFirst({
            where: { id: input.campTypeId, active: true },
            select: { id: true },
          });
          if (!campType) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Type de camp cible non trouvé ou inactif',
            });
          }
        }

        const camp = await tx.camp.create({
          data: {
            name: input.name,
            description: source.description,
            campTypeId: targetCampTypeId,
            location: source.location,
            maxCapacity: source.maxCapacity,
            startDate: source.startDate,
            endDate: source.endDate,
            registrationDeadline: source.registrationDeadline,
            pricePerDay: source.pricePerDay,
            totalPrice: source.totalPrice,
            status: 'DRAFT',
            createdBy: ctx.user.id,
          },
        });

        await syncCampDays(tx, camp);
        return mapCamp(camp);
      });
    }),
});
