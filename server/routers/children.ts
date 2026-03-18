import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, staffProcedure, parentProcedure } from '@/server/trpc/init';
import type { Prisma, GenderType } from '@prisma/client';

type Gender = 'MALE' | 'FEMALE' | 'OTHER';

const relationshipEnum = z.enum([
  'mother', 'father', 'guardian', 'step_mother', 'step_father', 'grandparent', 'other',
]);

const associatedParentSchema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  phone: z.string(),
  isPrimary: z.boolean(),
  relationship: relationshipEnum.nullable(),
});

const medicalInfoSchema = z.object({
  allergies: z.array(z.string()).default([]),
  medications: z.array(z.string()).default([]),
  conditions: z.array(z.string()).default([]),
  diet_restrictions: z.array(z.string()).default([]),
  notes: z.string().default(''),
});

const childSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  birthDate: z.date(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  ecole: z.string().nullable(),
  medicalInfo: medicalInfoSchema,
  emergencyContactName: z.string(),
  emergencyContactPhone: z.string(),
  emergencyContactRelation: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  parents: z.array(associatedParentSchema),
});

const parentInclude = {
  parentLinks: {
    include: {
      parent: {
        select: { firstName: true, lastName: true, email: true, phone: true },
      },
    },
    orderBy: [
      { isPrimary: 'desc' as const },
      { createdAt: 'asc' as const },
    ] as Prisma.ChildParentOrderByWithRelationInput[],
  },
};

function mapChild(c: any) {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    birthDate: c.birthDate,
    gender: c.gender as Gender,
    ecole: c.ecole,
    medicalInfo: (c.medicalInfo || {
      allergies: [], medications: [], conditions: [], diet_restrictions: [], notes: '',
    }) as z.infer<typeof medicalInfoSchema>,
    emergencyContactName: c.emergencyContactName,
    emergencyContactPhone: c.emergencyContactPhone,
    emergencyContactRelation: c.emergencyContactRelation,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    parents: (c.parentLinks || []).map((link: any) => ({
      id: link.id,
      parentId: link.parentId,
      firstName: link.parent.firstName,
      lastName: link.parent.lastName,
      email: link.parent.email,
      phone: link.parent.phone,
      isPrimary: link.isPrimary,
      relationship: link.relationship,
    })),
  };
}

/** Builds the Prisma WHERE for child access: parents see only their children */
function childAccessWhere(
  role: string,
  userId: string,
  extra?: Prisma.ChildWhereInput,
): Prisma.ChildWhereInput {
  const base: Prisma.ChildWhereInput = { deletedAt: null, ...extra };
  if (role === 'PARENT') {
    base.parentLinks = { some: { parentId: userId } };
  }
  return base;
}

export const childrenRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
      parentId: z.string().uuid().optional(),
      search: z.string().optional(),
      ageMin: z.number().min(0).max(100).optional(),
      ageMax: z.number().min(0).max(100).optional(),
      sortBy: z.enum(['lastName', 'firstName', 'birthDate', 'createdAt']).default('lastName'),
      sortOrder: z.enum(['asc', 'desc']).default('asc'),
    }))
    .output(z.object({ children: z.array(childSchema), total: z.number() }))
    .query(async ({ ctx, input }) => {
      const { limit, offset, parentId, search, ageMin, ageMax, sortBy, sortOrder } = input;

      const where: Prisma.ChildWhereInput = {
        deletedAt: null,
      };

      // Parent sees only their children
      if (ctx.user.role === 'PARENT') {
        where.parentLinks = { some: { parentId: ctx.user.id } };
      } else if (parentId) {
        where.parentLinks = { some: { parentId } };
      }

      // Age filter: convert age range to birthDate range
      if (ageMin !== undefined || ageMax !== undefined) {
        const today = new Date();
        if (ageMax !== undefined) {
          // Born after this date = younger than ageMax+1
          const minBirthDate = new Date(today.getFullYear() - ageMax - 1, today.getMonth(), today.getDate());
          where.birthDate = { ...where.birthDate as object, gte: minBirthDate };
        }
        if (ageMin !== undefined) {
          // Born before this date = older than ageMin
          const maxBirthDate = new Date(today.getFullYear() - ageMin, today.getMonth(), today.getDate());
          where.birthDate = { ...where.birthDate as object, lte: maxBirthDate };
        }
      }

      if (search) {
        where.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          {
            parentLinks: {
              some: {
                parent: {
                  OR: [
                    { firstName: { contains: search, mode: 'insensitive' } },
                    { lastName: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                  ],
                },
              },
            },
          },
        ];
      }

      const [children, total] = await Promise.all([
        ctx.prisma.child.findMany({
          where,
          include: parentInclude,
          orderBy: { [sortBy]: sortOrder },
          take: limit,
          skip: offset,
        }),
        ctx.prisma.child.count({ where }),
      ]);

      return { children: children.map(mapChild), total };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(childSchema.nullable())
    .query(async ({ ctx, input }) => {
      const child = await ctx.prisma.child.findFirst({
        where: childAccessWhere(ctx.user.role, ctx.user.id, { id: input.id }),
        include: parentInclude,
      });
      return child ? mapChild(child) : null;
    }),

  create: staffProcedure
    .input(z.object({
      firstName: z.string().min(2).max(50),
      lastName: z.string().min(2).max(50),
      birthDate: z.string().datetime(),
      gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
      ecole: z.string().max(100).nullable().optional(),
      medicalInfo: medicalInfoSchema.optional().default({
        allergies: [], medications: [], conditions: [], diet_restrictions: [], notes: '',
      }),
      emergencyContactName: z.string().min(2).max(100),
      emergencyContactPhone: z.string().min(6),
      emergencyContactRelation: z.string().optional(),
      parents: z.array(z.object({
        parentId: z.string().uuid(),
        isPrimary: z.boolean().default(false),
        relationship: relationshipEnum.optional(),
      }))
        .min(1, 'Au moins un parent requis')
        .max(3, 'Maximum 3 parents autorises')
        .refine(
          (parents) => parents.filter((p) => p.isPrimary).length === 1,
          { message: 'Exactement un parent doit etre marque comme principal' },
        ),
    }))
    .output(childSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify all parents exist
      for (const p of input.parents) {
        const exists = await ctx.prisma.parent.findFirst({
          where: { userId: p.parentId, deletedAt: null },
        });
        if (!exists) {
          throw new TRPCError({ code: 'NOT_FOUND', message: `Parent ${p.parentId} non trouve` });
        }
      }

      const child = await ctx.prisma.$transaction(async (tx) => {
        const created = await tx.child.create({
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            birthDate: new Date(input.birthDate),
            gender: input.gender,
            ecole: input.ecole || null,
            medicalInfo: input.medicalInfo as any,
            emergencyContactName: input.emergencyContactName,
            emergencyContactPhone: input.emergencyContactPhone,
            emergencyContactRelation: input.emergencyContactRelation || null,
          },
        });

        for (const p of input.parents) {
          await tx.childParent.create({
            data: {
              childId: created.id,
              parentId: p.parentId,
              isPrimary: p.isPrimary,
              relationship: p.relationship || null,
            },
          });
        }

        return tx.child.findUniqueOrThrow({
          where: { id: created.id },
          include: parentInclude,
        });
      });

      return mapChild(child);
    }),

  createByParent: parentProcedure
    .input(z.object({
      firstName: z.string().min(2).max(50),
      lastName: z.string().min(2).max(50),
      birthDate: z.string().datetime(),
      gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
      ecole: z.string().max(100).nullable().optional(),
      medicalInfo: medicalInfoSchema.optional().default({
        allergies: [], medications: [], conditions: [], diet_restrictions: [], notes: '',
      }),
      emergencyContactName: z.string().min(2).max(100),
      emergencyContactPhone: z.string().min(6),
      emergencyContactRelation: z.string().optional(),
      relationship: relationshipEnum.optional(),
    }))
    .output(childSchema)
    .mutation(async ({ ctx, input }) => {
      const parentId = ctx.user.id;

      // Verify the parent profile exists
      const parentExists = await ctx.prisma.parent.findFirst({
        where: { userId: parentId, deletedAt: null },
      });
      if (!parentExists) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Profil parent non trouve' });
      }

      const child = await ctx.prisma.$transaction(async (tx) => {
        const created = await tx.child.create({
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            birthDate: new Date(input.birthDate),
            gender: input.gender,
            ecole: input.ecole || null,
            medicalInfo: input.medicalInfo as any,
            emergencyContactName: input.emergencyContactName,
            emergencyContactPhone: input.emergencyContactPhone,
            emergencyContactRelation: input.emergencyContactRelation || null,
          },
        });

        await tx.childParent.create({
          data: {
            childId: created.id,
            parentId,
            isPrimary: true,
            relationship: input.relationship || null,
          },
        });

        return tx.child.findUniqueOrThrow({
          where: { id: created.id },
          include: parentInclude,
        });
      });

      return mapChild(child);
    }),

  update: staffProcedure
    .input(z.object({
      id: z.string().uuid(),
      firstName: z.string().min(2).max(50).optional(),
      lastName: z.string().min(2).max(50).optional(),
      birthDate: z.string().datetime().optional(),
      gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
      ecole: z.string().max(100).nullable().optional(),
      medicalInfo: medicalInfoSchema.optional(),
      emergencyContactName: z.string().min(2).max(100).optional(),
      emergencyContactPhone: z.string().min(6).optional(),
      emergencyContactRelation: z.string().optional(),
    }))
    .output(childSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const existing = await ctx.prisma.child.findFirst({
        where: childAccessWhere(ctx.user.role, ctx.user.id, { id }),
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Enfant non trouve ou acces refuse' });
      }

      const data: Prisma.ChildUpdateInput = {};
      if (updates.firstName !== undefined) data.firstName = updates.firstName;
      if (updates.lastName !== undefined) data.lastName = updates.lastName;
      if (updates.birthDate !== undefined) data.birthDate = new Date(updates.birthDate);
      if (updates.gender !== undefined) data.gender = updates.gender;
      if (updates.ecole !== undefined) data.ecole = updates.ecole;
      if (updates.medicalInfo !== undefined) data.medicalInfo = updates.medicalInfo as any;
      if (updates.emergencyContactName !== undefined) data.emergencyContactName = updates.emergencyContactName;
      if (updates.emergencyContactPhone !== undefined) data.emergencyContactPhone = updates.emergencyContactPhone;
      if (updates.emergencyContactRelation !== undefined) data.emergencyContactRelation = updates.emergencyContactRelation;

      if (Object.keys(data).length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucune modification fournie' });
      }

      const child = await ctx.prisma.child.update({
        where: { id },
        data,
        include: parentInclude,
      });

      return mapChild(child);
    }),

  delete: staffProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.child.findFirst({
        where: childAccessWhere(ctx.user.role, ctx.user.id, { id: input.id }),
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Enfant non trouve ou acces refuse' });
      }

      const activeRegistrations = await ctx.prisma.registration.count({
        where: { childId: input.id, status: 'CONFIRMED', deletedAt: null },
      });
      if (activeRegistrations > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Impossible de supprimer cet enfant : des inscriptions actives existent',
        });
      }

      await ctx.prisma.child.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });

      return { success: true };
    }),

  getParents: protectedProcedure
    .input(z.object({ childId: z.string().uuid() }))
    .output(z.array(associatedParentSchema))
    .query(async ({ ctx, input }) => {
      const child = await ctx.prisma.child.findFirst({
        where: childAccessWhere(ctx.user.role, ctx.user.id, { id: input.childId }),
      });
      if (!child) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Enfant non trouve ou acces refuse' });
      }

      const links = await ctx.prisma.childParent.findMany({
        where: { childId: input.childId },
        include: {
          parent: { select: { firstName: true, lastName: true, email: true, phone: true } },
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });

      return links.map((link) => ({
        id: link.id,
        parentId: link.parentId,
        firstName: link.parent.firstName,
        lastName: link.parent.lastName,
        email: link.parent.email,
        phone: link.parent.phone,
        isPrimary: link.isPrimary,
        relationship: link.relationship as z.infer<typeof relationshipEnum> | null,
      }));
    }),

  addParent: staffProcedure
    .input(z.object({
      childId: z.string().uuid(),
      parentId: z.string().uuid(),
      isPrimary: z.boolean().default(false),
      relationship: relationshipEnum.optional(),
    }))
    .output(associatedParentSchema)
    .mutation(async ({ ctx, input }) => {
      const child = await ctx.prisma.child.findFirst({
        where: { id: input.childId, deletedAt: null },
      });
      if (!child) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Enfant non trouve' });
      }

      const parent = await ctx.prisma.parent.findFirst({
        where: { userId: input.parentId, deletedAt: null },
        select: { userId: true, firstName: true, lastName: true, email: true, phone: true },
      });
      if (!parent) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Parent non trouve' });
      }

      const linkCount = await ctx.prisma.childParent.count({
        where: { childId: input.childId },
      });
      if (linkCount >= 3) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Un enfant ne peut avoir plus de 3 parents associes',
        });
      }

      const existing = await ctx.prisma.childParent.findUnique({
        where: { childId_parentId: { childId: input.childId, parentId: input.parentId } },
      });
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Ce parent est deja associe a cet enfant' });
      }

      const link = await ctx.prisma.childParent.create({
        data: {
          childId: input.childId,
          parentId: input.parentId,
          isPrimary: input.isPrimary,
          relationship: input.relationship || null,
        },
      });

      return {
        id: link.id,
        parentId: link.parentId,
        firstName: parent.firstName,
        lastName: parent.lastName,
        email: parent.email,
        phone: parent.phone,
        isPrimary: link.isPrimary,
        relationship: link.relationship as z.infer<typeof relationshipEnum> | null,
      };
    }),

  removeParent: staffProcedure
    .input(z.object({
      childId: z.string().uuid(),
      parentId: z.string().uuid(),
    }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const link = await ctx.prisma.childParent.findUnique({
        where: { childId_parentId: { childId: input.childId, parentId: input.parentId } },
      });
      if (!link) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Association parent-enfant non trouvee' });
      }

      const totalLinks = await ctx.prisma.childParent.count({
        where: { childId: input.childId },
      });
      if (totalLinks <= 1) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: "Impossible de retirer le dernier parent d'un enfant",
        });
      }

      await ctx.prisma.childParent.delete({
        where: { childId_parentId: { childId: input.childId, parentId: input.parentId } },
      });

      return { success: true };
    }),

  setPrimaryParent: staffProcedure
    .input(z.object({
      childId: z.string().uuid(),
      parentId: z.string().uuid(),
    }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const link = await ctx.prisma.childParent.findUnique({
        where: { childId_parentId: { childId: input.childId, parentId: input.parentId } },
      });
      if (!link) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Association parent-enfant non trouvee' });
      }

      await ctx.prisma.$transaction([
        // Reset all to non-primary
        ctx.prisma.childParent.updateMany({
          where: { childId: input.childId },
          data: { isPrimary: false },
        }),
        // Set the target as primary
        ctx.prisma.childParent.update({
          where: { childId_parentId: { childId: input.childId, parentId: input.parentId } },
          data: { isPrimary: true },
        }),
      ]);

      return { success: true };
    }),
});
