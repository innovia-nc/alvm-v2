import { Prisma } from '@prisma/client';

const SOFT_DELETE_MODELS = new Set([
  'parent',
  'child',
  'staffMember',
  'camp',
  'registration',
  'invoice',
  'invoiceLine',
  'refund',
  'childDocument',
]);

const FILTERED_OPERATIONS = new Set([
  'findFirst',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

export const softDeleteExtension = Prisma.defineExtension({
  name: 'soft-delete',
  query: {
    $allOperations({ model, operation, args, query }) {
      if (
        model &&
        SOFT_DELETE_MODELS.has(model) &&
        FILTERED_OPERATIONS.has(operation)
      ) {
        // Vue structurelle minimale : seuls les args des opérations filtrées
        // (findFirst/findMany/count/aggregate/groupBy) sont concernés, et tous portent `where`.
        const opArgs = args as { where?: Record<string, unknown> };
        const where = opArgs.where ?? {};
        if (!('deletedAt' in where)) {
          opArgs.where = { ...where, deletedAt: null };
        }
      }
      return query(args);
    },
  },
});
