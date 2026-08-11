/**
 * tRPC initialization — middlewares and procedures.
 *
 * Same access levels as the original backend:
 * publicProcedure, protectedProcedure, parentProcedure,
 * staffProcedure, adminProcedure.
 */

import { initTRPC, TRPCError } from '@trpc/server';
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
          error.cause instanceof Error && error.cause.name === 'ZodError'
            ? error.cause
            : null,
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

const requireRole = (allowedRoles: Array<'PARENT' | 'STAFF' | 'ADMIN'>) =>
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
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(requireAuth);
export const parentProcedure = t.procedure.use(requireRole(['PARENT']));
export const staffProcedure = t.procedure.use(requireRole(['STAFF', 'ADMIN']));
export const adminProcedure = t.procedure.use(requireRole(['ADMIN']));
