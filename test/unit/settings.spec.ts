import { describe, it, expect, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
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
    value: '"Mikado"',
    description: null,
    updatedBy: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  beforeEach(() => {
    admin = createTestCaller(ADMIN_USER);
    staff = createTestCaller(STAFF_USER);
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
      value: 'Mikado',
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
      { category: 'organization', key: 'name', value: '"Mikado"' },
      { category: 'pricing', key: 'currency', value: '"XPF"' },
    ]);
    const result = await staff.caller.settings.getAsMap();
    expect(result.organization?.name).toBe('"Mikado"');
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
});
