vi.mock('@back/db', () => ({
  prisma: { platformIntegration: { findUnique: vi.fn().mockResolvedValue(null) } },
}));
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

// TD-006 : le blob du logo doit suivre la ligne en base (suppression, remplacement).
const deleteFromStorageBestEffort = vi.fn().mockResolvedValue(true);
vi.mock('@back/storage/blob-storage', () => ({
  uploadToStorage: vi.fn(),
  deleteFromStorage: vi.fn(),
  deleteFromStorageBestEffort: (...args: unknown[]) => deleteFromStorageBestEffort(...args),
}));

import {
  createTestCaller,
  ADMIN_USER,
  STAFF_USER,
  PARENT_USER,
  TEST_ORGANIZATION_ID,
  type TestCaller,
} from '../helpers/test-caller';

/** Préfixe des objets de l'association de test dans le stockage public. */
const LOGO_BASE = `https://store.public.blob.vercel-storage.com/organizations/${TEST_ORGANIZATION_ID}`;

describe('settings router', () => {
  let admin: TestCaller;
  let staff: TestCaller;

  const fakeSetting = {
    id: 'b0000000-0000-4000-a000-000000000001',
    category: 'organization',
    key: 'name',
    value: '"ALVM"',
    description: null,
    updatedBy: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  beforeEach(() => {
    admin = createTestCaller(ADMIN_USER);
    staff = createTestCaller(STAFF_USER);
    deleteFromStorageBestEffort.mockClear();
    deleteFromStorageBestEffort.mockResolvedValue(true);
  });

  it('should deny unauthenticated access to getByCategory', async () => {
    const { caller } = createTestCaller(null);
    await expect(caller.settings.getByCategory({ category: 'organization' })).rejects.toThrow(
      TRPCError,
    );
  });

  it('should deny PARENT access to getByCategory', async () => {
    const { caller } = createTestCaller(PARENT_USER);
    await expect(caller.settings.getByCategory({ category: 'organization' })).rejects.toThrow(
      TRPCError,
    );
  });

  it('should return settings filtered by category', async () => {
    staff.mockPrisma.appSetting.findMany.mockResolvedValue([fakeSetting]);
    const result = await staff.caller.settings.getByCategory({ category: 'organization' });
    expect(result).toHaveLength(1);
    expect(staff.mockPrisma.appSetting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { category: 'organization' },
      }),
    );
  });

  it('should deny STAFF from updating settings', async () => {
    await expect(
      staff.caller.settings.updateBulk({
        settings: [{ category: 'organization', key: 'name', value: 'New Name' }],
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('should allow ADMIN to bulk update settings', async () => {
    admin.mockPrisma.$transaction.mockResolvedValue([fakeSetting]);
    const result = await admin.caller.settings.updateBulk({
      settings: [{ category: 'organization', key: 'name', value: 'Test' }],
    });
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
  });

  it('should set logo URL', async () => {
    admin.mockPrisma.appSetting.upsert.mockResolvedValue({});
    const result = await admin.caller.settings.setLogoUrl({ url: `${LOGO_BASE}/logo.png` });
    expect(result.success).toBe(true);
  });

  it.each([
    ['javascript:alert(1)'],
    ['https://example.com/logo.png'],
    [
      'https://store.public.blob.vercel-storage.com/organizations/b0000000-0000-4000-b000-000000000002/logo.png',
    ],
  ])('refuse une URL de logo hors du stockage de l’association : %s', async (url) => {
    await expect(admin.caller.settings.setLogoUrl({ url })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(admin.mockPrisma.appSetting.upsert).not.toHaveBeenCalled();
  });

  it('should get logo URL', async () => {
    staff.mockPrisma.appSetting.findFirst.mockImplementation(async ({ where }) =>
      where.category === 'features' ? null : { value: `"${LOGO_BASE}/logo.png"` },
    );
    const result = await staff.caller.settings.getLogoUrl();
    expect(result).toBe(`${LOGO_BASE}/logo.png`);
  });

  it('should return null when no logo is set', async () => {
    staff.mockPrisma.appSetting.findFirst.mockResolvedValue(null);
    const result = await staff.caller.settings.getLogoUrl();
    expect(result).toBeNull();
  });

  it('should delete logo URL', async () => {
    admin.mockPrisma.appSetting.deleteMany.mockResolvedValue({ count: 1 });
    const result = await admin.caller.settings.deleteLogoUrl();
    expect(result.success).toBe(true);
  });

  // TD-008 — l'UI doit savoir si l'envoi d'email est opérationnel
  describe('isEmailConfigured (TD-008)', () => {
    afterEach(() => {
      delete process.env.RESEND_API_KEY;
    });

    it('should report not configured when the provider key is missing', async () => {
      delete process.env.RESEND_API_KEY;

      await expect(staff.caller.settings.isEmailConfigured()).resolves.toEqual({
        configured: false,
        fromEmail: null,
      });
      // Aucune lecture de settings inutile dans ce cas.
      expect(staff.mockPrisma.appSetting.findMany).not.toHaveBeenCalled();
    });

    it('should report the sender address when configured', async () => {
      process.env.RESEND_API_KEY = 'resend_test_key';
      staff.mockPrisma.appSetting.findMany.mockResolvedValue([
        { key: 'from_email', value: '"facturation@alvm.nc"' },
      ]);

      await expect(staff.caller.settings.isEmailConfigured()).resolves.toEqual({
        configured: true,
        fromEmail: 'facturation@alvm.nc',
      });
    });

    it('should deny PARENT access', async () => {
      const { caller } = createTestCaller(PARENT_USER);
      await expect(caller.settings.isEmailConfigured()).rejects.toThrow(TRPCError);
    });
  });

  // TD-006 — blobs orphelins
  describe('logo — nettoyage du blob (TD-006)', () => {
    it('should delete the blob when the logo is removed', async () => {
      admin.mockPrisma.appSetting.findFirst.mockImplementation(async ({ where }) =>
        where.category === 'features' ? null : { value: `"${LOGO_BASE}/logo.png"` },
      );
      admin.mockPrisma.appSetting.deleteMany.mockResolvedValue({ count: 1 });

      await admin.caller.settings.deleteLogoUrl();

      expect(deleteFromStorageBestEffort).toHaveBeenCalledWith(
        `${LOGO_BASE}/logo.png`,
        expect.any(String),
      );
    });

    it('should not call the store when no logo was set', async () => {
      admin.mockPrisma.appSetting.findFirst.mockResolvedValue(null);
      admin.mockPrisma.appSetting.deleteMany.mockResolvedValue({ count: 0 });

      await admin.caller.settings.deleteLogoUrl();

      expect(deleteFromStorageBestEffort).toHaveBeenCalledWith(undefined, expect.any(String));
    });

    it('should delete the previous blob when the logo is replaced', async () => {
      admin.mockPrisma.appSetting.findFirst.mockImplementation(async ({ where }) =>
        where.category === 'features' ? null : { value: `"${LOGO_BASE}/old-logo.png"` },
      );
      admin.mockPrisma.appSetting.upsert.mockResolvedValue({});

      await admin.caller.settings.setLogoUrl({
        url: `${LOGO_BASE}/new-logo.png`,
      });

      expect(deleteFromStorageBestEffort).toHaveBeenCalledWith(
        `${LOGO_BASE}/old-logo.png`,
        expect.any(String),
      );
    });

    it('should not delete the blob when the same URL is re-saved', async () => {
      const url = `${LOGO_BASE}/logo.png`;
      admin.mockPrisma.appSetting.findFirst.mockImplementation(async ({ where }) =>
        where.category === 'features' ? null : { value: JSON.stringify(url) },
      );
      admin.mockPrisma.appSetting.upsert.mockResolvedValue({});

      await admin.caller.settings.setLogoUrl({ url });

      expect(deleteFromStorageBestEffort).not.toHaveBeenCalled();
    });

    it('should still succeed when the blob store fails', async () => {
      admin.mockPrisma.appSetting.findFirst.mockImplementation(async ({ where }) =>
        where.category === 'features' ? null : { value: `"${LOGO_BASE}/logo.png"` },
      );
      admin.mockPrisma.appSetting.deleteMany.mockResolvedValue({ count: 1 });
      deleteFromStorageBestEffort.mockResolvedValue(false);

      const result = await admin.caller.settings.deleteLogoUrl();

      expect(result.success).toBe(true);
    });
  });
});
