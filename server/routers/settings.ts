import { z } from 'zod';
import { router, staffProcedure, adminProcedure } from '@/server/trpc/init';
import type { AppSetting } from '@prisma/client';
import { deleteFromStorageBestEffort } from '@/lib/storage/blob-storage';

const settingCategories = z.enum([
  'organization', 'pricing', 'email', 'accounting', 'maintenance', 'documents',
]);

type SettingCategory = z.infer<typeof settingCategories>;

function mapSetting(s: AppSetting) {
  return { ...s, category: s.category as SettingCategory };
}

/**
 * Lit la valeur stockée du logo (JSON-stringified, ou en clair pour les lignes
 * legacy) et retourne l'URL, ou `undefined` si la valeur est absente/vide.
 */
function parseLogoValue(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'string' && parsed.trim() ? parsed : undefined;
  } catch {
    return value;
  }
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

  /**
   * Indique si l'envoi d'email est opérationnel sur cet environnement (TD-008).
   *
   * Consommé par les écrans de facturation pour ne pas proposer un envoi qui
   * échouerait faute de configuration. Ne renvoie aucun secret : uniquement le
   * booléen et l'adresse d'expédition affichable.
   */
  isEmailConfigured: staffProcedure
    .output(z.object({ configured: z.boolean(), fromEmail: z.string().nullable() }))
    .query(async ({ ctx }) => {
      const { isEmailConfigured, getEmailSender } = await import(
        '@/server/services/email.service'
      );

      const configured = isEmailConfigured();
      if (!configured) {
        return { configured: false, fromEmail: null };
      }

      const sender = await getEmailSender(ctx.prisma);
      return { configured: true, fromEmail: sender.fromEmail };
    }),

  setLogoUrl: adminProcedure
    .input(z.object({ url: z.string().url() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // TD-006 : le logo remplacé n'est plus référencé nulle part — son blob
      // resterait facturé et public. On le lit AVANT l'upsert.
      const previous = await ctx.prisma.appSetting.findUnique({
        where: {
          category_key: { category: 'organization', key: 'logo_url' },
        },
      });
      const previousUrl = parseLogoValue(previous?.value);

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

      if (previousUrl && previousUrl !== input.url) {
        await deleteFromStorageBestEffort(previousUrl, 'logo remplacé');
      }

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
      return parseLogoValue(setting?.value) ?? null;
    }),

  deleteLogoUrl: adminProcedure
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx }) => {
      // TD-006 : lire l'URL avant de supprimer la ligne, sinon le blob devient
      // introuvable côté application tout en restant public et facturé.
      const setting = await ctx.prisma.appSetting.findUnique({
        where: {
          category_key: { category: 'organization', key: 'logo_url' },
        },
      });
      const url = parseLogoValue(setting?.value);

      await ctx.prisma.appSetting.deleteMany({
        where: { category: 'organization', key: 'logo_url' },
      });

      await deleteFromStorageBestEffort(url, 'logo supprimé');

      return { success: true };
    }),
});
