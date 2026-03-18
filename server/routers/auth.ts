import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { hash, compare } from 'bcryptjs';
import { router, publicProcedure, protectedProcedure } from '@/server/trpc/init';
import type { UserRole } from '@prisma/client';

type Role = 'PARENT' | 'STAFF' | 'ADMIN';

const userProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  role: z.enum(['PARENT', 'STAFF', 'ADMIN']),
  staffRole: z.enum(['ANIMATOR']).nullable(),
  createdAt: z.date(),
});

export const authRouter = router({
  /**
   * Public endpoint for NextAuth Credentials provider.
   * Verifies email + password and returns user data if valid.
   */
  verifyCredentials: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }))
    .output(z.object({
      id: z.string().uuid(),
      email: z.string().email(),
      name: z.string().nullable(),
      image: z.string().nullable(),
      role: z.enum(['PARENT', 'STAFF', 'ADMIN']),
    }).nullable())
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { email: input.email },
        include: {
          accounts: {
            where: { provider: 'credentials' },
            select: { providerAccountId: true },
          },
        },
      });

      if (!user || user.accounts.length === 0) {
        return null;
      }

      const isValid = await compare(input.password, user.accounts[0].providerAccountId);
      if (!isValid) {
        return null;
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role as Role,
      };
    }),

  me: protectedProcedure
    .output(userProfileSchema)
    .query(async ({ ctx }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
        include: {
          staffMember: { select: { userId: true } },
        },
      });

      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Utilisateur non trouvé' });
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role as Role,
        staffRole: (user.staffMember && !user.staffMember.userId ? null : user.staffMember ? 'ANIMATOR' as const : null),
        createdAt: user.createdAt,
      };
    }),

  updateProfile: protectedProcedure
    .input(z.object({
      name: z.string().min(2).max(100).optional(),
      image: z.string().url().optional(),
    }))
    .output(userProfileSchema)
    .mutation(async ({ ctx, input }) => {
      if (!input.name && !input.image) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucune modification fournie' });
      }

      const data: { name?: string; image?: string } = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.image !== undefined) data.image = input.image;

      const user = await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data,
        include: {
          staffMember: { select: { userId: true } },
        },
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role as Role,
        staffRole: user.staffMember ? 'ANIMATOR' as const : null,
        createdAt: user.createdAt,
      };
    }),

  changePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string().min(6),
      newPassword: z.string()
        .min(8, 'Minimum 8 caractères')
        .regex(/[A-Z]/, 'Au moins une majuscule')
        .regex(/[a-z]/, 'Au moins une minuscule')
        .regex(/[0-9]/, 'Au moins un chiffre'),
    }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.prisma.account.findFirst({
        where: { userId: ctx.user.id, provider: 'credentials' },
      });

      if (!account) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Compte credentials non trouvé' });
      }

      const isValid = await compare(input.currentPassword, account.providerAccountId);
      if (!isValid) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Mot de passe actuel incorrect' });
      }

      const newHashedPassword = await hash(input.newPassword, 12);

      await ctx.prisma.account.update({
        where: { id: account.id },
        data: { providerAccountId: newHashedPassword },
      });

      return { success: true };
    }),

  deleteAccount: protectedProcedure
    .input(z.object({ password: z.string().min(6) }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.prisma.account.findFirst({
        where: { userId: ctx.user.id, provider: 'credentials' },
      });

      if (!account) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Compte credentials non trouvé' });
      }

      const isValid = await compare(input.password, account.providerAccountId);
      if (!isValid) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Mot de passe incorrect' });
      }

      // Check for active registrations
      const activeRegistrations = await ctx.prisma.registration.count({
        where: {
          child: {
            parentLinks: { some: { parentId: ctx.user.id } },
          },
          status: 'CONFIRMED',
          deletedAt: null,
        },
      });

      if (activeRegistrations > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Impossible de supprimer le compte : des inscriptions actives existent',
        });
      }

      await ctx.prisma.$transaction(async (tx) => {
        // Soft delete parent profile
        await tx.parent.updateMany({
          where: { userId: ctx.user.id, deletedAt: null },
          data: { deletedAt: new Date() },
        });

        // Soft delete staff profile
        await tx.staffMember.updateMany({
          where: { userId: ctx.user.id, deletedAt: null },
          data: { deletedAt: new Date() },
        });

        // Soft delete children where this parent is the only parent
        const childLinks = await tx.childParent.findMany({
          where: { parentId: ctx.user.id },
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

        // Remove parent-child associations
        await tx.childParent.deleteMany({
          where: { parentId: ctx.user.id },
        });
      });

      return { success: true };
    }),
});
