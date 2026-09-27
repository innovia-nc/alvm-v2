import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  router,
  publicProcedure,
  protectedProcedure,
  superAdminProcedure,
} from '@back/trpc/trpc.init';
import {
  assertTenantOrganization,
  getPublicOrganization,
  organizationSelect,
  provisionOrganization,
  provisionOrganizationSchema,
} from '@back/services/organization.service';
import { recordPlatformAudit } from '@back/services/platform-audit.service';

/**
 * Associations (tenants) de la plateforme.
 *
 * `current` et `publicInfo` servent les écrans métier et de connexion ; tout
 * le reste est réservé à la super administration (scope RLS `platform`).
 */
export const organizationsRouter = router({
  /** Association de la session (nom affiché dans l'en-tête). */
  current: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { id: true, slug: true, name: true, kind: true },
    }),
  ),

  /** Nom et logo d'une association active, pour personnaliser la connexion. */
  publicInfo: publicProcedure
    .input(z.object({ slug: z.string().max(40) }))
    .query(({ input }) => getPublicOrganization(input.slug)),

  list: superAdminProcedure
    .input(
      z.object({
        search: z.string().max(100).default(''),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where = {
        kind: 'TENANT' as const,
        ...(input.search
          ? {
              OR: [
                { name: { contains: input.search, mode: 'insensitive' as const } },
                { slug: { contains: input.search.toLowerCase() } },
              ],
            }
          : {}),
      };
      const [organizations, total] = await Promise.all([
        ctx.prisma.organization.findMany({
          where,
          select: { ...organizationSelect, _count: { select: { users: true } } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: input.offset,
          take: input.limit,
        }),
        ctx.prisma.organization.count({ where }),
      ]);
      return {
        organizations: organizations.map(({ _count, ...organization }) => ({
          ...organization,
          accountCount: _count.users,
        })),
        total,
      };
    }),

  get: superAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const organization = await assertTenantOrganization(ctx.prisma, input.id);
      const accountCount = await ctx.prisma.user.count({ where: { organizationId: input.id } });
      return { ...organization, accountCount };
    }),

  create: superAdminProcedure
    .input(provisionOrganizationSchema)
    .mutation(({ ctx, input }) => provisionOrganization(ctx.prisma, input, ctx.user.id)),

  rename: superAdminProcedure
    .input(z.object({ id: z.string().uuid(), name: z.string().trim().min(2).max(120) }))
    .mutation(async ({ ctx, input }) => {
      await assertTenantOrganization(ctx.prisma, input.id);
      const organization = await ctx.prisma.organization.update({
        where: { id: input.id },
        data: { name: input.name },
        select: organizationSelect,
      });
      await recordPlatformAudit(ctx.prisma, ctx.user.id, 'platform.organization.renamed', input.id);
      return organization;
    }),

  /**
   * Suspend ou réactive une association. Suspendue : plus aucune connexion,
   * sessions en cours invalidées à la requête suivante, données conservées.
   *
   * La suspension RÉVOQUE les sessions (incrément de `sessionVersion` de tous
   * les comptes de l'association, dans la même transaction) : sans cela, un
   * jeton émis avant la suspension redevenait valable dès la réactivation,
   * sans nouvelle authentification (recette E2E SaaS 3.0.0, SAAS-05).
   */
  setStatus: superAdminProcedure
    .input(z.object({ id: z.string().uuid(), status: z.enum(['ACTIVE', 'SUSPENDED']) }))
    .mutation(async ({ ctx, input }) => {
      const current = await assertTenantOrganization(ctx.prisma, input.id);
      if (current.status === input.status)
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'L’association est déjà dans cet état.',
        });
      const organization = await ctx.prisma.organization.update({
        where: { id: input.id },
        data: {
          status: input.status,
          suspendedAt: input.status === 'SUSPENDED' ? new Date() : null,
        },
        select: organizationSelect,
      });
      if (input.status === 'SUSPENDED')
        await ctx.prisma.user.updateMany({
          where: { organizationId: input.id },
          data: { sessionVersion: { increment: 1 } },
        });
      await recordPlatformAudit(
        ctx.prisma,
        ctx.user.id,
        input.status === 'SUSPENDED'
          ? 'platform.organization.suspended'
          : 'platform.organization.reactivated',
        input.id,
      );
      return organization;
    }),
});
