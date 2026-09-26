/**
 * tRPC initialization — middlewares and procedures.
 *
 * Same access levels as the original backend:
 * publicProcedure, protectedProcedure, parentProcedure,
 * staffProcedure, adminProcedure.
 */

import { initTRPC, TRPCError } from '@trpc/server';
import { assertProcedureEnabled } from '@/server/helpers/features';
import superjson from 'superjson';
import { type Context } from './context';

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
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const requireRole = (allowedRoles: Array<'PARENT' | 'STAFF' | 'ADMIN' | 'SUPER_ADMIN'>) =>
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

    return next({ ctx: { ...ctx, user: ctx.user } });
  });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
const featureProcedure = t.procedure.use(async ({ ctx, path, next }) => {
  await assertProcedureEnabled(ctx.prisma, ctx.user?.role, path);
  return next();
});
export const publicProcedure = featureProcedure;
export const protectedProcedure = featureProcedure.use(requireAuth);
export const parentProcedure = featureProcedure.use(requireRole(['PARENT']));
export const staffProcedure = featureProcedure.use(requireRole(['STAFF', 'ADMIN']));
export const adminProcedure = featureProcedure.use(requireRole(['ADMIN']));

export const superAdminProcedure = t.procedure.use(requireRole(['SUPER_ADMIN']));
