import { describe, expect, it } from 'vitest';
import {
  createTestCaller,
  ADMIN_USER,
  STAFF_USER,
  PARENT_USER,
  SUPER_ADMIN_USER,
  TEST_ORGANIZATION_ID,
} from '../helpers/test-caller';
import { assertProcedureEnabled, getFeatures } from '@back/helpers/features';
import { defaultFeatures, featuresForPage } from '@alvm/shared/features';
import { createMockPrisma } from '../helpers/mock-prisma';

const target = 'a0000000-0000-4000-a000-000000000006';
describe('Super administration', () => {
  it.each([null, ADMIN_USER, STAFF_USER, PARENT_USER])(
    'réserve les commutateurs au super admin (%j)',
    async (user) => {
      const { caller, mockPrisma } = createTestCaller(user);
      await expect(
        caller.features.set({
          organizationId: TEST_ORGANIZATION_ID,
          key: 'application',
          enabled: false,
        }),
      ).rejects.toMatchObject({ code: user ? 'FORBIDDEN' : 'UNAUTHORIZED' });
      expect(mockPrisma.appSetting.upsert).not.toHaveBeenCalled();
    },
  );
  it('persiste un seul changement sans perdre les autres commutateurs', async () => {
    const { caller, mockPrisma, dbContexts } = createTestCaller(SUPER_ADMIN_USER);
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: TEST_ORGANIZATION_ID,
      kind: 'TENANT',
      status: 'ACTIVE',
    });
    mockPrisma.appSetting.findFirst.mockResolvedValue({
      value: JSON.stringify({ invoices: false }),
    });
    await caller.features.set({
      organizationId: TEST_ORGANIZATION_ID,
      key: 'camps',
      enabled: false,
    });
    // Transaction de plateforme, basculée sur l'association ciblée pour l'écriture.
    expect(dbContexts).toEqual([{ scope: 'platform' }]);
    expect(mockPrisma.$executeRaw).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining("set_config('app.org_id'")]),
      TEST_ORGANIZATION_ID,
    );
    expect(mockPrisma.appSetting.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_category_key: {
          organizationId: TEST_ORGANIZATION_ID,
          category: 'features',
          key: 'modules',
        },
      },
      create: expect.objectContaining({ category: 'features', key: 'modules' }),
      update: {
        value: JSON.stringify({ ...defaultFeatures, camps: false, invoices: false }),
        updatedBy: SUPER_ADMIN_USER.id,
      },
    });
  });
  it('refuse de régler les modules de l’espace de plateforme', async () => {
    const { caller, mockPrisma } = createTestCaller(SUPER_ADMIN_USER);
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: TEST_ORGANIZATION_ID,
      kind: 'PLATFORM',
      status: 'ACTIVE',
    });
    await expect(
      caller.features.set({ organizationId: TEST_ORGANIZATION_ID, key: 'camps', enabled: false }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mockPrisma.appSetting.upsert).not.toHaveBeenCalled();
  });
  it('bloque une requête métier directe lorsque le module est désactivé', async () => {
    const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
    mockPrisma.appSetting.findFirst.mockResolvedValue({ value: '{"camps":false}' });
    await expect(caller.camps.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mockPrisma.camp.findMany).not.toHaveBeenCalled();
  });
  it.each(['PARENT', 'STAFF', 'ADMIN'])('applique la suspension globale à %s', async (role) => {
    const db = createMockPrisma();
    db.appSetting.findFirst.mockResolvedValue({ value: '{"application":false}' });
    await expect(assertProcedureEnabled(db, role, 'settings.updateBulk')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(assertProcedureEnabled(db, role, 'features.get')).resolves.toBeUndefined();
    await expect(assertProcedureEnabled(db, role, 'account.update')).resolves.toBeUndefined();
    await expect(
      assertProcedureEnabled(db, 'SUPER_ADMIN', 'platform.configuration'),
    ).resolves.toBeUndefined();
  });
  it.each(['organization', 'email', 'documents', 'maintenance'] as const)(
    'interdit les réglages d’entreprise %s au super admin, même dans un lot mixte',
    async (category) => {
      const { caller, mockPrisma } = createTestCaller(SUPER_ADMIN_USER);
      await expect(
        caller.settings.updateBulk({
          settings: [
            { category: 'pricing', key: 'tax_rate', value: 0 },
            { category, key: 'name', value: 'test' },
          ],
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(mockPrisma.appSetting.upsert).not.toHaveBeenCalled();
    },
  );
  it('conserve les réglages métier pour les admins', async () => {
    const { caller } = createTestCaller(ADMIN_USER);
    await expect(
      caller.settings.updateBulk({
        settings: [{ category: 'pricing', key: 'tax_rate', value: 0 }],
      }),
    ).resolves.toEqual({ success: true, count: 1 });
  });
  it('refuse les modifications du logo entreprise au super admin', async () => {
    const { caller } = createTestCaller(SUPER_ADMIN_USER);
    await expect(
      caller.settings.setLogoUrl({ url: 'https://example.org/logo.png' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.settings.deleteLogoUrl()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('empêche un admin de modifier, supprimer ou réinitialiser un super admin', async () => {
    const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
    mockPrisma.user.findUnique.mockResolvedValue({ id: target, role: 'SUPER_ADMIN' });
    await expect(caller.users.update({ id: target, name: 'Autre nom' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(caller.users.delete({ id: target })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.users.resetPassword({ userId: target })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
  it('interdit la création du rôle via les comptes ordinaires', async () => {
    const { caller } = createTestCaller(ADMIN_USER);
    await expect(
      caller.users.create({
        name: 'Super admin',
        email: 'test@example.org',
        role: 'SUPER_ADMIN' as 'ADMIN',
        password: 'Password123!',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it('conserve les modules actifs par défaut et ferme en cas de configuration corrompue', async () => {
    const db = createMockPrisma();
    expect(await getFeatures(db)).toEqual(defaultFeatures);
    db.appSetting.findFirst.mockResolvedValue({ value: 'invalid json' });
    expect((await getFeatures(db)).application).toBe(false);
  });
  it.each([
    ['documents', 'children.generatePDF'],
    ['documents', 'staffDocuments.list'],
    ['email', 'invoices.sendEmail'],
  ] as const)('bloque %s via %s', async (key, path) => {
    const db = createMockPrisma();
    db.appSetting.findFirst.mockResolvedValue({ value: JSON.stringify({ [key]: false }) });
    await expect(assertProcedureEnabled(db, 'ADMIN', path)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
  it('associe les sous-routes aux bons modules', () => {
    expect(featuresForPage('/dashboard/admin/users/parents')).toEqual(['application', 'parents']);
    expect(featuresForPage('/dashboard/admin/credit-notes/new')).toEqual([
      'application',
      'creditNotes',
    ]);
  });
});
