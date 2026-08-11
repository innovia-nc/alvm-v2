import { describe, it, expect, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  createTestCaller,
  ADMIN_USER,
  STAFF_USER,
  PARENT_USER,
  type TestCaller,
} from '../helpers/test-caller';

describe('campTypes router', () => {
  let admin: TestCaller;
  let staff: TestCaller;

  const fakeCampType = {
    id: 'b0000000-0000-4000-a000-000000000010',
    name: 'Vacances',
    description: 'Camp de vacances',
    active: true,
    accountingCode: '706100',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  beforeEach(() => {
    admin = createTestCaller(ADMIN_USER);
    staff = createTestCaller(STAFF_USER);
  });

  it('should deny PARENT from listAll', async () => {
    const { caller } = createTestCaller(PARENT_USER);
    await expect(caller.campTypes.listAll()).rejects.toThrow(TRPCError);
  });

  it('should return all camp types for staff', async () => {
    staff.mockPrisma.campType.findMany.mockResolvedValue([
      fakeCampType,
      { ...fakeCampType, id: 'b0000000-0000-4000-a000-000000000011', active: false },
    ]);
    const result = await staff.caller.campTypes.listAll();
    expect(result).toHaveLength(2);
  });

  it('should deny STAFF from creating camp types', async () => {
    await expect(
      staff.caller.campTypes.create({ name: 'New Type' }),
    ).rejects.toThrow(TRPCError);
  });

  it('should create a camp type', async () => {
    admin.mockPrisma.campType.findUnique.mockResolvedValue(null);
    admin.mockPrisma.campType.create.mockResolvedValue(fakeCampType);
    const result = await admin.caller.campTypes.create({
      name: 'Vacances',
      description: 'Camp de vacances',
      accountingCode: '706100',
    });
    expect(result.name).toBe('Vacances');
  });

  it('should reject duplicate name', async () => {
    admin.mockPrisma.campType.findUnique.mockResolvedValue(fakeCampType);
    await expect(
      admin.caller.campTypes.create({ name: 'Vacances' }),
    ).rejects.toThrow('Un type de camp avec ce nom existe déjà');
  });

  it('should reject duplicate accounting code', async () => {
    admin.mockPrisma.campType.findUnique.mockResolvedValue(null);
    admin.mockPrisma.campType.findFirst.mockResolvedValue(fakeCampType);
    await expect(
      admin.caller.campTypes.create({ name: 'New', accountingCode: '706100' }),
    ).rejects.toThrow('Ce code comptable est déjà utilisé');
  });

  it('should update a camp type', async () => {
    const updated = { ...fakeCampType, name: 'Updated' };
    admin.mockPrisma.campType.findUnique
      .mockResolvedValueOnce(fakeCampType)
      .mockResolvedValueOnce(null);
    admin.mockPrisma.campType.update.mockResolvedValue(updated);
    const result = await admin.caller.campTypes.update({
      id: fakeCampType.id,
      name: 'Updated',
    });
    expect(result.name).toBe('Updated');
  });

  it('should reject update on non-existent camp type', async () => {
    admin.mockPrisma.campType.findUnique.mockResolvedValue(null);
    await expect(
      admin.caller.campTypes.update({ id: fakeCampType.id, name: 'XX' }),
    ).rejects.toThrow('Type de camp non trouvé');
  });

  it('should toggle active status', async () => {
    admin.mockPrisma.campType.findUnique.mockResolvedValue(
      { ...fakeCampType, active: false },
    );
    admin.mockPrisma.campType.update.mockResolvedValue(
      { ...fakeCampType, active: true },
    );
    const result = await admin.caller.campTypes.toggleActive({ id: fakeCampType.id });
    expect(result.active).toBe(true);
  });

  it('should reject deactivation when active camps exist', async () => {
    admin.mockPrisma.campType.findUnique.mockResolvedValue(fakeCampType);
    admin.mockPrisma.camp.count.mockResolvedValue(3);
    await expect(
      admin.caller.campTypes.toggleActive({ id: fakeCampType.id }),
    ).rejects.toThrow('Impossible de désactiver un type utilisé par des camps actifs');
  });

  it('should delete a camp type with no camps', async () => {
    admin.mockPrisma.campType.findUnique.mockResolvedValue(fakeCampType);
    admin.mockPrisma.camp.count.mockResolvedValue(0);
    admin.mockPrisma.campType.delete.mockResolvedValue(fakeCampType);
    const result = await admin.caller.campTypes.delete({ id: fakeCampType.id });
    expect(result.success).toBe(true);
  });

  it('should reject deletion when camps reference the type', async () => {
    admin.mockPrisma.campType.findUnique.mockResolvedValue(fakeCampType);
    admin.mockPrisma.camp.count.mockResolvedValue(5);
    await expect(
      admin.caller.campTypes.delete({ id: fakeCampType.id }),
    ).rejects.toThrow('Impossible de supprimer un type utilisé par des camps');
  });
});
