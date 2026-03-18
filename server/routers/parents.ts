import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { hash } from 'bcryptjs';
import { router, protectedProcedure, staffProcedure, adminProcedure } from '@/server/trpc/init';
import type { Prisma } from '@prisma/client';

const parentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string(),
  email: z.string().email(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  employeur: z.string().nullable(),
  fonction: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const parentWithUserSchema = parentSchema.extend({
  user: z.object({
    email: z.string().email(),
    name: z.string().nullable(),
    emailVerified: z.date().nullable(),
  }),
  childrenCount: z.number().optional(),
  registrationsCount: z.number().optional(),
  deletedAt: z.date().nullable().optional(),
});

function mapParent(p: {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
  employeur: string | null;
  fonction: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: p.userId,
    userId: p.userId,
    firstName: p.firstName,
    lastName: p.lastName,
    phone: p.phone,
    email: p.email,
    address: p.address || null,
    city: p.city || null,
    postalCode: p.postalCode || null,
    employeur: p.employeur,
    fonction: p.fonction,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export const parentsRouter = router({
  list: staffProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
      search: z.string().optional(),
      sortBy: z.enum(['lastName', 'firstName', 'createdAt']).default('lastName'),
      sortOrder: z.enum(['asc', 'desc']).default('asc'),
      status: z.enum(['all', 'active', 'inactive']).default('active'),
    }))
    .output(z.object({
      parents: z.array(parentWithUserSchema),
      total: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const { limit, offset, search, sortBy, sortOrder, status } = input;

      const deletedAtFilter: Prisma.ParentWhereInput =
        status === 'active' ? { deletedAt: null } :
        status === 'inactive' ? { deletedAt: { not: null } } :
        {};

      const where: Prisma.ParentWhereInput = {
        ...deletedAtFilter,
        ...(search && {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { user: { email: { contains: search, mode: 'insensitive' as const } } },
          ],
        }),
      };

      const [parents, total] = await Promise.all([
        ctx.prisma.parent.findMany({
          where,
          include: {
            user: { select: { email: true, name: true, emailVerified: true } },
            childrenLinks: { select: { id: true } },
          },
          orderBy: { [sortBy]: sortOrder },
          take: limit,
          skip: offset,
        }),
        ctx.prisma.parent.count({ where }),
      ]);

      // Get registrations counts in bulk
      const parentIds = parents.map((p) => p.userId);
      const regCounts = parentIds.length > 0
        ? await ctx.prisma.registration.groupBy({
            by: ['parentId'],
            where: { parentId: { in: parentIds } },
            _count: true,
          })
        : [];

      const regCountMap = new Map(regCounts.map((r) => [r.parentId, r._count]));

      return {
        parents: parents.map((p) => ({
          ...mapParent(p),
          deletedAt: p.deletedAt,
          user: p.user,
          childrenCount: p.childrenLinks.length,
          registrationsCount: regCountMap.get(p.userId) ?? 0,
        })),
        total,
      };
    }),

  getMe: protectedProcedure
    .output(parentSchema.nullable())
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'PARENT') return null;

      const parent = await ctx.prisma.parent.findFirst({
        where: { userId: ctx.user.id, deletedAt: null },
      });

      return parent ? mapParent(parent) : null;
    }),

  getById: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(parentWithUserSchema.nullable())
    .query(async ({ ctx, input }) => {
      const parent = await ctx.prisma.parent.findFirst({
        where: { userId: input.id, deletedAt: null },
        include: {
          user: { select: { email: true, name: true, emailVerified: true } },
        },
      });

      if (!parent) return null;

      return {
        ...mapParent(parent),
        user: parent.user,
      };
    }),

  update: protectedProcedure
    .input(z.object({
      firstName: z.string().min(2).max(50).optional(),
      lastName: z.string().min(2).max(50).optional(),
      phone: z.string().min(6).optional(),
      email: z.string().email().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      postalCode: z.string().optional(),
      employeur: z.string().max(100).nullable().optional(),
      fonction: z.string().max(100).nullable().optional(),
    }))
    .output(parentSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'PARENT') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Seuls les parents peuvent modifier leur profil' });
      }

      const data: Prisma.ParentUpdateInput = {};
      if (input.firstName !== undefined) data.firstName = input.firstName;
      if (input.lastName !== undefined) data.lastName = input.lastName;
      if (input.phone !== undefined) data.phone = input.phone;
      if (input.email !== undefined) data.email = input.email;
      if (input.address !== undefined) data.address = input.address;
      if (input.city !== undefined) data.city = input.city;
      if (input.postalCode !== undefined) data.postalCode = input.postalCode;
      if (input.employeur !== undefined) data.employeur = input.employeur || null;
      if (input.fonction !== undefined) data.fonction = input.fonction || null;

      if (Object.keys(data).length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucune modification fournie' });
      }

      const result = await ctx.prisma.$transaction(async (tx) => {
        // Sync email to User table if changed
        if (input.email !== undefined) {
          await tx.user.update({
            where: { id: ctx.user.id },
            data: { email: input.email },
          });
        }

        return tx.parent.update({
          where: { userId: ctx.user.id },
          data,
        });
      });

      return mapParent(result);
    }),

  create: staffProcedure
    .input(z.object({
      firstName: z.string().min(2).max(50),
      lastName: z.string().min(2).max(50),
      email: z.string().email(),
      phone: z.string().min(6),
      address: z.string().optional().or(z.literal('')),
      city: z.string().optional().or(z.literal('')),
      postalCode: z.string().optional().or(z.literal('')),
      employeur: z.string().max(100).nullable().optional(),
      fonction: z.string().max(100).nullable().optional(),
      password: z.string()
        .min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/)
        .optional(),
    }))
    .output(parentSchema)
    .mutation(async ({ ctx, input }) => {
      const existingUser = await ctx.prisma.user.findUnique({
        where: { email: input.email },
      });
      if (existingUser) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Un compte avec cet email existe deja' });
      }

      const existingParent = await ctx.prisma.parent.findFirst({
        where: { email: input.email, deletedAt: null },
      });
      if (existingParent) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Un parent avec cet email existe deja' });
      }

      const result = await ctx.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            name: `${input.firstName} ${input.lastName}`,
            role: 'PARENT',
          },
        });

        if (input.password) {
          const hashedPassword = await hash(input.password, 12);
          await tx.account.create({
            data: {
              userId: user.id,
              type: 'credentials',
              provider: 'credentials',
              providerAccountId: hashedPassword,
            },
          });
        }

        return tx.parent.create({
          data: {
            userId: user.id,
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            phone: input.phone,
            address: input.address || '',
            city: input.city || '',
            postalCode: input.postalCode || '',
            employeur: input.employeur || null,
            fonction: input.fonction || null,
          },
        });
      });

      return mapParent(result);
    }),

  updateByStaff: staffProcedure
    .input(z.object({
      id: z.string().uuid(),
      firstName: z.string().min(2).max(50).optional(),
      lastName: z.string().min(2).max(50).optional(),
      phone: z.string().min(6).optional(),
      email: z.string().email().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      postalCode: z.string().optional(),
      employeur: z.string().max(100).nullable().optional(),
      fonction: z.string().max(100).nullable().optional(),
    }))
    .output(parentSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.parent.findFirst({
        where: { userId: input.id, deletedAt: null },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Parent non trouve' });
      }

      const { id, ...updates } = input;

      const data: Prisma.ParentUpdateInput = {};
      if (updates.firstName !== undefined) data.firstName = updates.firstName;
      if (updates.lastName !== undefined) data.lastName = updates.lastName;
      if (updates.phone !== undefined) data.phone = updates.phone;
      if (updates.address !== undefined) data.address = updates.address;
      if (updates.city !== undefined) data.city = updates.city;
      if (updates.postalCode !== undefined) data.postalCode = updates.postalCode;
      if (updates.employeur !== undefined) data.employeur = updates.employeur || null;
      if (updates.fonction !== undefined) data.fonction = updates.fonction || null;

      if (Object.keys(data).length === 0 && !updates.email) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucune modification fournie' });
      }

      const result = await ctx.prisma.$transaction(async (tx) => {
        if (updates.email) {
          data.email = updates.email;
          await tx.user.update({
            where: { id },
            data: { email: updates.email },
          });
        }

        return tx.parent.update({
          where: { userId: id },
          data,
        });
      });

      return mapParent(result);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const activeRegistrations = await ctx.prisma.registration.count({
        where: {
          child: { parentLinks: { some: { parentId: input.id } } },
          status: 'CONFIRMED',
          deletedAt: null,
        },
      });

      if (activeRegistrations > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Impossible de supprimer ce parent : des inscriptions actives existent pour ses enfants',
        });
      }

      await ctx.prisma.$transaction(async (tx) => {
        const result = await tx.parent.updateMany({
          where: { userId: input.id, deletedAt: null },
          data: { deletedAt: new Date() },
        });

        if (result.count === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Parent non trouve' });
        }

        // Soft delete children where this parent is the only parent
        const childLinks = await tx.childParent.findMany({
          where: { parentId: input.id },
          select: { childId: true },
        });

        for (const link of childLinks) {
          const parentCount = await tx.childParent.count({
            where: { childId: link.childId },
          });
          if (parentCount === 1) {
            await tx.child.update({
              where: { id: link.childId },
              data: { deletedAt: new Date() },
            });
          }
        }

        await tx.childParent.deleteMany({ where: { parentId: input.id } });
      });

      return { success: true };
    }),
});
