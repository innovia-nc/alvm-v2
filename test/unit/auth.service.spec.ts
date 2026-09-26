/**
 * Connexion multi-tenant (`server/services/auth.service.ts`).
 *
 * Un compte est identifié par (espace, email) ; les SUPER_ADMIN vivent dans
 * l'espace de plateforme et n'ont accès qu'à leur portail. L'isolation réelle
 * des lignes est prouvée par les tests d'intégration RLS ; ici on vérifie que
 * la recherche vise toujours le bon espace et que tout refus est muet (`null`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TENANT = 'b0000000-0000-4000-b000-000000000001';
const PLATFORM = 'b0000000-0000-4000-b000-0000000000ff';

const mocks = vi.hoisted(() => ({
  organizationFindFirst: vi.fn(),
  userFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  audit: vi.fn(),
  compare: vi.fn(),
  limit: vi.fn(),
  contexts: [] as unknown[],
}));

vi.mock('@/server/db-context', () => ({
  withDbContext: (context: unknown, fn: (db: unknown) => unknown) => {
    mocks.contexts.push(context);
    return fn({
      organization: { findFirst: mocks.organizationFindFirst },
      user: { findFirst: mocks.userFindFirst, findUnique: mocks.userFindUnique },
      platformAuditLog: { create: mocks.audit },
    });
  },
}));
vi.mock('bcryptjs', () => ({ compare: mocks.compare }));
vi.mock('@/server/services/login-limit.service', () => ({ consumeLoginAttempt: mocks.limit }));

import { isSessionValid, verifyCredentials } from '@/server/services/auth.service';

function account(role: string, organizationId = role === 'SUPER_ADMIN' ? PLATFORM : TENANT) {
  return {
    id: 'a0000000-0000-4000-a000-000000000001',
    email: 'test@example.org',
    name: 'Test',
    image: null,
    role,
    organizationId,
    sessionVersion: 1,
    disabledAt: null,
    accounts: [{ providerAccountId: 'hash' }],
  };
}

const signIn = (portal: 'standard' | 'super-admin', extra: Record<string, string> = {}) =>
  verifyCredentials(
    {
      portal,
      email: 'Test@Example.org',
      password: 'Password123!',
      ...(portal === 'standard' ? { organization: 'alvm' } : {}),
      ...extra,
    },
    new Headers(),
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.contexts.length = 0;
  mocks.compare.mockResolvedValue(true);
  mocks.limit.mockResolvedValue(true);
  mocks.organizationFindFirst.mockImplementation(async ({ where }) =>
    where.kind === 'PLATFORM' ? { id: PLATFORM } : { id: TENANT },
  );
});

describe('Connexion multi-tenant', () => {
  it('cherche le compte dans l’espace demandé, par email normalisé, en scope auth', async () => {
    mocks.userFindFirst.mockResolvedValue(account('ADMIN'));
    expect(await signIn('standard')).toMatchObject({ role: 'ADMIN', organizationId: TENANT });
    expect(mocks.contexts).toEqual([{ scope: 'auth' }]);
    expect(mocks.organizationFindFirst).toHaveBeenCalledWith({
      where: { slug: 'alvm', kind: 'TENANT', status: 'ACTIVE' },
      select: { id: true },
    });
    expect(mocks.userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: TENANT, email: 'test@example.org' } }),
    );
    expect(mocks.limit).toHaveBeenCalledWith('alvm:test@example.org', expect.any(Headers));
  });

  it('refuse un espace inconnu ou suspendu sans chercher de compte', async () => {
    mocks.organizationFindFirst.mockResolvedValue(null);
    expect(await signIn('standard')).toBeNull();
    expect(mocks.userFindFirst).not.toHaveBeenCalled();
  });

  it('exige un identifiant d’espace valide sur le portail habituel', async () => {
    expect(await signIn('standard', { organization: '' })).toBeNull();
    expect(await signIn('standard', { organization: 'Pas un slug !' })).toBeNull();
    expect(mocks.organizationFindFirst).not.toHaveBeenCalled();
  });

  it('refuse un compte désactivé ou sans mot de passe', async () => {
    mocks.userFindFirst.mockResolvedValue({ ...account('ADMIN'), disabledAt: new Date() });
    expect(await signIn('standard')).toBeNull();
    mocks.userFindFirst.mockResolvedValue({ ...account('ADMIN'), accounts: [] });
    expect(await signIn('standard')).toBeNull();
  });

  it('respecte la limitation de débit avant toute lecture', async () => {
    mocks.limit.mockResolvedValue(false);
    expect(await signIn('standard')).toBeNull();
    expect(mocks.organizationFindFirst).not.toHaveBeenCalled();
  });
});

describe('Connexion super admin', () => {
  it('accepte le super admin sur son portail, dans l’espace de plateforme', async () => {
    mocks.userFindFirst.mockResolvedValue(account('SUPER_ADMIN'));
    expect(await signIn('super-admin')).toMatchObject({
      role: 'SUPER_ADMIN',
      organizationId: PLATFORM,
    });
    expect(mocks.organizationFindFirst).toHaveBeenCalledWith({
      where: { kind: 'PLATFORM' },
      select: { id: true },
    });
  });

  it.each(['PARENT', 'STAFF', 'ADMIN'])('refuse %s sur le portail réservé', async (role) => {
    mocks.userFindFirst.mockResolvedValue(account(role));
    expect(await signIn('super-admin')).toBeNull();
  });

  it('refuse le super admin sur le portail habituel', async () => {
    mocks.userFindFirst.mockResolvedValue(account('SUPER_ADMIN'));
    expect(await signIn('standard')).toBeNull();
  });

  it('vérifie toujours le mot de passe et journalise l’échec', async () => {
    mocks.userFindFirst.mockResolvedValue(account('SUPER_ADMIN'));
    mocks.compare.mockResolvedValue(false);
    expect(await signIn('super-admin')).toBeNull();
    expect(mocks.audit).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'auth.login_failed', outcome: 'FAILED' }),
    });
  });
});

describe('Validité d’une session', () => {
  const token = {
    id: 'a0000000-0000-4000-a000-000000000001',
    role: 'ADMIN' as const,
    organizationId: TENANT,
    sessionVersion: 1,
  };
  const current = {
    disabledAt: null,
    sessionVersion: 1,
    role: 'ADMIN',
    organizationId: TENANT,
    organization: { status: 'ACTIVE' },
  };

  it('reste valable tant que rien n’a changé', async () => {
    mocks.userFindUnique.mockResolvedValue(current);
    expect(await isSessionValid(token)).toBe(true);
  });

  it.each([
    ['association suspendue', { organization: { status: 'SUSPENDED' } }],
    ['compte désactivé', { disabledAt: new Date() }],
    ['sessions révoquées', { sessionVersion: 2 }],
    ['rôle modifié', { role: 'STAFF' }],
    ['autre espace', { organizationId: PLATFORM }],
  ])('est révoquée : %s', async (_label, change) => {
    mocks.userFindUnique.mockResolvedValue({ ...current, ...change });
    expect(await isSessionValid(token)).toBe(false);
  });
});
