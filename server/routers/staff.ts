import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { hash } from 'bcryptjs';
import { router, staffProcedure } from '@/server/trpc/init';
import { generatePassword } from '@/server/helpers/password';
import type { Prisma } from '@prisma/client';

// Output schemas use plain z.string() for email (no .email()) to avoid
// runtime crashes if BDD contains legacy malformed values. Input/mutation
// schemas keep z.string().email() for new data.
const staffMemberSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const staffMemberWithUserSchema = staffMemberSchema.extend({
  user: z.object({
    email: z.string(),
    name: z.string().nullable(),
    emailVerified: z.date().nullable(),
  }),
});

export const staffRouter = router({
  list: staffProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
      search: z.string().optional(),
      sortBy: z.enum(['lastName', 'firstName', 'createdAt']).default('lastName'),
      sortOrder: z.enum(['asc', 'desc']).default('asc'),
    }))
    .output(z.object({
      staff: z.array(staffMemberWithUserSchema),
      total: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const { limit, offset, search, sortBy, sortOrder } = input;

      const where: Prisma.StaffMemberWhereInput = {
        deletedAt: null,
        ...(search && {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { user: { email: { contains: search, mode: 'insensitive' as const } } },
          ],
        }),
      };

      const [staff, total] = await Promise.all([
        ctx.prisma.staffMember.findMany({
          where,
          include: {
            user: { select: { email: true, name: true, emailVerified: true } },
          },
          orderBy: { [sortBy]: sortOrder },
          take: limit,
          skip: offset,
        }),
        ctx.prisma.staffMember.count({ where }),
      ]);

      return {
        staff: staff.map((s) => ({
          id: s.userId,
          userId: s.userId,
          firstName: s.firstName,
          lastName: s.lastName,
          email: s.email,
          phone: s.phone,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          user: s.user,
        })),
        total,
      };
    }),

  getById: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(staffMemberWithUserSchema.nullable())
    .query(async ({ ctx, input }) => {
      const s = await ctx.prisma.staffMember.findFirst({
        where: { userId: input.id, deletedAt: null },
        include: {
          user: { select: { email: true, name: true, emailVerified: true } },
        },
      });
      if (!s) return null;

      return {
        id: s.userId,
        userId: s.userId,
        firstName: s.firstName,
        lastName: s.lastName,
        email: s.email,
        phone: s.phone,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        user: s.user,
      };
    }),

  create: staffProcedure
    .input(z.object({
      firstName: z.string().min(2).max(50),
      lastName: z.string().min(2).max(50),
      email: z.string().email(),
      phone: z.string().regex(/^[\d\s\-\(\)\+]*$/).optional().or(z.literal('')),
      // Optionnel : si absent/vide, le serveur génère un mot de passe robuste
      // et renvoie le clair une seule fois (champ `generatedPassword`).
      password: z.string()
        .min(8)
        .regex(/[A-Z]/)
        .regex(/[a-z]/)
        .regex(/[0-9]/)
        .optional()
        .or(z.literal('')),
    }))
    // `generatedPassword` n'est renseigné QUE si le mot de passe a été généré
    // côté serveur (saisie admin laissée vide). Sinon `null`.
    .output(staffMemberSchema.extend({ generatedPassword: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const existingUser = await ctx.prisma.user.findUnique({
        where: { email: input.email },
      });
      if (existingUser) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Un compte avec cet email existe déjà',
        });
      }

      const existingStaff = await ctx.prisma.staffMember.findFirst({
        where: { email: input.email, deletedAt: null },
      });
      if (existingStaff) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Un membre du personnel avec cet email existe déjà',
        });
      }

      // Si l'admin n'a pas saisi de mot de passe, on en génère un et on le
      // renverra en clair une seule fois pour transmission au membre.
      const providedPassword = input.password && input.password.trim() !== ''
        ? input.password
        : null;
      const wasGenerated = providedPassword === null;
      const plainPassword = providedPassword ?? generatePassword();
      const hashedPassword = await hash(plainPassword, 12);

      const result = await ctx.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            name: `${input.firstName} ${input.lastName}`,
            role: 'STAFF',
          },
        });

        await tx.account.create({
          data: {
            userId: user.id,
            type: 'credentials',
            provider: 'credentials',
            providerAccountId: hashedPassword,
          },
        });

        const staff = await tx.staffMember.create({
          data: {
            userId: user.id,
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            phone: input.phone && input.phone.trim() !== '' ? input.phone : null,
          },
        });

        return staff;
      });

      return {
        id: result.userId,
        userId: result.userId,
        firstName: result.firstName,
        lastName: result.lastName,
        email: result.email,
        phone: result.phone,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
        generatedPassword: wasGenerated ? plainPassword : null,
      };
    }),

  update: staffProcedure
    .input(z.object({
      id: z.string().uuid(),
      firstName: z.string().min(2).max(50).optional(),
      lastName: z.string().min(2).max(50).optional(),
      email: z.string().email().optional(),
      phone: z.string().min(6).regex(/^[\d\s\-\(\)\+]+$/).optional(),
    }))
    .output(staffMemberSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.staffMember.findFirst({
        where: { userId: input.id, deletedAt: null },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Membre du personnel non trouvé' });
      }

      const { id, ...updates } = input;

      const data: Prisma.StaffMemberUpdateInput = {};
      if (updates.firstName !== undefined) data.firstName = updates.firstName;
      if (updates.lastName !== undefined) data.lastName = updates.lastName;
      if (updates.phone !== undefined) {
        data.phone = updates.phone.trim() !== '' ? updates.phone : null;
      }

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

        return tx.staffMember.update({
          where: { userId: id },
          data,
        });
      });

      return {
        id: result.userId,
        userId: result.userId,
        firstName: result.firstName,
        lastName: result.lastName,
        email: result.email,
        phone: result.phone,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      };
    }),

  delete: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const campsCount = await ctx.prisma.camp.count({
        where: { createdBy: input.id, deletedAt: null },
      });
      if (campsCount > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Impossible de supprimer ce membre : des camps ont été créés par cette personne',
        });
      }

      const result = await ctx.prisma.staffMember.updateMany({
        where: { userId: input.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      if (result.count === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Membre du personnel non trouvé' });
      }

      return { success: true };
    }),
});
