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
        const where = (args as any).where ?? {};
        if (!('deletedAt' in where)) {
          (args as any).where = { ...where, deletedAt: null };
        }
      }
      return query(args);
    },
  },
});
