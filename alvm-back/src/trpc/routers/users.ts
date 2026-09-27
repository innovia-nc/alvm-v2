import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { hash } from 'bcryptjs';
import { router, staffProcedure, adminProcedure } from '@back/trpc/trpc.init';
import { lockAdministrators, deactivateAccount } from '@back/services/account-access.service';
import { generatePassword, BCRYPT_ROUNDS } from '@back/helpers/password';
import type { Prisma, UserRole } from '@prisma/client';

type Role = 'PARENT' | 'STAFF' | 'ADMIN';

// Output schema: lenient on email (z.string()) to tolerate legacy malformed
// rows. Input/mutation schemas keep z.string().email().
const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  role: z.enum(['PARENT', 'STAFF', 'ADMIN']),
  emailVerified: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  parentProfile: z
    .object({
      id: z.string().uuid(),
      firstName: z.string(),
      lastName: z.string(),
      phone: z.string(),
      email: z.string(),
      address: z.string().nullable(),
      city: z.string().nullable(),
      postalCode: z.string().nullable(),
    })
    .nullable(),
  staffProfile: z
    .object({
      id: z.string().uuid(),
      firstName: z.string(),
      lastName: z.string(),
      phone: z.string().nullable(),
      email: z.string(),
    })
    .nullable(),
});

function mapUser(u: {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: UserRole;
  emailVerified: Date | null;
  createdAt: Date;
  updatedAt: Date;
  parent?: {
    userId: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    postalCode: string;
  } | null;
  staffMember?: {
    userId: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string;
  } | null;
}) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    image: u.image,
    role: u.role as Role,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    parentProfile: u.parent
      ? {
          id: u.parent.userId,
          firstName: u.parent.firstName,
          lastName: u.parent.lastName,
          phone: u.parent.phone,
          email: u.parent.email,
          address: u.parent.address || null,
          city: u.parent.city || null,
          postalCode: u.parent.postalCode || null,
        }
      : null,
    staffProfile: u.staffMember
      ? {
          id: u.staffMember.userId,
          firstName: u.staffMember.firstName,
          lastName: u.staffMember.lastName,
          phone: u.staffMember.phone,
          email: u.staffMember.email,
        }
      : null,
  };
}

const includeProfiles = {
  parent: {
    select: {
      userId: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      address: true,
      city: true,
      postalCode: true,
    },
  },
  staffMember: {
    select: {
      userId: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
    },
  },
} as const;

export const usersRouter = router({
  list: staffProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        role: z.enum(['PARENT', 'STAFF', 'ADMIN']).optional(),
        search: z.string().optional(),
      }),
    )
    .output(z.object({ users: z.array(userSchema), total: z.number() }))
    .query(async ({ ctx, input }) => {
      const { limit, offset, role, search } = input;

      const where: Prisma.UserWhereInput = {
        disabledAt: null,
        role: role ?? { not: 'SUPER_ADMIN' },
        ...(search && {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { name: { contains: search, mode: 'insensitive' as const } },
            { parent: { firstName: { contains: search, mode: 'insensitive' as const } } },
            { parent: { lastName: { contains: search, mode: 'insensitive' as const } } },
            { staffMember: { firstName: { contains: search, mode: 'insensitive' as const } } },
            { staffMember: { lastName: { contains: search, mode: 'insensitive' as const } } },
          ],
        }),
      };

      const [users, total] = await Promise.all([
        ctx.prisma.user.findMany({
          where,
          include: includeProfiles,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        ctx.prisma.user.count({ where }),
      ]);

      return { users: users.map(mapUser), total };
    }),

  getById: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(userSchema.nullable())
    .query(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: input.id },
        include: includeProfiles,
      });
      return user && user.role !== 'SUPER_ADMIN' ? mapUser(user) : null;
    }),

  create: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        name: z.string().min(2).max(100),
        role: z.enum(['PARENT', 'STAFF', 'ADMIN']),
        password: z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
        parentProfile: z
          .object({
            firstName: z.string().min(2).max(50),
            lastName: z.string().min(2).max(50),
            phone: z.string().regex(/^\+?[0-9\s\-()]+$/),
            address: z.string().optional(),
            city: z.string().optional(),
            postalCode: z
              .string()
              .regex(/^\d{5}$/, 'Code postal : 5 chiffres')
              .optional()
              .or(z.literal('')),
          })
          .optional(),
        staffProfile: z
          .object({
            firstName: z.string().min(2).max(50),
            lastName: z.string().min(2).max(50),
            phone: z
              .string()
              .regex(/^\+?[0-9\s\-()]+$/)
              .optional(),
          })
          .optional(),
      }),
    )
    .output(userSchema)
    .mutation(async ({ ctx, input }) => {
      const existingUser = await ctx.prisma.user.findFirst({
        where: { email: input.email },
      });
      if (existingUser) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Un utilisateur avec cet email existe déjà',
        });
      }

      if (input.role === 'PARENT' && !input.parentProfile) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Le profil parent est requis pour les utilisateurs PARENT',
        });
      }
      if (input.role === 'STAFF' && !input.staffProfile) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Le profil staff est requis pour les utilisateurs STAFF',
        });
      }

      const hashedPassword = await hash(input.password, BCRYPT_ROUNDS);

      const user = await ctx.prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email: input.email,
            name: input.name,
            emailVerified: new Date(),
            role: input.role,
          },
        });

        await tx.account.create({
          data: {
            userId: newUser.id,
            type: 'credentials',
            provider: 'credentials',
            providerAccountId: hashedPassword,
          },
        });

        if (input.role === 'PARENT' && input.parentProfile) {
          await tx.parent.create({
            data: {
              userId: newUser.id,
              firstName: input.parentProfile.firstName,
              lastName: input.parentProfile.lastName,
              phone: input.parentProfile.phone,
              email: input.email,
              address: input.parentProfile.address || '',
              city: input.parentProfile.city || '',
              postalCode: input.parentProfile.postalCode || '',
            },
          });
        }

        if (input.role === 'STAFF' && input.staffProfile) {
          await tx.staffMember.create({
            data: {
              userId: newUser.id,
              firstName: input.staffProfile.firstName,
              lastName: input.staffProfile.lastName,
              phone: input.staffProfile.phone || null,
              email: input.email,
            },
          });
        }

        return tx.user.findUniqueOrThrow({
          where: { id: newUser.id },
          include: includeProfiles,
        });
      });

      return mapUser(user);
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(2).max(100).optional(),
        email: z.string().email().optional(),
        role: z.enum(['PARENT', 'STAFF', 'ADMIN']).optional(),
        parentProfile: z
          .object({
            firstName: z.string().min(2).max(50).optional(),
            lastName: z.string().min(2).max(50).optional(),
            phone: z
              .string()
              .regex(/^\+?[0-9\s\-()]+$/)
              .optional(),
            address: z.string().optional(),
            city: z.string().optional(),
            postalCode: z
              .string()
              .regex(/^\d{5}$/, 'Code postal : 5 chiffres')
              .optional()
              .or(z.literal('')),
          })
          .optional(),
        staffProfile: z
          .object({
            firstName: z.string().min(2).max(50).optional(),
            lastName: z.string().min(2).max(50).optional(),
            phone: z
              .string()
              .regex(/^\+?[0-9\s\-()]+$/)
              .optional(),
          })
          .optional(),
      }),
    )
    .output(userSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.user.findUnique({ where: { id: input.id } });
      if (existing?.role === 'SUPER_ADMIN')
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Compte super administrateur protégé' });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Utilisateur non trouvé' });
      }

      if (input.email && input.email !== existing.email) {
        const emailExists = await ctx.prisma.user.findFirst({
          where: { email: input.email, id: { not: input.id } },
        });
        if (emailExists) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Un utilisateur avec cet email existe déjà',
          });
        }
      }

      await ctx.prisma.$transaction(async (tx) => {
        await lockAdministrators(tx);
        const current = await tx.user.findUnique({
          where: { id: input.id },
          include: { parent: true, staffMember: true },
        });
        if (!current || current.disabledAt || current.role === 'SUPER_ADMIN')
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Compte inactif' });
        if (input.role && input.role !== current.role) {
          if (
            current.role === 'ADMIN' &&
            (await tx.user.count({ where: { role: 'ADMIN', disabledAt: null } })) <= 1
          ) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'Impossible de rétrograder le dernier administrateur',
            });
          }
          if (
            (input.role === 'PARENT' && (!current.parent || current.parent.deletedAt)) ||
            (input.role === 'STAFF' && (!current.staffMember || current.staffMember.deletedAt))
          ) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'Créez un profil actif adapté avant de changer le rôle',
            });
          }
        }
        const userData: Prisma.UserUpdateInput = {};
        if (input.role && input.role !== current.role) userData.sessionVersion = { increment: 1 };
        if (input.email !== undefined) {
          await tx.parent.updateMany({ where: { userId: input.id }, data: { email: input.email } });
          await tx.staffMember.updateMany({
            where: { userId: input.id },
            data: { email: input.email },
          });
        }
        if (input.name !== undefined) userData.name = input.name;
        if (input.email !== undefined) userData.email = input.email;
        if (input.role !== undefined) userData.role = input.role;

        if (Object.keys(userData).length > 0) {
          await tx.user.update({ where: { id: input.id }, data: userData });
        }

        if (input.parentProfile) {
          const parentData: Prisma.ParentUpdateInput = {};
          if (input.parentProfile.firstName !== undefined)
            parentData.firstName = input.parentProfile.firstName;
          if (input.parentProfile.lastName !== undefined)
            parentData.lastName = input.parentProfile.lastName;
          if (input.parentProfile.phone !== undefined) parentData.phone = input.parentProfile.phone;
          if (input.parentProfile.address !== undefined)
            parentData.address = input.parentProfile.address;
          if (input.parentProfile.city !== undefined) parentData.city = input.parentProfile.city;
          if (input.parentProfile.postalCode !== undefined)
            parentData.postalCode = input.parentProfile.postalCode;

          if (Object.keys(parentData).length > 0) {
            await tx.parent.updateMany({
              where: { userId: input.id, deletedAt: null },
              data: parentData as Prisma.ParentUpdateManyMutationInput,
            });
          }
        }

        if (input.staffProfile) {
          const staffData: Prisma.StaffMemberUpdateInput = {};
          if (input.staffProfile.firstName !== undefined)
            staffData.firstName = input.staffProfile.firstName;
          if (input.staffProfile.lastName !== undefined)
            staffData.lastName = input.staffProfile.lastName;
          if (input.staffProfile.phone !== undefined)
            staffData.phone = input.staffProfile.phone || null;

          if (Object.keys(staffData).length > 0) {
            await tx.staffMember.updateMany({
              where: { userId: input.id, deletedAt: null },
              data: staffData as Prisma.StaffMemberUpdateManyMutationInput,
            });
          }
        }
      });

      const user = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: input.id },
        include: includeProfiles,
      });

      return mapUser(user);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.user.findUnique({ where: { id: input.id } });
      if (existing?.role === 'SUPER_ADMIN')
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Compte super administrateur protégé' });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Utilisateur non trouvé' });
      }

      if (existing.role === 'ADMIN') {
        const adminCount = await ctx.prisma.user.count({ where: { role: 'ADMIN' } });
        if (adminCount <= 1) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Impossible de supprimer le dernier compte administrateur',
          });
        }
      }

      const activeRegistrations = await ctx.prisma.registration.count({
        where: {
          child: { parentLinks: { some: { parentId: input.id } } },
          status: { in: ['PENDING', 'CONFIRMED'] },
          deletedAt: null,
        },
      });

      if (activeRegistrations > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Impossible de supprimer un utilisateur avec des inscriptions actives',
        });
      }

      await ctx.prisma.$transaction(async (tx) => {
        await deactivateAccount(tx, input.id, ctx.user.role);
        await tx.parent.updateMany({
          where: { userId: input.id, deletedAt: null },
          data: { deletedAt: new Date() },
        });

        await tx.staffMember.updateMany({
          where: { userId: input.id, deletedAt: null },
          data: { deletedAt: new Date() },
        });

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

        // Preserve historical family links, including the legacy last-parent invariant.
      });

      return { success: true };
    }),

  resetPassword: staffProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        newPassword: z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/).optional(),
      }),
    )
    .output(z.object({ success: z.boolean(), tempPassword: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.user.findUnique({ where: { id: input.userId } });
      if (existing?.role === 'SUPER_ADMIN')
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Compte super administrateur protégé' });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Utilisateur non trouvé' });
      }

      if (!['ADMIN', 'SUPER_ADMIN'].includes(ctx.user.role) && existing.role !== 'PARENT') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Seul un administrateur peut réinitialiser ce compte',
        });
      }
      if (existing.disabledAt)
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Compte désactivé' });
      const tempPassword = input.newPassword || generatePassword();
      const hashedPassword = await hash(tempPassword, BCRYPT_ROUNDS);
      await ctx.prisma.$transaction(async (tx) => {
        await lockAdministrators(tx);
        const current = await tx.user.findUnique({ where: { id: input.userId } });
        if (
          !current ||
          current.disabledAt ||
          current.role === 'SUPER_ADMIN' ||
          (!['ADMIN', 'SUPER_ADMIN'].includes(ctx.user.role) && current.role !== 'PARENT')
        ) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Réinitialisation non autorisée' });
        }
        const account = await tx.account.findFirst({
          where: { userId: input.userId, provider: 'credentials' },
        });
        if (account)
          await tx.account.update({
            where: { id: account.id },
            data: { providerAccountId: hashedPassword },
          });
        else
          await tx.account.create({
            data: {
              userId: input.userId,
              type: 'credentials',
              provider: 'credentials',
              providerAccountId: hashedPassword,
            },
          });
        await tx.user.update({
          where: { id: input.userId },
          data: { sessionVersion: { increment: 1 } },
        });
      });

      return { success: true, tempPassword };
    }),
});
