import { appRouter } from '@/server/trpc/router';
import type { AuthUser } from '@/server/trpc/context';
import { createMockPrisma, type MockPrisma } from './mock-prisma';

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

export const ANIMATOR_USER: AuthUser = {
  id: 'a0000000-0000-4000-a000-000000000004',
  email: 'animator@test.com',
  role: 'STAFF',
  staffRole: 'ANIMATOR',
  name: 'Test Animator',
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
