import { recordPlatformAudit } from '@back/services/platform-audit.service';
import { z } from 'zod';
import { router, protectedProcedure, superAdminProcedure } from '@back/trpc/trpc.init';
import { FEATURES, type FeatureKey } from '@alvm/shared/features';
import { getFeatures } from '@back/helpers/features';
import { upsertAppSetting } from '@back/helpers/settings';
import { actAsOrganization, lockTenant } from '@back/db-context';
import { assertTenantOrganization } from '@back/services/organization.service';

/**
 * Modules activables PAR association. La super administration les règle pour
 * une association donnée ; l'association lit les siens.
 */
export const featuresRouter = router({
  get: protectedProcedure.query(({ ctx }) => getFeatures(ctx.prisma)),
  forOrganization: superAdminProcedure
    .input(z.object({ organizationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertTenantOrganization(ctx.prisma, input.organizationId);
      await actAsOrganization(ctx.prisma, input.organizationId);
      return getFeatures(ctx.prisma);
    }),
  set: superAdminProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        key: z.enum(Object.keys(FEATURES) as [FeatureKey, ...FeatureKey[]]),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertTenantOrganization(ctx.prisma, input.organizationId);
      await actAsOrganization(ctx.prisma, input.organizationId);
      await lockTenant(ctx.prisma, 'features');
      const state = await getFeatures(ctx.prisma);
      state[input.key] = input.enabled;
      await upsertAppSetting(ctx.prisma, input.organizationId, {
        category: 'features',
        key: 'modules',
        value: JSON.stringify(state),
        updatedBy: ctx.user.id,
      });
      await recordPlatformAudit(
        ctx.prisma,
        ctx.user.id,
        input.enabled ? 'platform.feature.enabled' : 'platform.feature.disabled',
        input.key,
      );
      return { success: true };
    }),
});
