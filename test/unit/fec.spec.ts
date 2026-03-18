import { describe, it, expect, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  createTestCaller,
  ADMIN_USER,
  STAFF_USER,
  PARENT_USER,
  type TestCaller,
} from '../helpers/test-caller';

describe('fec router', () => {
  let admin: TestCaller;

  const fakeEntry = {
    id: 'b0000000-0000-4000-a000-000000000050',
    entryNum: 'EC-001',
    entryDate: new Date('2025-01-15'),
    journalCode: 'VE',
    journalLib: 'Journal des Ventes',
    accountNumber: '411000',
    accountLabel: 'Clients',
    pieceRef: 'FAC-2025-0001',
    pieceDate: new Date('2025-01-15'),
    description: 'Facture camp vacances',
    debit: 10000,
    credit: 0,
    invoiceId: null,
    paymentId: null,
    creditNoteId: null,
    refundId: null,
    isCancelled: false,
    createdAt: new Date('2025-01-15'),
    updatedAt: new Date('2025-01-15'),
  };

  const fakeCounterEntry = {
    ...fakeEntry,
    id: 'b0000000-0000-4000-a000-000000000051',
    accountNumber: '706100',
    accountLabel: 'Produits camps',
    debit: 0,
    credit: 10000,
  };

  beforeEach(() => {
    admin = createTestCaller(ADMIN_USER);
  });

  // --- Access control ---

  it('should deny unauthenticated access', async () => {
    const { caller } = createTestCaller(null);
    await expect(
      caller.fec.getEntries({ startDate: '2025-01-01', endDate: '2025-12-31' }),
    ).rejects.toThrow(TRPCError);
  });

  it('should deny PARENT access', async () => {
    const { caller } = createTestCaller(PARENT_USER);
    await expect(
      caller.fec.getEntries({ startDate: '2025-01-01', endDate: '2025-12-31' }),
    ).rejects.toThrow(TRPCError);
  });

  it('should deny STAFF access', async () => {
    const { caller } = createTestCaller(STAFF_USER);
    await expect(
      caller.fec.getEntries({ startDate: '2025-01-01', endDate: '2025-12-31' }),
    ).rejects.toThrow(TRPCError);
  });

  // --- getEntries ---

  it('should return entries for date range', async () => {
    admin.mockPrisma.accountingEntry.findMany.mockResolvedValue([fakeEntry, fakeCounterEntry]);

    const result = await admin.caller.fec.getEntries({
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    });

    expect(result).toHaveLength(2);
    expect(result[0].debit).toBe(10000);
    expect(result[1].credit).toBe(10000);
  });

  it('should filter by journalCode', async () => {
    admin.mockPrisma.accountingEntry.findMany.mockResolvedValue([fakeEntry]);

    await admin.caller.fec.getEntries({
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      journalCode: 'VE',
    });

    expect(admin.mockPrisma.accountingEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          journalCode: 'VE',
          isCancelled: false,
        }),
      }),
    );
  });

  it('should reject invalid date format', async () => {
    await expect(
      admin.caller.fec.getEntries({ startDate: '01/01/2025', endDate: '2025-12-31' }),
    ).rejects.toThrow();
  });

  // --- generateFEC ---

  it('should generate FEC content', async () => {
    admin.mockPrisma.accountingEntry.findMany.mockResolvedValue([fakeEntry, fakeCounterEntry]);

    const result = await admin.caller.fec.generateFEC({
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    });

    expect(result.entryCount).toBe(2);
    expect(result.totalDebit).toBe(10000);
    expect(result.totalCredit).toBe(10000);
    expect(result.balance).toBe(0);
    expect(result.filename).toBe('FEC_20250101_20251231.txt');
    expect(result.content).toContain('JournalCode|JournalLib|');
    expect(result.content).toContain('VE|Journal des Ventes|');
  });

  it('should throw if no entries found', async () => {
    admin.mockPrisma.accountingEntry.findMany.mockResolvedValue([]);

    await expect(
      admin.caller.fec.generateFEC({
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      }),
    ).rejects.toThrow('Aucune ecriture comptable trouvee');
  });

  it('should throw if balance is not zero', async () => {
    admin.mockPrisma.accountingEntry.findMany.mockResolvedValue([fakeEntry]); // only debit, no credit

    await expect(
      admin.caller.fec.generateFEC({
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      }),
    ).rejects.toThrow('Balance comptable desequilibree');
  });

  // --- getStats ---

  it('should return stats grouped by journal', async () => {
    admin.mockPrisma.accountingEntry.findMany.mockResolvedValue([
      { journalCode: 'VE', journalLib: 'Journal des Ventes', debit: 10000, credit: 0 },
      { journalCode: 'VE', journalLib: 'Journal des Ventes', debit: 0, credit: 10000 },
      { journalCode: 'BQ', journalLib: 'Journal de Banque', debit: 5000, credit: 0 },
    ]);

    const result = await admin.caller.fec.getStats({
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    });

    expect(result.totalEntries).toBe(3);
    expect(result.totalDebit).toBe(15000);
    expect(result.totalCredit).toBe(10000);
    expect(result.balance).toBe(5000);
    expect(result.byJournal).toHaveLength(2);

    const veJournal = result.byJournal.find((j) => j.journalCode === 'VE');
    expect(veJournal).toBeDefined();
    expect(veJournal!.count).toBe(2);
    expect(veJournal!.debit).toBe(10000);
    expect(veJournal!.credit).toBe(10000);
  });
});
