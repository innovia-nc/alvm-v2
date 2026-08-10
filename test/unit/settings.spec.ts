import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

// TD-006 : le blob du logo doit suivre la ligne en base (suppression, remplacement).
const deleteFromStorageBestEffort = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/storage/blob-storage', () => ({
  uploadToStorage: vi.fn(),
  deleteFromStorage: vi.fn(),
  deleteFromStorageBestEffort: (...args: unknown[]) =>
    deleteFromStorageBestEffort(...args),
}));

import {
  createTestCaller,
  ADMIN_USER,
  STAFF_USER,
  PARENT_USER,
  type TestCaller,
} from '../helpers/test-caller';

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

  it('should deny unauthenticated access to getAll', async () => {
    const { caller } = createTestCaller(null);
    await expect(caller.settings.getAll()).rejects.toThrow(TRPCError);
  });

  it('should deny PARENT access to getAll', async () => {
    const { caller } = createTestCaller(PARENT_USER);
    await expect(caller.settings.getAll()).rejects.toThrow(TRPCError);
  });

  it('should return all settings for staff', async () => {
    staff.mockPrisma.appSetting.findMany.mockResolvedValue([fakeSetting]);
    const result = await staff.caller.settings.getAll();
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('name');
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

  it('should return a specific setting by category+key', async () => {
    staff.mockPrisma.appSetting.findUnique.mockResolvedValue(fakeSetting);
    const result = await staff.caller.settings.getByCategoryKey({
      category: 'organization',
      key: 'name',
    });
    expect(result).not.toBeNull();
    expect(result!.key).toBe('name');
  });

  it('should return null for missing setting', async () => {
    staff.mockPrisma.appSetting.findUnique.mockResolvedValue(null);
    const result = await staff.caller.settings.getByCategoryKey({
      category: 'organization',
      key: 'missing',
    });
    expect(result).toBeNull();
  });

  it('should deny STAFF from updating settings', async () => {
    await expect(
      staff.caller.settings.update({
        category: 'organization',
        key: 'name',
        value: 'New Name',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('should allow ADMIN to upsert a setting', async () => {
    admin.mockPrisma.appSetting.upsert.mockResolvedValue(fakeSetting);
    const result = await admin.caller.settings.update({
      category: 'organization',
      key: 'name',
      value: 'ALVM',
    });
    expect(result.key).toBe('name');
    expect(admin.mockPrisma.appSetting.upsert).toHaveBeenCalledOnce();
  });

  it('should allow ADMIN to bulk update settings', async () => {
    admin.mockPrisma.$transaction.mockResolvedValue([fakeSetting]);
    const result = await admin.caller.settings.updateBulk({
      settings: [
        { category: 'organization', key: 'name', value: 'Test' },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
  });

  it('should return settings as nested map', async () => {
    staff.mockPrisma.appSetting.findMany.mockResolvedValue([
      { category: 'organization', key: 'name', value: '"ALVM"' },
      { category: 'pricing', key: 'currency', value: '"XPF"' },
    ]);
    const result = await staff.caller.settings.getAsMap();
    expect(result.organization?.name).toBe('"ALVM"');
    expect(result.pricing?.currency).toBe('"XPF"');
  });

  it('should set logo URL', async () => {
    admin.mockPrisma.appSetting.upsert.mockResolvedValue({});
    const result = await admin.caller.settings.setLogoUrl({ url: 'https://example.com/logo.png' });
    expect(result.success).toBe(true);
  });

  it('should get logo URL', async () => {
    staff.mockPrisma.appSetting.findUnique.mockResolvedValue({
      value: '"https://example.com/logo.png"',
    });
    const result = await staff.caller.settings.getLogoUrl();
    expect(result).toBe('https://example.com/logo.png');
  });

  it('should return null when no logo is set', async () => {
    staff.mockPrisma.appSetting.findUnique.mockResolvedValue(null);
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
      admin.mockPrisma.appSetting.findUnique.mockResolvedValue({
        value: '"https://store.blob.vercel-storage.com/logo.png"',
      });
      admin.mockPrisma.appSetting.deleteMany.mockResolvedValue({ count: 1 });

      await admin.caller.settings.deleteLogoUrl();

      expect(deleteFromStorageBestEffort).toHaveBeenCalledWith(
        'https://store.blob.vercel-storage.com/logo.png',
        expect.any(String),
      );
    });

    it('should not call the store when no logo was set', async () => {
      admin.mockPrisma.appSetting.findUnique.mockResolvedValue(null);
      admin.mockPrisma.appSetting.deleteMany.mockResolvedValue({ count: 0 });

      await admin.caller.settings.deleteLogoUrl();

      expect(deleteFromStorageBestEffort).toHaveBeenCalledWith(undefined, expect.any(String));
    });

    it('should delete the previous blob when the logo is replaced', async () => {
      admin.mockPrisma.appSetting.findUnique.mockResolvedValue({
        value: '"https://store.blob.vercel-storage.com/old-logo.png"',
      });
      admin.mockPrisma.appSetting.upsert.mockResolvedValue({});

      await admin.caller.settings.setLogoUrl({
        url: 'https://store.blob.vercel-storage.com/new-logo.png',
      });

      expect(deleteFromStorageBestEffort).toHaveBeenCalledWith(
        'https://store.blob.vercel-storage.com/old-logo.png',
        expect.any(String),
      );
    });

    it('should not delete the blob when the same URL is re-saved', async () => {
      const url = 'https://store.blob.vercel-storage.com/logo.png';
      admin.mockPrisma.appSetting.findUnique.mockResolvedValue({
        value: JSON.stringify(url),
      });
      admin.mockPrisma.appSetting.upsert.mockResolvedValue({});

      await admin.caller.settings.setLogoUrl({ url });

      expect(deleteFromStorageBestEffort).not.toHaveBeenCalled();
    });

    it('should still succeed when the blob store fails', async () => {
      admin.mockPrisma.appSetting.findUnique.mockResolvedValue({
        value: '"https://store.blob.vercel-storage.com/logo.png"',
      });
      admin.mockPrisma.appSetting.deleteMany.mockResolvedValue({ count: 1 });
      deleteFromStorageBestEffort.mockResolvedValue(false);

      const result = await admin.caller.settings.deleteLogoUrl();

      expect(result.success).toBe(true);
    });
  });
});
