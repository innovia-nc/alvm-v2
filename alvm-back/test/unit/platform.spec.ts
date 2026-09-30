import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const runtime = vi.hoisted(() => ({ integration: vi.fn() }));
vi.mock('@back/db', () => ({
  prisma: { platformIntegration: { findUnique: runtime.integration } },
}));
const blob = vi.hoisted(() => ({ put: vi.fn(), del: vi.fn() }));
vi.mock('@vercel/blob', () => ({ put: blob.put, del: blob.del }));
import {
  createTestCaller,
  ADMIN_USER,
  STAFF_USER,
  PARENT_USER,
  SUPER_ADMIN_USER,
} from '../helpers/test-caller';
import {
  encryptSecret,
  decryptSecret,
  getIntegrationSecret,
} from '@back/services/platform-config.service';
import { sendEmail, isEmailConfigured } from '@back/services/email.service';
import { uploadToStorage } from '@back/storage/blob-storage';
import { assertProcedureEnabled } from '@back/helpers/features';
import { createMockPrisma } from '../helpers/mock-prisma';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('PLATFORM_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
  vi.stubEnv('RESEND_API_KEY', 'environment-key');
  runtime.integration.mockResolvedValue(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Séparation plateforme / entreprise', () => {
  it.each([null, ADMIN_USER, STAFF_USER, PARENT_USER])(
    'réserve les opérations techniques au super admin (%j)',
    async (user) => {
      const { caller, mockPrisma } = createTestCaller(user);
      for (const promise of [
        caller.platform.configuration(),
        caller.platform.integrations(),
        caller.platform.accounts({}),
        caller.platform.audit({}),
        caller.platform.saveBranding({ name: 'Autre', description: '', supportEmail: '' }),
      ]) {
        await expect(promise).rejects.toMatchObject({ code: user ? 'FORBIDDEN' : 'UNAUTHORIZED' });
      }
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.platformIntegration.findMany).not.toHaveBeenCalled();
    },
  );
  it.each([
    'camps.list',
    'parents.list',
    'children.list',
    'invoices.list',
    'payments.list',
    'creditNotes.list',
    'refunds.list',
    'staff.list',
    'registrations.list',
    'attendances.list',
    'dashboard.summary',
    'staffDocuments.list',
    'childDocuments.list',
    'settings.getByCategory',
    'users.list',
    'fec.generateFEC',
    'paymentMethods.list',
    'campTypes.listAll',
  ])('refuse %s au super admin avant toute lecture métier', async (path) => {
    const db = createMockPrisma();
    await expect(assertProcedureEnabled(db, 'SUPER_ADMIN', path)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(db.appSetting.findFirst).not.toHaveBeenCalled();
  });
  it('refuse les vrais appels tRPC de synthèse et de liste métier', async () => {
    const { caller, mockPrisma } = createTestCaller(SUPER_ADMIN_USER);
    await expect(caller.dashboard.summary()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.children.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.paymentMethods.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mockPrisma.child.findMany).not.toHaveBeenCalled();
  });
  it('ne sélectionne aucune fiche métier avec les comptes techniques', async () => {
    const { caller, mockPrisma } = createTestCaller(SUPER_ADMIN_USER);
    await caller.platform.accounts({});
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          disabledAt: true,
          createdAt: true,
          // Association de rattachement : identité publique uniquement.
          organization: { select: { id: true, name: true, slug: true } },
        },
      }),
    );
    expect(mockPrisma.parent.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.staffMember.findMany).not.toHaveBeenCalled();
  });
});

describe('Configuration utilisée par les services', () => {
  it('réutilise le nom enregistré via le point de lecture public et journalise sans contenu', async () => {
    const { caller, mockPrisma } = createTestCaller(SUPER_ADMIN_USER);
    const branding = {
      name: 'Mon application',
      description: 'Bienvenue',
      supportEmail: 'support@example.org',
    };
    await caller.platform.saveBranding(branding);
    // Identité globale de la plateforme : `platform_settings`, hors tenant.
    const write = mockPrisma.platformSetting.upsert.mock.calls[0][0];
    mockPrisma.platformSetting.findUnique.mockResolvedValue({ value: write.update.value });
    expect(await caller.platform.branding()).toEqual(branding);
    expect(mockPrisma.platformAuditLog.createMany).toHaveBeenCalledWith({
      data: [
        {
          actorId: SUPER_ADMIN_USER.id,
          action: 'platform.branding.updated',
          target: 'branding',
          outcome: 'SUCCESS',
        },
      ],
    });
  });
  it('chiffre les clés et utilise immédiatement la clé enregistrée pour Resend', async () => {
    const { caller, mockPrisma } = createTestCaller(SUPER_ADMIN_USER);
    const secret = 're_new_application_secret';
    await caller.platform.saveIntegration({ id: 'resend', enabled: true, secret });
    const saved = mockPrisma.platformIntegration.upsert.mock.calls[0][0].create;
    expect(saved.encryptedSecret).not.toContain(secret);
    expect(decryptSecret(saved.encryptedSecret)).toBe(secret);
    runtime.integration.mockResolvedValue(saved);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'email' }) });
    vi.stubGlobal('fetch', fetchMock);
    await sendEmail(
      { to: 'parent@example.org', subject: 'Test', html: '<p>Test</p>' },
      { fromName: 'Entreprise', fromEmail: 'contact@example.org' },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${secret}` }),
      }),
    );
    expect(JSON.stringify(mockPrisma.platformAuditLog.createMany.mock.calls)).not.toContain(secret);
    mockPrisma.platformIntegration.findMany.mockResolvedValue([saved]);
    const statuses = await caller.platform.integrations();
    expect(JSON.stringify(statuses)).not.toContain(secret);
    expect(JSON.stringify(statuses)).not.toContain(saved.encryptedSecret);
  });
  it('utilise le jeton privé enregistré lors du dépôt de fichiers', async () => {
    const secret = 'vercel_private_stored_secret';
    runtime.integration.mockResolvedValue({
      enabled: true,
      encryptedSecret: encryptSecret(secret),
    });
    blob.put.mockResolvedValue({
      pathname: 'test.pdf',
      url: 'https://test.private.blob.vercel-storage.com/test.pdf',
    });
    await uploadToStorage(Buffer.from('test'), { access: 'private', pathname: 'test.pdf' });
    expect(runtime.integration).toHaveBeenCalledWith({ where: { id: 'blobPrivate' } });
    expect(blob.put).toHaveBeenCalledWith(
      'test.pdf',
      expect.any(Buffer),
      expect.objectContaining({ access: 'private', token: secret }),
    );
  });
  it('désactive effectivement un fournisseur même si sa clé existe dans l’environnement', async () => {
    runtime.integration.mockResolvedValue({ enabled: false, encryptedSecret: null });
    expect(await isEmailConfigured()).toBe(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      sendEmail(
        { to: 'parent@example.org', subject: 'Test', html: '' },
        { fromName: 'Entreprise', fromEmail: 'contact@example.org' },
      ),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('conserve la clé existante lorsque le formulaire est envoyé sans nouvelle clé', async () => {
    const { caller, mockPrisma } = createTestCaller(SUPER_ADMIN_USER);
    mockPrisma.platformIntegration.findUnique.mockResolvedValue({
      encryptedSecret: encryptSecret('stored_secret'),
    });
    await caller.platform.saveIntegration({ id: 'resend', enabled: true });
    expect(
      mockPrisma.platformIntegration.upsert.mock.calls[0][0].update.encryptedSecret,
    ).toBeUndefined();
  });
  it('exige une clé avant activation et refuse les faux noms de fournisseurs', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    const { caller } = createTestCaller(SUPER_ADMIN_USER);
    await expect(
      caller.platform.saveIntegration({ id: 'blobPublic', enabled: true }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(
      caller.platform.saveIntegration({ id: 'unknown' as 'resend', enabled: false }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it('refuse une clé altérée sans exposer le secret', async () => {
    const encrypted = encryptSecret('private-original-secret');
    const pieces = encrypted.split('.');
    pieces[3] = Buffer.from('corrupted').toString('base64');
    expect(() => decryptSecret(pieces.join('.'))).toThrow('Clé API illisible');
  });
  it('refuse l’enregistrement des secrets si le chiffrement n’est pas configuré', async () => {
    vi.stubEnv('PLATFORM_ENCRYPTION_KEY', '');
    const { caller, mockPrisma } = createTestCaller(SUPER_ADMIN_USER);
    await expect(
      caller.platform.saveIntegration({ id: 'resend', enabled: true, secret: 'new-secret-value' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(mockPrisma.platformIntegration.upsert).not.toHaveBeenCalled();
  });
  it('relit une clé remplacée sans cache', async () => {
    runtime.integration
      .mockResolvedValueOnce({ enabled: true, encryptedSecret: encryptSecret('first-secret') })
      .mockResolvedValueOnce({ enabled: true, encryptedSecret: encryptSecret('second-secret') });
    expect(await getIntegrationSecret('resend')).toBe('first-secret');
    expect(await getIntegrationSecret('resend')).toBe('second-secret');
  });
});

describe('Gestion technique des comptes', () => {
  const id = 'b0000000-0000-4000-a000-000000000001';
  it('révoque les sessions lorsqu’un compte est désactivé et écrit l’audit dans la transaction', async () => {
    const { caller, mockPrisma } = createTestCaller(SUPER_ADMIN_USER);
    mockPrisma.user.findUnique.mockResolvedValue({
      id,
      role: 'PARENT',
      email: 'parent@example.org',
      disabledAt: null,
    });
    // Ligne relue par le select `accountSelect` (sortie bornée par `accountOutput`).
    mockPrisma.user.update.mockResolvedValue({
      id,
      name: 'Parent test',
      email: 'parent@example.org',
      role: 'PARENT',
      disabledAt: new Date(),
      createdAt: new Date(),
      organization: {
        id: 'b0000000-0000-4000-b000-000000000001',
        name: 'Association test',
        slug: 'asso-test',
      },
    });
    await caller.platform.updateAccount({
      id,
      name: 'Parent test',
      email: 'parent@example.org',
      disabled: true,
    });
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          disabledAt: expect.any(Date),
          sessionVersion: { increment: 1 },
        }),
      }),
    );
    expect(mockPrisma.platformAuditLog.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ action: 'platform.account.updated', target: id })],
    });
  });
  it('empêche de désactiver son propre compte', async () => {
    const { caller } = createTestCaller(SUPER_ADMIN_USER);
    await expect(
      caller.platform.updateAccount({
        id: SUPER_ADMIN_USER.id,
        name: 'Moi',
        email: 'moi@example.org',
        disabled: true,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it.each(['ADMIN', 'SUPER_ADMIN'])('protège le dernier compte actif %s', async (role) => {
    const { caller, mockPrisma } = createTestCaller(SUPER_ADMIN_USER);
    mockPrisma.user.findUnique.mockResolvedValue({
      id,
      role,
      email: 'other@example.org',
      disabledAt: null,
    });
    mockPrisma.user.count.mockResolvedValue(1);
    await expect(
      caller.platform.updateAccount({
        id,
        name: 'Autre',
        email: 'other@example.org',
        disabled: true,
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

describe('Absence de prise de contrôle indirecte des comptes métier', () => {
  it('refuse la création d’un compte métier depuis la plateforme', async () => {
    const { caller, mockPrisma } = createTestCaller(SUPER_ADMIN_USER);
    await expect(
      caller.platform.createAccount({
        name: 'Autre admin',
        email: 'admin@example.org',
        password: 'PasswordSecret123!',
        role: 'ADMIN' as 'SUPER_ADMIN',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });
  it.each(['ADMIN', 'STAFF', 'PARENT'])(
    'refuse le remplacement de l’email du compte %s',
    async (role) => {
      const { caller, mockPrisma } = createTestCaller(SUPER_ADMIN_USER);
      const id = 'b0000000-0000-4000-a000-000000000001';
      mockPrisma.user.findUnique.mockResolvedValue({
        id,
        role,
        email: 'owner@example.org',
        disabledAt: null,
      });
      await expect(
        caller.platform.updateAccount({
          id,
          name: 'Nom',
          email: 'operator@example.org',
          disabled: false,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPrisma.account.update).not.toHaveBeenCalled();
    },
  );
});
