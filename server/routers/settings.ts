import { z } from 'zod';
import { router, staffProcedure, adminProcedure } from '@/server/trpc/init';
import type { AppSetting } from '@prisma/client';

const settingCategories = z.enum([
  'organization', 'pricing', 'email', 'accounting', 'maintenance', 'documents',
]);

type SettingCategory = z.infer<typeof settingCategories>;

function mapSetting(s: AppSetting) {
  return { ...s, category: s.category as SettingCategory };
}

const settingSchema = z.object({
  id: z.string().uuid(),
  category: settingCategories,
  key: z.string(),
  value: z.unknown(),
  description: z.string().nullable(),
  updatedBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const settingsRouter = router({
  getAll: staffProcedure
    .output(z.array(settingSchema))
    .query(async ({ ctx }) => {
      const rows = await ctx.prisma.appSetting.findMany({
        orderBy: [{ category: 'asc' }, { key: 'asc' }],
      });
      return rows.map(mapSetting);
    }),

  getByCategory: staffProcedure
    .input(z.object({ category: settingCategories }))
    .output(z.array(settingSchema))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.appSetting.findMany({
        where: { category: input.category },
        orderBy: { key: 'asc' },
      });
      return rows.map(mapSetting);
    }),

  getByCategoryKey: staffProcedure
    .input(z.object({
      category: settingCategories,
      key: z.string().min(1),
    }))
    .output(settingSchema.nullable())
    .query(async ({ ctx, input }) => {
      const row = await ctx.prisma.appSetting.findUnique({
        where: {
          category_key: { category: input.category, key: input.key },
        },
      });
      return row ? mapSetting(row) : null;
    }),

  update: adminProcedure
    .input(z.object({
      category: settingCategories,
      key: z.string().min(1),
      value: z.unknown(),
    }))
    .output(settingSchema)
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.prisma.appSetting.upsert({
        where: {
          category_key: { category: input.category, key: input.key },
        },
        create: {
          category: input.category,
          key: input.key,
          value: JSON.stringify(input.value),
          updatedBy: ctx.user.id,
        },
        update: {
          value: JSON.stringify(input.value),
          updatedBy: ctx.user.id,
        },
      });
      return mapSetting(row);
    }),

  updateBulk: adminProcedure
    .input(z.object({
      settings: z.array(z.object({
        category: settingCategories,
        key: z.string().min(1),
        value: z.unknown(),
      })),
    }))
    .output(z.object({ success: z.boolean(), count: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.$transaction(
        input.settings.map((s) =>
          ctx.prisma.appSetting.upsert({
            where: {
              category_key: { category: s.category, key: s.key },
            },
            create: {
              category: s.category,
              key: s.key,
              value: JSON.stringify(s.value),
              updatedBy: ctx.user.id,
            },
            update: {
              value: JSON.stringify(s.value),
              updatedBy: ctx.user.id,
            },
          }),
        ),
      );
      return { success: true, count: input.settings.length };
    }),

  getAsMap: staffProcedure
    .output(z.record(z.string(), z.record(z.string(), z.unknown())))
    .query(async ({ ctx }) => {
      const rows = await ctx.prisma.appSetting.findMany({
        select: { category: true, key: true, value: true },
        orderBy: [{ category: 'asc' }, { key: 'asc' }],
      });

      const map: Record<string, Record<string, unknown>> = {};
      for (const row of rows) {
        if (!map[row.category]) map[row.category] = {};
        map[row.category]![row.key] = row.value;
      }
      return map;
    }),

  setLogoUrl: adminProcedure
    .input(z.object({ url: z.string().url() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.appSetting.upsert({
        where: {
          category_key: { category: 'organization', key: 'logo_url' },
        },
        create: {
          category: 'organization',
          key: 'logo_url',
          value: JSON.stringify(input.url),
        },
        update: {
          value: JSON.stringify(input.url),
        },
      });
      return { success: true };
    }),

  getLogoUrl: staffProcedure
    .output(z.string().url().nullable())
    .query(async ({ ctx }) => {
      const setting = await ctx.prisma.appSetting.findUnique({
        where: {
          category_key: { category: 'organization', key: 'logo_url' },
        },
      });
      if (!setting?.value) return null;
      try {
        return typeof setting.value === 'string'
          ? JSON.parse(setting.value)
          : setting.value;
      } catch {
        return setting.value;
      }
    }),

  deleteLogoUrl: adminProcedure
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx }) => {
      await ctx.prisma.appSetting.deleteMany({
        where: { category: 'organization', key: 'logo_url' },
      });
      return { success: true };
    }),
});
