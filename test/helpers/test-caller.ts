import { appRouter } from '@/server/trpc/router';
import type { AuthUser } from '@/server/trpc/context';
import { createMockPrisma } from './mock-prisma';

export const ADMIN_USER: AuthUser = {
  id: 'a0000000-0000-4000-a000-000000000001',
  role: 'ADMIN',
};

export const STAFF_USER: AuthUser = {
  id: 'a0000000-0000-4000-a000-000000000002',
  role: 'STAFF',
};

export const PARENT_USER: AuthUser = {
  id: 'a0000000-0000-4000-a000-000000000003',
  role: 'PARENT',
};

/**
 * Second membre du personnel, distinct de `STAFF_USER`.
 *
 * Sert aux cas « un STAFF autre que le créateur de l'objet ». S'appelait
 * `ANIMATOR_USER` et portait `staffRole: 'ANIMATOR'` : cette revendication de
 * session n'a jamais été lue par une garde et a été retirée (sixième passe de
 * code mort). Seul l'identifiant distinct compte ici.
 */
export const OTHER_STAFF_USER: AuthUser = {
  id: 'a0000000-0000-4000-a000-000000000004',
  role: 'STAFF',
};

export function createTestCaller(user: AuthUser | null = ADMIN_USER) {
  const mockPrisma = createMockPrisma();

  const caller = appRouter.createCaller({
    user,
    prisma: mockPrisma as any,
  });

  return { caller, mockPrisma };
}

export type TestCaller = ReturnType<typeof createTestCaller>;
