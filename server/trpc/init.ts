/**
 * tRPC initialization — middlewares and procedures.
 *
 * Niveaux d'accès : publicProcedure, protectedProcedure, parentProcedure,
 * staffProcedure, adminProcedure, superAdminProcedure.
 *
 * Multi-tenant (docs/adr/0002-multi-tenant-rls.md) : toute procédure
 * authentifiée s'exécute dans UNE transaction dont le contexte RLS est le
 * tenant de la session (`ctx.prisma` est le client de cette transaction). Une
 * procédure en erreur annule sa transaction.
 */

import { initTRPC, TRPCError } from '@trpc/server';
import { assertProcedureEnabled } from '@/server/helpers/features';
import type { DbContext } from '@/server/db-context';
import superjson from 'superjson';
import { type Context, type UserRole } from './context';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof Error && error.cause.name === 'ZodError' ? error.cause : null,
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Middlewares
// ---------------------------------------------------------------------------

const requireAuth = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Vous devez être connecté pour effectuer cette action',
    });
  }
  return next({ ctx: { user: ctx.user } });
});

const requireRole = (allowedRoles: UserRole[]) =>
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Vous devez être connecté pour effectuer cette action',
      });
    }

    if (!ctx.user.role || !allowedRoles.includes(ctx.user.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: "Vous n'avez pas les permissions nécessaires",
      });
    }

    return next({ ctx: { user: ctx.user } });
  });

/** Transporte le résultat en échec d'une procédure pour annuler sa transaction. */
class ProcedureFailed {
  constructor(readonly result: unknown) {}
}

/**
 * Ouvre la transaction de contexte autour de la procédure. `next()` ne lève
 * pas : il renvoie `{ ok: false }` — on le convertit en exception pour que la
 * transaction soit annulée, puis on rend le résultat intact à tRPC.
 */
function withContextTransaction(resolve: (ctx: Context) => DbContext) {
  return t.middleware(async ({ ctx, next }) => {
    try {
      return await ctx.withDb(resolve(ctx), async (db) => {
        const result = await next({ ctx: { prisma: db } });
        if (!result.ok) throw new ProcedureFailed(result);
        return result;
      });
    } catch (error) {
      if (error instanceof ProcedureFailed) return error.result as never;
      throw error;
    }
  });
}

/** Transaction du tenant de la session + espace actif. */
const tenantTransaction = withContextTransaction((ctx) => ({
  scope: 'tenant',
  organizationId: ctx.user!.organizationId,
}));

const requireActiveOrganization = t.middleware(async ({ ctx, next }) => {
  const organizationId = ctx.user!.organizationId;
  const organization = await ctx.prisma.organization.findUnique({
    where: { id: organizationId },
    select: { status: true },
  });
  if (!organization || organization.status !== 'ACTIVE')
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Cet espace est suspendu. Contactez le support de la plateforme.',
    });
  return next({ ctx: { organizationId } });
});

const requireEnabledFeature = t.middleware(async ({ ctx, path, next }) => {
  await assertProcedureEnabled(ctx.prisma, ctx.user?.role, path);
  return next();
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/**
 * Sans session ni contexte RLS : `ctx.prisma` ne voit aucune donnée métier.
 * Une procédure publique qui doit lire un compte ouvre elle-même un contexte
 * `auth` (voir `account.requestReset`).
 */
export const publicProcedure = t.procedure;

const tenantProcedure = t.procedure
  .use(requireAuth)
  .use(tenantTransaction)
  .use(requireActiveOrganization)
  .use(requireEnabledFeature);

export const protectedProcedure = tenantProcedure;
export const parentProcedure = tenantProcedure.use(requireRole(['PARENT']));
export const staffProcedure = tenantProcedure.use(requireRole(['STAFF', 'ADMIN']));
export const adminProcedure = tenantProcedure.use(requireRole(['ADMIN']));

/** Super administration : transaction de scope `platform`, aucun accès métier. */
export const superAdminProcedure = t.procedure
  .use(requireRole(['SUPER_ADMIN']))
  .use(withContextTransaction(() => ({ scope: 'platform' })));
