const rootPrisma = vi.hoisted(() => ({
  platformIntegration: { findUnique: vi.fn().mockResolvedValue(null) },
  platformSetting: { findUnique: vi.fn().mockResolvedValue(null) },
  // Limitation de débit (`login_attempts`, hors RLS) : première tentative.
  $queryRaw: vi.fn().mockResolvedValue([{ attempts: 1 }]),
}));
vi.mock('@back/db', () => ({ prisma: rootPrisma }));
// File alvm-email simulée : aucun Redis en test unitaire.
vi.mock('bullmq', async (importOriginal) => ({
  ...(await importOriginal<typeof import('bullmq')>()),
  Queue: (await import('../helpers/fake-email-queue')).FakeQueue,
}));

/**
 * `account.requestReset` — l'email de réinitialisation passe par la file
 * `alvm-email` (CLAUDE.md InnovIA §5.11) sans rien céder sur l'anti-énumération :
 * la réponse ne dépend jamais de l'existence du compte.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createTestCaller, TEST_ORGANIZATION_ID } from '../helpers/test-caller';
import { queueAdd, resetFakeEmailQueue } from '../helpers/fake-email-queue';

const USER_ID = 'a0000000-0000-4000-a000-000000000003';
const MESSAGE_ID = 'e0000000-0000-4000-a000-000000000002';
const REQUEST = { portal: 'standard', organization: 'alvm', email: 'jean@example.nc' } as const;

describe('account.requestReset (file alvm-email)', () => {
  let ctx: ReturnType<typeof createTestCaller>;

  function arrangeExistingAccount() {
    ctx.mockPrisma.organization.findFirst.mockResolvedValue({ id: TEST_ORGANIZATION_ID });
    ctx.mockPrisma.user.findFirst.mockResolvedValue({
      id: USER_ID,
      email: 'jean@example.nc',
      disabledAt: null,
      organizationId: TEST_ORGANIZATION_ID,
    });
    ctx.mockPrisma.emailMessage.create.mockResolvedValue({ id: MESSAGE_ID });
  }

  beforeEach(async () => {
    await resetFakeEmailQueue();
    ctx = createTestCaller(null);
    vi.stubEnv('RESEND_API_KEY', 'resend_test_key');
    vi.stubEnv('REDIS_URL', 'redis://localhost:6380');
    vi.stubEnv('AUTH_URL', 'https://app.example.nc');
  });

  afterEach(async () => {
    await resetFakeEmailQueue();
    vi.unstubAllEnvs();
  });

  it('refuse explicitement sans clé du fournisseur', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    await expect(ctx.caller.account.requestReset(REQUEST)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });

  it('refuse explicitement sans file d’envoi (REDIS_URL), avant toute recherche de compte', async () => {
    arrangeExistingAccount();
    vi.stubEnv('REDIS_URL', '');

    await expect(ctx.caller.account.requestReset(REQUEST)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringContaining("file d'envoi"),
    });
    // Même réponse que le compte existe ou non : rien n'a été consulté.
    expect(ctx.mockPrisma.organization.findFirst).not.toHaveBeenCalled();
    expect(ctx.dbContexts).toEqual([]);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('programme l’email dans le tenant du compte, lien porté par le job seulement', async () => {
    arrangeExistingAccount();

    await expect(ctx.caller.account.requestReset(REQUEST)).resolves.toEqual({ success: true });

    // Compte retrouvé en scope auth, message écrit dans le tenant du compte.
    expect(ctx.dbContexts).toEqual([
      { scope: 'auth' },
      { scope: 'tenant', organizationId: TEST_ORGANIZATION_ID },
    ]);
    expect(ctx.mockPrisma.emailMessage.create).toHaveBeenCalledWith({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        kind: 'password-reset',
        recipient: 'jean@example.nc',
        subject: expect.stringContaining('Réinitialiser votre mot de passe'),
        relatedId: USER_ID,
        createdBy: null,
      },
      select: { id: true },
    });

    const [name, data, opts] = queueAdd.mock.calls[0]!;
    expect(name).toBe('password-reset');
    expect(opts).toMatchObject({ jobId: MESSAGE_ID, attempts: 3, removeOnFail: true });
    expect(data).toMatchObject({
      kind: 'password-reset',
      organizationId: TEST_ORGANIZATION_ID,
      emailMessageId: MESSAGE_ID,
    });

    // Le jeton du lien correspond à l'empreinte stockée — seule l'empreinte est en base.
    const token = new URL(data.resetUrl).searchParams.get('token')!;
    expect(new URL(data.resetUrl).origin).toBe('https://app.example.nc');
    const stored = ctx.mockPrisma.verificationToken.create.mock.calls[0]![0].data;
    expect(stored.token).toBe(createHash('sha256').update(token).digest('hex'));
    expect(stored.token).not.toBe(token);
    expect(data.expiresAt).toBe(stored.expires.toISOString());
  });

  it('répond pareil pour un compte inconnu, sans rien programmer', async () => {
    ctx.mockPrisma.organization.findFirst.mockResolvedValue({ id: TEST_ORGANIZATION_ID });
    ctx.mockPrisma.user.findFirst.mockResolvedValue(null);

    await expect(ctx.caller.account.requestReset(REQUEST)).resolves.toEqual({ success: true });
    expect(ctx.mockPrisma.emailMessage.create).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('répond pareil si la file tombe après la recherche du compte (tracé côté serveur)', async () => {
    arrangeExistingAccount();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    queueAdd.mockRejectedValue(new Error('Connection is closed.'));

    await expect(ctx.caller.account.requestReset(REQUEST)).resolves.toEqual({ success: true });
    expect(error).toHaveBeenCalledWith(expect.stringContaining('[account.requestReset]'));
    error.mockRestore();
  });
});
