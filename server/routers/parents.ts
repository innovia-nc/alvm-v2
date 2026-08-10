import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { hash } from 'bcryptjs';
import { router, protectedProcedure, staffProcedure } from '@/server/trpc/init';
import { BCRYPT_ROUNDS } from '@/server/helpers/password';
import type { Prisma } from '@prisma/client';

// NOTE: Output schemas are intentionally lenient on `email` (z.string() rather
// than z.string().email()). Some legacy rows in BDD have malformed emails and
// a strict .email() check on outputs causes getById/list to crash.
// Inputs (create/update mutations) remain strict via z.string().email().
const parentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string(),
  homePhone: z.string().nullable(),
  workPhone: z.string().nullable(),
  email: z.string(),
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
    email: z.string(),
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
  homePhone: string | null;
  workPhone: string | null;
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
    homePhone: p.homePhone ?? null,
    workPhone: p.workPhone ?? null,
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
      homePhone: z.string().optional().nullable(),
      workPhone: z.string().optional().nullable(),
      email: z.string().email().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      postalCode: z.string().regex(/^\d{5}$/, 'Code postal : 5 chiffres').optional().or(z.literal('')),
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
      if (input.homePhone !== undefined) data.homePhone = input.homePhone;
      if (input.workPhone !== undefined) data.workPhone = input.workPhone;
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
      homePhone: z.string().optional().or(z.literal('')),
      workPhone: z.string().optional().or(z.literal('')),
      address: z.string().optional().or(z.literal('')),
      city: z.string().optional().or(z.literal('')),
      postalCode: z.string().regex(/^\d{5}$/, 'Code postal : 5 chiffres').optional().or(z.literal('')),
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
        throw new TRPCError({ code: 'CONFLICT', message: 'Un compte avec cet email existe déjà' });
      }

      const existingParent = await ctx.prisma.parent.findFirst({
        where: { email: input.email, deletedAt: null },
      });
      if (existingParent) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Un parent avec cet email existe déjà' });
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
          const hashedPassword = await hash(input.password, BCRYPT_ROUNDS);
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
            homePhone: input.homePhone || null,
            workPhone: input.workPhone || null,
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
      homePhone: z.string().optional().nullable(),
      workPhone: z.string().optional().nullable(),
      email: z.string().email().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      postalCode: z.string().regex(/^\d{5}$/, 'Code postal : 5 chiffres').optional().or(z.literal('')),
      employeur: z.string().max(100).nullable().optional(),
      fonction: z.string().max(100).nullable().optional(),
    }))
    .output(parentSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.parent.findFirst({
        where: { userId: input.id, deletedAt: null },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Parent non trouvé' });
      }

      const { id, ...updates } = input;

      const data: Prisma.ParentUpdateInput = {};
      if (updates.firstName !== undefined) data.firstName = updates.firstName;
      if (updates.lastName !== undefined) data.lastName = updates.lastName;
      if (updates.phone !== undefined) data.phone = updates.phone;
      if (input.homePhone !== undefined) data.homePhone = input.homePhone;
      if (input.workPhone !== undefined) data.workPhone = input.workPhone;
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

  delete: staffProcedure
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

      // US-FAM-01 / US-FAM-02 — invariant « un enfant a toujours au moins un
      // parent », porté aussi par un trigger legacy sur `children_parents`.
      // On ne peut donc PAS supprimer aveuglement tous les liens du parent :
      // il faut d'abord savoir, enfant par enfant, s'il reste un autre parent.
      const childLinks = await ctx.prisma.childParent.findMany({
        where: { parentId: input.id },
        select: {
          childId: true,
          child: { select: { firstName: true, lastName: true, deletedAt: true } },
        },
      });

      // Un parent déjà archivé ne « compte » pas comme parent restant.
      const siblingLinks = childLinks.length > 0
        ? await ctx.prisma.childParent.findMany({
            where: {
              childId: { in: childLinks.map((l) => l.childId) },
              parentId: { not: input.id },
              parent: { deletedAt: null },
            },
            select: { childId: true },
          })
        : [];

      const childrenWithAnotherParent = new Set(siblingLinks.map((l) => l.childId));

      // Enfants encore actifs dont ce parent est le dernier parent : blocage.
      const blockingChildren = childLinks
        .filter((l) => !childrenWithAnotherParent.has(l.childId) && l.child.deletedAt === null)
        .map((l) => `${l.child.firstName} ${l.child.lastName}`);

      if (blockingChildren.length > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            blockingChildren.length === 1
              ? `Impossible de supprimer ce parent : il est le dernier parent rattaché à ${blockingChildren[0]}. Rattachez un autre parent à cet enfant, ou supprimez d'abord l'enfant.`
              : `Impossible de supprimer ce parent : il est le dernier parent rattaché à ${blockingChildren.join(', ')}. Rattachez un autre parent à ces enfants, ou supprimez-les d'abord.`,
        });
      }

      // Seuls les liens des enfants qui conservent un autre parent sont
      // supprimables. Les liens vers des enfants déjà archivés sont conservés :
      // les retirer violerait l'invariant (le trigger legacy les refuse) et ils
      // gardent la trace du rattachement historique.
      const removableChildIds = childLinks
        .filter((l) => childrenWithAnotherParent.has(l.childId))
        .map((l) => l.childId);

      try {
        await ctx.prisma.$transaction(async (tx) => {
          const result = await tx.parent.updateMany({
            where: { userId: input.id, deletedAt: null },
            data: { deletedAt: new Date() },
          });

          if (result.count === 0) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Parent non trouvé' });
          }

          if (removableChildIds.length > 0) {
            await tx.childParent.deleteMany({
              where: { parentId: input.id, childId: { in: removableChildIds } },
            });
          }
        });
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        // Filet de sécurité : si l'invariant est malgré tout violé côté BDD
        // (course entre la vérification et l'écriture), on renvoie un message
        // métier et jamais l'erreur technique brute de Prisma (US-FAM-02).
        if (err instanceof Error && err.message.includes('dernier parent')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              "Impossible de supprimer ce parent : il est le dernier parent rattaché à un enfant. Rattachez un autre parent à cet enfant, ou supprimez d'abord l'enfant.",
          });
        }
        throw err;
      }

      return { success: true };
    }),
});
