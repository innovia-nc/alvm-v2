import { appRouter } from '@back/trpc/trpc.router';
import type { AuthUser, Context } from '@back/trpc/trpc.context';
import { createMockPrisma } from './mock-prisma';

/** Association des comptes de test (tenant de la session). */
export const TEST_ORGANIZATION_ID = 'b0000000-0000-4000-b000-000000000001';
/** Espace de plateforme des comptes SUPER_ADMIN. */
export const PLATFORM_ORGANIZATION_ID = 'b0000000-0000-4000-b000-0000000000ff';

export const SUPER_ADMIN_USER: AuthUser = {
  id: 'a0000000-0000-4000-a000-000000000005',
  role: 'SUPER_ADMIN',
  organizationId: PLATFORM_ORGANIZATION_ID,
};

export const ADMIN_USER: AuthUser = {
  id: 'a0000000-0000-4000-a000-000000000001',
  role: 'ADMIN',
  organizationId: TEST_ORGANIZATION_ID,
};

export const STAFF_USER: AuthUser = {
  id: 'a0000000-0000-4000-a000-000000000002',
  role: 'STAFF',
  organizationId: TEST_ORGANIZATION_ID,
};

export const PARENT_USER: AuthUser = {
  id: 'a0000000-0000-4000-a000-000000000003',
  role: 'PARENT',
  organizationId: TEST_ORGANIZATION_ID,
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
  organizationId: TEST_ORGANIZATION_ID,
};

/**
 * Caller tRPC sur Prisma simulé. La transaction de contexte RLS est simulée
 * elle aussi : `withDb` exécute la procédure sur le même client simulé et
 * mémorise les contextes demandés (`dbContexts`) pour les assertions.
 */
export function createTestCaller(user: AuthUser | null = ADMIN_USER) {
  const mockPrisma = createMockPrisma();
  const dbContexts: Array<Parameters<Context['withDb']>[0]> = [];

  const caller = appRouter.createCaller({
    user,
    prisma: mockPrisma as any,
    withDb: (async (
      context: Parameters<Context['withDb']>[0],
      fn: (db: any) => Promise<unknown>,
    ) => {
      dbContexts.push(context);
      return fn(mockPrisma);
    }) as Context['withDb'],
    clientIp: '203.0.113.10',
  });

  return { caller, mockPrisma, dbContexts };
}

export type TestCaller = ReturnType<typeof createTestCaller>;
