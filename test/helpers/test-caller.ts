import { appRouter } from '@/server/trpc/router';
import type { AuthUser } from '@/server/trpc/context';
import { createMockPrisma } from './mock-prisma';

export const ADMIN_USER: AuthUser = {
  id: 'a0000000-0000-4000-a000-000000000001',
  email: 'admin@test.com',
  role: 'ADMIN',
  name: 'Test Admin',
};

export const STAFF_USER: AuthUser = {
  id: 'a0000000-0000-4000-a000-000000000002',
  email: 'staff@test.com',
  role: 'STAFF',
  name: 'Test Staff',
};

export const PARENT_USER: AuthUser = {
  id: 'a0000000-0000-4000-a000-000000000003',
  email: 'parent@test.com',
  role: 'PARENT',
  name: 'Test Parent',
};

/**
 * Second membre du personnel, distinct de STAFF_USER.
 *
 * Sert aux cas ou l'identite de l'auteur compte (createdBy, « modifier le camp
 * d'un autre »). Ne porte plus de sous-role : le champ `staffRole` de la
 * session, residu d'EPIC-006, n'etait lu par aucun garde (cf. quatrieme passe
 * de code mort).
 */
export const OTHER_STAFF_USER: AuthUser = {
  id: 'a0000000-0000-4000-a000-000000000004',
  email: 'staff2@test.com',
  role: 'STAFF',
  name: 'Test Staff 2',
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
