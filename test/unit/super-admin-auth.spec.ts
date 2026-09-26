import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextAuthConfig } from 'next-auth';
const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  compare: vi.fn(),
  limit: vi.fn(),
  config: null as unknown as NextAuthConfig,
}));
vi.mock('next-auth', () => ({
  default: (config: NextAuthConfig) => {
    mocks.config = config;
    return { auth: vi.fn(), handlers: {} };
  },
}));
vi.mock('@/server/db', () => ({ prisma: { platformAuditLog: { create: vi.fn().mockResolvedValue({}) }, user: { findUnique: mocks.findUnique } } }));
vi.mock('bcryptjs', () => ({ compare: mocks.compare }));
vi.mock('@/server/services/login-limit.service', () => ({ consumeLoginAttempt: mocks.limit }));
import '@/lib/auth/config';

const authorize = async (portal: string, role: string) => {
  mocks.findUnique.mockResolvedValue({
    id: 'test',
    role,
    accounts: [{ providerAccountId: 'hash' }],
    sessionVersion: 1,
  });
  const provider = mocks.config.providers[0] as unknown as {
    options: {
      authorize: (credentials: Record<string, string>, request: Request) => Promise<unknown>;
    };
  };
  return provider.options.authorize(
    { email: 'test@example.org', password: 'Password123!', portal },
    new Request('http://localhost'),
  );
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.compare.mockResolvedValue(true);
  mocks.limit.mockResolvedValue(true);
});
describe('Connexion super admin', () => {
  it('accepte le super admin sur son portail', async () => {
    expect(await authorize('super-admin', 'SUPER_ADMIN')).toMatchObject({ role: 'SUPER_ADMIN' });
  });
  it.each(['PARENT', 'STAFF', 'ADMIN'])('refuse %s sur le portail réservé', async (role) => {
    expect(await authorize('super-admin', role)).toBeNull();
  });
  it('refuse le super admin sur le portail habituel', async () => {
    expect(await authorize('standard', 'SUPER_ADMIN')).toBeNull();
  });
  it('préserve la connexion admin habituelle', async () => {
    expect(await authorize('standard', 'ADMIN')).toMatchObject({ role: 'ADMIN' });
  });
  it('vérifie toujours le mot de passe', async () => {
    mocks.compare.mockResolvedValue(false);
    expect(await authorize('super-admin', 'SUPER_ADMIN')).toBeNull();
  });
});
