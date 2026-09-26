import { recordPlatformAudit } from '@/server/services/platform-audit.service';
import { z } from 'zod';
import { router, protectedProcedure, superAdminProcedure } from '@/server/trpc/init';
import { FEATURES, type FeatureKey } from '@/lib/features/catalog';
import { getFeatures } from '@/server/helpers/features';

export const featuresRouter = router({
  get: protectedProcedure.query(({ ctx }) => getFeatures(ctx.prisma)),
  set: superAdminProcedure
    .input(
      z.object({
        key: z.enum(Object.keys(FEATURES) as [FeatureKey, ...FeatureKey[]]),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(20260926, 1)::text');
        const state = await getFeatures(tx);
        state[input.key] = input.enabled;
        const value = JSON.stringify(state);
        await tx.appSetting.upsert({
          where: { category_key: { category: 'features', key: 'modules' } },
          create: { category: 'features', key: 'modules', value, updatedBy: ctx.user.id },
          update: { value, updatedBy: ctx.user.id },
        });
        await recordPlatformAudit(
          tx,
          ctx.user.id,
          input.enabled ? 'platform.feature.enabled' : 'platform.feature.disabled',
          input.key,
        );
      });
      return { success: true };
    }),
});
