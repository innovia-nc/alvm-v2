import { vi } from 'vitest';

function createModelMock() {
  return {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn().mockResolvedValue({ _sum: {} }),
    groupBy: vi.fn().mockResolvedValue([]),
  };
}

export type MockPrisma = ReturnType<typeof createMockPrisma>;

export function createMockPrisma() {
  const prisma = {
    appSetting: createModelMock(),
    campType: createModelMock(),
    paymentMethod: createModelMock(),
    user: createModelMock(),
    account: createModelMock(),
    parent: createModelMock(),
    staffMember: createModelMock(),
    child: createModelMock(),
    childParent: createModelMock(),
    childDocument: createModelMock(),
    camp: createModelMock(),
    campDay: createModelMock(),
    attendance: createModelMock(),
    registration: createModelMock(),
    invoice: createModelMock(),
    invoiceLine: createModelMock(),
    payment: createModelMock(),
    refund: createModelMock(),
    creditNoteAllocation: createModelMock(),
    parentCredit: createModelMock(),
    creditApplication: createModelMock(),
    accountingEntry: createModelMock(),

    $transaction: vi.fn().mockImplementation(async (fnOrArray: any) => {
      if (typeof fnOrArray === 'function') {
        return fnOrArray(prisma);
      }
      return Promise.all(fnOrArray);
    }),

    $queryRawUnsafe: vi.fn().mockResolvedValue([]),

    $connect: vi.fn(),
    $disconnect: vi.fn(),
  };

  return prisma;
}
