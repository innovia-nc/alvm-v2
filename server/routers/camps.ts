import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  router,
  publicProcedure,
  protectedProcedure,
  staffProcedure,
} from '@/server/trpc/init';
import type { Prisma, CampStatus } from '@prisma/client';
import { computeDaysCount } from '@/server/helpers/date';
import { toNum } from '@/server/helpers/decimal';

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
    status: c.status as Status,
    createdBy: c.createdBy,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

// computeDaysCount imported from @/server/helpers/date

export const campsRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
      status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED']).optional(),
      campTypeId: z.string().uuid().optional(),
      location: z.string().optional(),
      search: z.string().optional(),
      sortBy: z.enum(['name', 'startDate', 'registrationDeadline', 'createdAt']).default('createdAt'),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
    }))
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
          orderBy: { [sortBy]: sortOrder },
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
            availableSpots: c.maxCapacity - regCount,
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
        availableSpots: camp.maxCapacity - regCount,
      };
    }),

  create: staffProcedure
    .input(z.object({
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
    }).refine(
      (d) => new Date(d.endDate) >= new Date(d.startDate),
      { message: 'La date de fin doit être après ou égale à la date de début', path: ['endDate'] },
    ))
    .output(campSchema)
    .mutation(async ({ ctx, input }) => {
      const campType = await ctx.prisma.campType.findFirst({
        where: { id: input.campTypeId, active: true },
      });
      if (!campType) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Type de camp non trouvé ou inactif' });
      }

      const daysCount = computeDaysCount(
        new Date(input.startDate),
        new Date(input.endDate),
      );
      const pricePerDay = daysCount > 0 ? input.totalPrice / daysCount : 0;

      const camp = await ctx.prisma.camp.create({
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
          status: input.status,
          createdBy: ctx.user.id,
        },
      });

      return mapCamp(camp);
    }),

  update: staffProcedure
    .input(z.object({
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
    }).refine(
      (d) => {
        if (d.startDate && d.endDate) return new Date(d.endDate) >= new Date(d.startDate);
        return true;
      },
      { message: 'La date de fin doit être après ou égale à la date de début', path: ['endDate'] },
    ))
    .output(campSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.camp.findFirst({
        where: { id: input.id, deletedAt: null },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Camp non trouvé' });
      }

      if (existing.createdBy !== ctx.user.id && ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Vous ne pouvez pas modifier ce camp' });
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
      if (rest.registrationDeadline !== undefined) data.registrationDeadline = new Date(rest.registrationDeadline);
      if (rest.status !== undefined) data.status = rest.status;

      if (totalPrice !== undefined) {
        const sDate = startDate ? new Date(startDate) : existing.startDate;
        const eDate = endDate ? new Date(endDate) : existing.endDate;
        const daysCount = computeDaysCount(sDate, eDate);
        data.pricePerDay = daysCount > 0 ? totalPrice / daysCount : 0;
      }

      if (Object.keys(data).length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucune modification fournie' });
      }

      const camp = await ctx.prisma.camp.update({ where: { id }, data });
      return mapCamp(camp);
    }),

  delete: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const confirmedRegs = await ctx.prisma.registration.count({
        where: { campId: input.id, status: 'CONFIRMED', deletedAt: null },
      });
      if (confirmedRegs > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Impossible de supprimer ce camp : des inscriptions confirmées existent',
        });
      }

      const result = await ctx.prisma.camp.updateMany({
        where: { id: input.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (result.count === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Camp non trouvé' });
      }

      return { success: true };
    }),

  listCampTypes: publicProcedure
    .output(z.array(z.object({
      id: z.string().uuid(),
      name: z.string(),
      description: z.string().nullable(),
      active: z.boolean(),
    })))
    .query(async ({ ctx }) => {
      return ctx.prisma.campType.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, description: true, active: true },
      });
    }),

  duplicate: staffProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(3).max(200),
    }))
    .output(campSchema)
    .mutation(async ({ ctx, input }) => {
      const source = await ctx.prisma.camp.findFirst({
        where: { id: input.id, deletedAt: null },
      });
      if (!source) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Camp source non trouvé' });
      }

      const camp = await ctx.prisma.camp.create({
        data: {
          name: input.name,
          description: source.description,
          campTypeId: source.campTypeId,
          location: source.location,
          maxCapacity: source.maxCapacity,
          startDate: source.startDate,
          endDate: source.endDate,
          registrationDeadline: source.registrationDeadline,
          pricePerDay: source.pricePerDay,
          status: 'DRAFT',
          createdBy: ctx.user.id,
        },
      });

      return mapCamp(camp);
    }),
});
