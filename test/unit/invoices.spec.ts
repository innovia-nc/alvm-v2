import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

// Rendu PDF et upload Blob interceptés : les tests portent sur la chaîne
// (requête, pièce jointe, persistance de l'URL), pas sur @react-pdf/renderer.
const generateInvoicePDF = vi.fn();
const uploadToStorage = vi.fn();

vi.mock('@/lib/pdf/invoice-pdf', () => ({
  generateInvoicePDF: (...args: unknown[]) => generateInvoicePDF(...args),
}));

vi.mock('@/lib/storage/blob-storage', () => ({
  uploadToStorage: (...args: unknown[]) => uploadToStorage(...args),
  deleteFromStorage: vi.fn(),
  deleteFromStorageBestEffort: vi.fn().mockResolvedValue(true),
}));

import {
  createTestCaller,
  ADMIN_USER,
  STAFF_USER,
  PARENT_USER,
  type TestCaller,
} from '../helpers/test-caller';
import type { MockPrisma } from '../helpers/mock-prisma';

// ---------------------------------------------------------------------------
// Valid RFC 4122 UUIDs for test fixtures
// Pattern: [0-9a-f]{8}-[0-9a-f]{4}-[1-8]xxx-[89ab]xxx-[0-9a-f]{12}
// ---------------------------------------------------------------------------

const INVOICE_ID   = 'a0000000-0000-1000-a000-000000000001';
const LINE_ID      = 'b0000000-0000-1000-a000-000000000001';
const PAYMENT_ID   = 'c0000000-0000-1000-a000-000000000001';
const REG_ID       = 'd0000000-0000-1000-a000-000000000001';
const CAMP_ID      = 'e0000000-0000-1000-a000-000000000001';
const CHILD_ID     = 'f0000000-0000-1000-a000-000000000001';
const OTHER_PARENT = 'a1111111-1111-1111-a111-111111111111';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = new Date();
const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

function makeInvoiceRow(overrides: Record<string, any> = {}) {
  return {
    id: INVOICE_ID,
    invoiceNumber: 'FAC-2026-0001',
    parentId: PARENT_USER.id,
    issueDate: now,
    dueDate,
    subtotalHt: 10000,
    taxAmount: 0,
    taxRate: 0,
    totalAmount: 10000,
    paidAmount: 0,
    status: 'DRAFT',
    version: 0,
    pdfUrl: null,
    accountingExportedAt: null,
    invoiceType: 'INVOICE',
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    creator: null,
    validator: null,
    parent: {
      firstName: 'Jean',
      lastName: 'Dupont',
      email: 'jean@test.com',
      phone: '0601020304',
      homePhone: null,
      workPhone: null,
      address: '1 rue de la Paix',
      city: 'Noumea',
      postalCode: '98800',
    },
    lines: [
      {
        id: LINE_ID,
        invoiceId: INVOICE_ID,
        registrationId: null,
        description: 'Camp ete - Enfant',
        quantity: 5,
        unitPrice: 2000,
        totalPrice: 10000,
      },
    ],
    payments: [],
    ...overrides,
  };
}

function makeRawInvoice(overrides: Record<string, any> = {}) {
  return {
    id: INVOICE_ID,
    invoiceNumber: 'FAC-2026-0001',
    parentId: PARENT_USER.id,
    issueDate: now,
    dueDate,
    subtotalHt: 10000,
    taxAmount: 0,
    taxRate: 0,
    totalAmount: 10000,
    paidAmount: 0,
    status: 'DRAFT',
    version: 0,
    pdfUrl: null,
    accountingExportedAt: null,
    invoiceType: 'INVOICE',
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('invoices router', () => {
  let caller: TestCaller['caller'];
  let mockPrisma: MockPrisma;

  // =========================================================================
  // list
  // =========================================================================

  describe('list', () => {
    describe('access control', () => {
      it('rejects unauthenticated users', async () => {
        const { caller: anonCaller } = createTestCaller(null);
        await expect(anonCaller.invoices.list({})).rejects.toThrow(TRPCError);
        await expect(anonCaller.invoices.list({})).rejects.toMatchObject({
          code: 'UNAUTHORIZED',
        });
      });

      it('allows PARENT role', async () => {
        ({ caller, mockPrisma } = createTestCaller(PARENT_USER));
        const row = makeInvoiceRow();
        mockPrisma.invoice.findMany.mockResolvedValue([row]);
        mockPrisma.invoice.count.mockResolvedValue(1);

        const result = await caller.invoices.list({});
        expect(result.total).toBe(1);
        expect(result.invoices).toHaveLength(1);
      });

      it('forces parentId filter for PARENT users, ignoring supplied parentId', async () => {
        ({ caller, mockPrisma } = createTestCaller(PARENT_USER));
        mockPrisma.invoice.findMany.mockResolvedValue([]);
        mockPrisma.invoice.count.mockResolvedValue(0);

        await caller.invoices.list({
          parentId: OTHER_PARENT,
        });

        // The where clause should use the PARENT user's own id, not the supplied one
        const findManyCall = mockPrisma.invoice.findMany.mock.calls[0][0];
        expect(findManyCall.where.parentId).toBe(PARENT_USER.id);
      });

      it('allows STAFF role', async () => {
        ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
        mockPrisma.invoice.findMany.mockResolvedValue([]);
        mockPrisma.invoice.count.mockResolvedValue(0);

        const result = await caller.invoices.list({});
        expect(result.total).toBe(0);
      });

      it('allows ADMIN role', async () => {
        ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
        mockPrisma.invoice.findMany.mockResolvedValue([]);
        mockPrisma.invoice.count.mockResolvedValue(0);

        const result = await caller.invoices.list({});
        expect(result.total).toBe(0);
      });
    });

    describe('filtering and pagination', () => {
      beforeEach(() => {
        ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
      });

      it('filters by status when provided', async () => {
        mockPrisma.invoice.findMany.mockResolvedValue([]);
        mockPrisma.invoice.count.mockResolvedValue(0);

        await caller.invoices.list({ status: 'PAID' });

        const call = mockPrisma.invoice.findMany.mock.calls[0][0];
        expect(call.where.status).toBe('PAID');
      });

      // US-FACT-02-bis — sélecteur de facture du formulaire d'avoir
      it('filters by multiple statuses when `statuses` is provided', async () => {
        mockPrisma.invoice.findMany.mockResolvedValue([]);
        mockPrisma.invoice.count.mockResolvedValue(0);

        await caller.invoices.list({ statuses: ['SENT', 'PAID', 'OVERDUE'] });

        const call = mockPrisma.invoice.findMany.mock.calls[0][0];
        expect(call.where.status).toEqual({ in: ['SENT', 'PAID', 'OVERDUE'] });
      });

      it('gives precedence to `status` over `statuses`', async () => {
        mockPrisma.invoice.findMany.mockResolvedValue([]);
        mockPrisma.invoice.count.mockResolvedValue(0);

        await caller.invoices.list({ status: 'PAID', statuses: ['SENT', 'OVERDUE'] });

        const call = mockPrisma.invoice.findMany.mock.calls[0][0];
        expect(call.where.status).toBe('PAID');
      });

      it('leaves the status filter open when neither is provided', async () => {
        mockPrisma.invoice.findMany.mockResolvedValue([]);
        mockPrisma.invoice.count.mockResolvedValue(0);

        await caller.invoices.list({});

        const call = mockPrisma.invoice.findMany.mock.calls[0][0];
        expect(call.where.status).toBeUndefined();
      });

      it('rejects an empty `statuses` array', async () => {
        await expect(caller.invoices.list({ statuses: [] })).rejects.toThrow();
      });

      it('applies parentId filter for non-PARENT users when provided', async () => {
        mockPrisma.invoice.findMany.mockResolvedValue([]);
        mockPrisma.invoice.count.mockResolvedValue(0);

        await caller.invoices.list({ parentId: OTHER_PARENT });

        const call = mockPrisma.invoice.findMany.mock.calls[0][0];
        expect(call.where.parentId).toBe(OTHER_PARENT);
      });

      it('applies limit and offset', async () => {
        mockPrisma.invoice.findMany.mockResolvedValue([]);
        mockPrisma.invoice.count.mockResolvedValue(0);

        await caller.invoices.list({ limit: 5, offset: 10 });

        const call = mockPrisma.invoice.findMany.mock.calls[0][0];
        expect(call.take).toBe(5);
        expect(call.skip).toBe(10);
      });

      it('filters by invoiceType INVOICE and deletedAt null', async () => {
        mockPrisma.invoice.findMany.mockResolvedValue([]);
        mockPrisma.invoice.count.mockResolvedValue(0);

        await caller.invoices.list({});

        const call = mockPrisma.invoice.findMany.mock.calls[0][0];
        expect(call.where.invoiceType).toBe('INVOICE');
        expect(call.where.deletedAt).toBeNull();
      });

      // -------------------------------------------------------------------------
      // B7 — search support on invoices.list
      // -------------------------------------------------------------------------

      it('applies OR search on invoiceNumber + parent fields when search provided', async () => {
        mockPrisma.invoice.findMany.mockResolvedValue([]);
        mockPrisma.invoice.count.mockResolvedValue(0);

        await caller.invoices.list({ search: 'Dupont' });

        const call = mockPrisma.invoice.findMany.mock.calls[0][0];
        expect(call.where.OR).toBeDefined();
        expect(call.where.OR).toHaveLength(4);
        expect(call.where.OR).toEqual(
          expect.arrayContaining([
            { invoiceNumber: { contains: 'Dupont', mode: 'insensitive' } },
            { parent: { firstName: { contains: 'Dupont', mode: 'insensitive' } } },
            { parent: { lastName: { contains: 'Dupont', mode: 'insensitive' } } },
            { parent: { email: { contains: 'Dupont', mode: 'insensitive' } } },
          ]),
        );
      });

      it('does not add OR when search is undefined', async () => {
        mockPrisma.invoice.findMany.mockResolvedValue([]);
        mockPrisma.invoice.count.mockResolvedValue(0);

        await caller.invoices.list({});

        const call = mockPrisma.invoice.findMany.mock.calls[0][0];
        expect(call.where.OR).toBeUndefined();
      });

      it('does not add OR when search is an empty string or whitespace', async () => {
        mockPrisma.invoice.findMany.mockResolvedValue([]);
        mockPrisma.invoice.count.mockResolvedValue(0);

        await caller.invoices.list({ search: '   ' });

        const call = mockPrisma.invoice.findMany.mock.calls[0][0];
        expect(call.where.OR).toBeUndefined();
      });

      it('combines search with status filter (AND)', async () => {
        mockPrisma.invoice.findMany.mockResolvedValue([]);
        mockPrisma.invoice.count.mockResolvedValue(0);

        await caller.invoices.list({ search: 'FAC-2026', status: 'SENT' });

        const call = mockPrisma.invoice.findMany.mock.calls[0][0];
        expect(call.where.status).toBe('SENT');
        expect(call.where.OR).toBeDefined();
        expect(call.where.OR).toHaveLength(4);
      });

      it('combines search with parentId filter (AND)', async () => {
        mockPrisma.invoice.findMany.mockResolvedValue([]);
        mockPrisma.invoice.count.mockResolvedValue(0);

        await caller.invoices.list({ search: 'jean@test.com', parentId: OTHER_PARENT });

        const call = mockPrisma.invoice.findMany.mock.calls[0][0];
        expect(call.where.parentId).toBe(OTHER_PARENT);
        expect(call.where.OR).toBeDefined();
      });

      it('maps invoice with details correctly', async () => {
        const row = makeInvoiceRow({
          totalAmount: 15000,
          paidAmount: 5000,
          payments: [
            {
              id: PAYMENT_ID,
              amount: 5000,
              paymentDate: now,
              paymentMethod: { name: 'Especes' },
            },
          ],
        });
        mockPrisma.invoice.findMany.mockResolvedValue([row]);
        mockPrisma.invoice.count.mockResolvedValue(1);

        const result = await caller.invoices.list({});
        const inv = result.invoices[0];

        expect(inv.totalAmount).toBe(15000);
        expect(inv.paidAmount).toBe(5000);
        expect(inv.remainingAmount).toBe(10000);
        expect(inv.payments).toHaveLength(1);
        expect(inv.payments[0].paymentMethod).toBe('Especes');
        expect(inv.parent.firstName).toBe('Jean');
        expect(inv.lines).toHaveLength(1);
      });
    });

    describe('input validation', () => {
      beforeEach(() => {
        ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
      });

      it('rejects limit > 100', async () => {
        await expect(caller.invoices.list({ limit: 200 })).rejects.toThrow();
      });

      it('rejects limit < 1', async () => {
        await expect(caller.invoices.list({ limit: 0 })).rejects.toThrow();
      });

      it('rejects negative offset', async () => {
        await expect(caller.invoices.list({ offset: -1 })).rejects.toThrow();
      });

      it('rejects invalid status value', async () => {
        await expect(
          caller.invoices.list({ status: 'INVALID' as any }),
        ).rejects.toThrow();
      });

      it('rejects invalid parentId format', async () => {
        await expect(
          caller.invoices.list({ parentId: 'not-a-uuid' }),
        ).rejects.toThrow();
      });
    });
  });

  // =========================================================================
  // getById
  // =========================================================================

  describe('getById', () => {
    it('rejects unauthenticated users', async () => {
      const { caller: anonCaller } = createTestCaller(null);
      await expect(
        anonCaller.invoices.getById({ id: INVOICE_ID }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('returns null when invoice not found', async () => {
      ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      const result = await caller.invoices.getById({ id: INVOICE_ID });
      expect(result).toBeNull();
    });

    it('returns the invoice with details for ADMIN', async () => {
      ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
      mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoiceRow());

      const result = await caller.invoices.getById({ id: INVOICE_ID });

      expect(result).not.toBeNull();
      expect(result!.id).toBe(INVOICE_ID);
      expect(result!.parent.lastName).toBe('Dupont');
      expect(result!.remainingAmount).toBe(10000);
    });

    it('adds parentId filter for PARENT users', async () => {
      ({ caller, mockPrisma } = createTestCaller(PARENT_USER));
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await caller.invoices.getById({ id: INVOICE_ID });

      const call = mockPrisma.invoice.findFirst.mock.calls[0][0];
      expect(call.where.parentId).toBe(PARENT_USER.id);
    });

    it('rejects invalid UUID input', async () => {
      ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
      await expect(
        caller.invoices.getById({ id: 'not-a-uuid' }),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // create
  // =========================================================================

  describe('create', () => {
    const validInput = {
      parentId: PARENT_USER.id,
      dueDate: '2026-04-15',
      lines: [
        {
          registrationId: null,
          description: 'Camp ete - Enfant A',
          quantity: 5,
          unitPrice: 2000,
        },
      ],
    };

    describe('access control', () => {
      it('rejects unauthenticated users', async () => {
        const { caller: anonCaller } = createTestCaller(null);
        await expect(anonCaller.invoices.create(validInput)).rejects.toMatchObject({
          code: 'UNAUTHORIZED',
        });
      });

      it('rejects PARENT role', async () => {
        const { caller: parentCaller } = createTestCaller(PARENT_USER);
        await expect(parentCaller.invoices.create(validInput)).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      });

      it('allows STAFF role', async () => {
        ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
        const created = makeRawInvoice();
        mockPrisma.invoice.create.mockResolvedValue(created);
        mockPrisma.invoiceLine.create.mockResolvedValue({});

        const result = await caller.invoices.create(validInput);
        expect(result.id).toBe(created.id);
      });

      it('allows ADMIN role', async () => {
        ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
        const created = makeRawInvoice();
        mockPrisma.invoice.create.mockResolvedValue(created);
        mockPrisma.invoiceLine.create.mockResolvedValue({});

        const result = await caller.invoices.create(validInput);
        expect(result.id).toBe(created.id);
      });
    });

    describe('business logic', () => {
      beforeEach(() => {
        ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
      });

      it('calculates totalAmount from lines with tax from settings', async () => {
        const input = {
          parentId: PARENT_USER.id,
          dueDate: '2026-04-15',
          lines: [
            { registrationId: null, description: 'Ligne 1', quantity: 3, unitPrice: 1000 },
            { registrationId: null, description: 'Ligne 2', quantity: 2, unitPrice: 500 },
          ],
        };

        // subtotalHt = 3*1000 + 2*500 = 4000, TGC par défaut = 0 (exonération LP 492) → totalAmount = 4000
        const created = makeRawInvoice({ totalAmount: 4000, subtotalHt: 4000 });
        mockPrisma.invoice.create.mockResolvedValue(created);
        mockPrisma.invoiceLine.create.mockResolvedValue({});

        await caller.invoices.create(input);

        const createCall = mockPrisma.invoice.create.mock.calls[0][0];
        expect(createCall.data.subtotalHt).toBe(4000);
        expect(createCall.data.taxRate).toBe(0);
        expect(createCall.data.taxAmount).toBe(0);
        expect(createCall.data.totalAmount).toBe(4000);
        expect(createCall.data.status).toBe('DRAFT');
      });

      it('creates invoice lines within the transaction', async () => {
        const created = makeRawInvoice();
        mockPrisma.invoice.create.mockResolvedValue(created);
        mockPrisma.invoiceLine.create.mockResolvedValue({});

        await caller.invoices.create(validInput);

        expect(mockPrisma.invoiceLine.create).toHaveBeenCalledTimes(1);
        const lineCall = mockPrisma.invoiceLine.create.mock.calls[0][0];
        expect(lineCall.data.invoiceId).toBe(created.id);
        expect(lineCall.data.description).toBe('Camp ete - Enfant A');
        expect(lineCall.data.quantity).toBe(5);
        expect(lineCall.data.unitPrice).toBe(2000);
        expect(lineCall.data.totalPrice).toBe(10000);
      });

      it('uses $transaction', async () => {
        const created = makeRawInvoice();
        mockPrisma.invoice.create.mockResolvedValue(created);
        mockPrisma.invoiceLine.create.mockResolvedValue({});

        await caller.invoices.create(validInput);

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      });
    });

    describe('input validation', () => {
      beforeEach(() => {
        ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
      });

      it('rejects empty lines array', async () => {
        await expect(
          caller.invoices.create({ ...validInput, lines: [] }),
        ).rejects.toThrow();
      });

      it('rejects line with description shorter than 3 chars', async () => {
        await expect(
          caller.invoices.create({
            ...validInput,
            lines: [
              { registrationId: null, description: 'AB', quantity: 1, unitPrice: 100 },
            ],
          }),
        ).rejects.toThrow();
      });

      it('rejects line with quantity < 1', async () => {
        await expect(
          caller.invoices.create({
            ...validInput,
            lines: [
              { registrationId: null, description: 'Valid desc', quantity: 0, unitPrice: 100 },
            ],
          }),
        ).rejects.toThrow();
      });

      it('rejects line with unitPrice < 0', async () => {
        await expect(
          caller.invoices.create({
            ...validInput,
            lines: [
              { registrationId: null, description: 'Valid desc', quantity: 1, unitPrice: -100 },
            ],
          }),
        ).rejects.toThrow();
      });

      it('rejects invalid dueDate format', async () => {
        await expect(
          caller.invoices.create({ ...validInput, dueDate: 'not-a-date' }),
        ).rejects.toThrow();
      });

      it('rejects invalid parentId format', async () => {
        await expect(
          caller.invoices.create({ ...validInput, parentId: 'bad-uuid' }),
        ).rejects.toThrow();
      });
    });
  });

  // =========================================================================
  // createFromRegistration
  // =========================================================================

  describe('createFromRegistration', () => {
    const mockRegistration = {
      id: REG_ID,
      parentId: PARENT_USER.id,
      campId: CAMP_ID,
      childId: CHILD_ID,
      status: 'CONFIRMED',
      paymentStatus: 'UNPAID',
      deletedAt: null,
      camp: {
        name: 'Camp Ete 2026',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-07-05'),
        pricePerDay: 2000,
      },
      child: {
        firstName: 'Marie',
        lastName: 'Dupont',
      },
    };

    describe('access control', () => {
      it('rejects unauthenticated users', async () => {
        const { caller: anonCaller } = createTestCaller(null);
        await expect(
          anonCaller.invoices.createFromRegistration({ registrationId: REG_ID }),
        ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      });

      it('rejects PARENT role', async () => {
        const { caller: parentCaller } = createTestCaller(PARENT_USER);
        await expect(
          parentCaller.invoices.createFromRegistration({ registrationId: REG_ID }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      });
    });

    describe('business logic', () => {
      beforeEach(() => {
        ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
      });

      it('throws NOT_FOUND when registration does not exist', async () => {
        mockPrisma.registration.findFirst.mockResolvedValue(null);

        await expect(
          caller.invoices.createFromRegistration({ registrationId: REG_ID }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      });

      it('throws CONFLICT when an invoice line already exists for the registration', async () => {
        mockPrisma.registration.findFirst.mockResolvedValue(mockRegistration);
        mockPrisma.invoiceLine.findFirst.mockResolvedValue({ id: 'existing-line' });

        await expect(
          caller.invoices.createFromRegistration({ registrationId: REG_ID }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
      });

      it('throws PRECONDITION_FAILED for a cancelled registration', async () => {
        mockPrisma.registration.findFirst.mockResolvedValue({
          ...mockRegistration,
          status: 'CANCELLED',
        });
        mockPrisma.invoiceLine.findFirst.mockResolvedValue(null);

        await expect(
          caller.invoices.createFromRegistration({ registrationId: REG_ID }),
        ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
      });

      it('creates invoice with correct computed amounts (5 days x 2000, TGC 0 — LP 492)', async () => {
        mockPrisma.registration.findFirst.mockResolvedValue(mockRegistration);
        mockPrisma.invoiceLine.findFirst.mockResolvedValue(null);
        // subtotalHt = 5 * 2000 = 10000, TGC 0 (exonération LP 492) → totalAmount = 10000
        const created = makeRawInvoice({ totalAmount: 10000, subtotalHt: 10000 });
        mockPrisma.invoice.create.mockResolvedValue(created);
        mockPrisma.invoiceLine.create.mockResolvedValue({});

        await caller.invoices.createFromRegistration({ registrationId: REG_ID });

        const createCall = mockPrisma.invoice.create.mock.calls[0][0];
        // 5 days (July 1-5 inclusive) * 2000 = 10000 HT, TGC 0 (LP 492) = 10000 TTC
        expect(createCall.data.subtotalHt).toBe(10000);
        expect(createCall.data.taxRate).toBe(0);
        expect(createCall.data.taxAmount).toBe(0);
        expect(createCall.data.totalAmount).toBe(10000);
        expect(createCall.data.parentId).toBe(PARENT_USER.id);
        expect(createCall.data.status).toBe('DRAFT');
      });

      it('creates invoice with SENT status when requested', async () => {
        mockPrisma.registration.findFirst.mockResolvedValue(mockRegistration);
        mockPrisma.invoiceLine.findFirst.mockResolvedValue(null);
        const created = makeRawInvoice({ status: 'SENT' });
        mockPrisma.invoice.create.mockResolvedValue(created);
        mockPrisma.invoiceLine.create.mockResolvedValue({});

        await caller.invoices.createFromRegistration({
          registrationId: REG_ID,
          status: 'SENT',
        });

        const createCall = mockPrisma.invoice.create.mock.calls[0][0];
        expect(createCall.data.status).toBe('SENT');
      });

      it('creates an invoice line with the correct description and amounts (HT)', async () => {
        mockPrisma.registration.findFirst.mockResolvedValue(mockRegistration);
        mockPrisma.invoiceLine.findFirst.mockResolvedValue(null);
        const created = makeRawInvoice();
        mockPrisma.invoice.create.mockResolvedValue(created);
        mockPrisma.invoiceLine.create.mockResolvedValue({});

        await caller.invoices.createFromRegistration({ registrationId: REG_ID });

        expect(mockPrisma.invoiceLine.create).toHaveBeenCalledTimes(1);
        const lineCall = mockPrisma.invoiceLine.create.mock.calls[0][0];
        expect(lineCall.data.registrationId).toBe(REG_ID);
        expect(lineCall.data.quantity).toBe(5);
        expect(lineCall.data.unitPrice).toBe(2000);
        // totalPrice is subtotalHt (before tax): 5 * 2000 = 10000
        expect(lineCall.data.totalPrice).toBe(10000);
        expect(lineCall.data.description).toContain('Camp Ete 2026');
        expect(lineCall.data.description).toContain('Marie Dupont');
      });
    });

    describe('input validation', () => {
      beforeEach(() => {
        ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
      });

      it('rejects invalid registrationId', async () => {
        await expect(
          caller.invoices.createFromRegistration({ registrationId: 'bad' }),
        ).rejects.toThrow();
      });

      it('rejects invalid status value', async () => {
        await expect(
          caller.invoices.createFromRegistration({
            registrationId: REG_ID,
            status: 'PAID' as any,
          }),
        ).rejects.toThrow();
      });
    });
  });

  // =========================================================================
  // validate
  // =========================================================================

  // =========================================================================
  // update
  // =========================================================================

  describe('update', () => {
    const baseInput = () => ({
      id: INVOICE_ID,
      version: 0,
      lines: [
        {
          registrationId: null,
          description: 'Camp ete - Enfant',
          quantity: 5,
          unitPrice: 2000,
        },
      ],
    });

    describe('access control', () => {
      it('rejects unauthenticated users', async () => {
        const { caller: anonCaller } = createTestCaller(null);
        await expect(
          anonCaller.invoices.update(baseInput()),
        ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      });

      it('rejects PARENT role', async () => {
        const { caller: parentCaller } = createTestCaller(PARENT_USER);
        await expect(
          parentCaller.invoices.update(baseInput()),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      });

      it('allows STAFF role', async () => {
        ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
        mockPrisma.invoice.findFirst.mockResolvedValue(
          makeRawInvoice({ status: 'DRAFT', taxRate: 0.11 }),
        );
        mockPrisma.invoice.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.invoiceLine.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.invoiceLine.create.mockResolvedValue({});
        mockPrisma.invoice.findUniqueOrThrow.mockResolvedValue(
          makeRawInvoice({ status: 'DRAFT', version: 1 }),
        );

        const result = await caller.invoices.update(baseInput());
        expect(result.status).toBe('DRAFT');
      });
    });

    describe('business logic', () => {
      beforeEach(() => {
        ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
      });

      it('throws NOT_FOUND when invoice does not exist', async () => {
        mockPrisma.invoice.findFirst.mockResolvedValue(null);

        await expect(caller.invoices.update(baseInput())).rejects.toMatchObject({
          code: 'NOT_FOUND',
        });
      });

      it('throws PRECONDITION_FAILED when invoice is not DRAFT', async () => {
        mockPrisma.invoice.findFirst.mockResolvedValue(
          makeRawInvoice({ status: 'SENT' }),
        );

        await expect(caller.invoices.update(baseInput())).rejects.toMatchObject({
          code: 'PRECONDITION_FAILED',
        });
      });

      it('throws CONFLICT on stale version', async () => {
        mockPrisma.invoice.findFirst.mockResolvedValue(
          makeRawInvoice({ status: 'DRAFT', version: 3, taxRate: 0.11 }),
        );
        mockPrisma.invoice.updateMany.mockResolvedValue({ count: 0 });

        await expect(
          caller.invoices.update({ ...baseInput(), version: 0 }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
      });

      it('recomputes totals using stored tax rate', async () => {
        mockPrisma.invoice.findFirst.mockResolvedValue(
          makeRawInvoice({ status: 'DRAFT', taxRate: 0.11 }),
        );
        mockPrisma.invoice.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.invoiceLine.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.invoiceLine.create.mockResolvedValue({});
        mockPrisma.invoice.findUniqueOrThrow.mockResolvedValue(
          makeRawInvoice({ status: 'DRAFT', version: 1 }),
        );

        await caller.invoices.update({
          id: INVOICE_ID,
          version: 0,
          lines: [
            {
              registrationId: null,
              description: 'Inscription Camp Ete',
              quantity: 3,
              unitPrice: 1000,
            },
            {
              registrationId: null,
              description: 'Supplement repas',
              quantity: 2,
              unitPrice: 500,
            },
          ],
        });

        // subtotalHt = 3*1000 + 2*500 = 4000
        // taxAmount = 4000 * 0.11 = 440
        // totalAmount = 4440
        const updateCall = mockPrisma.invoice.updateMany.mock.calls[0][0];
        expect(updateCall.where).toMatchObject({
          id: INVOICE_ID,
          version: 0,
          status: 'DRAFT',
        });
        expect(updateCall.data.subtotalHt).toBe(4000);
        expect(updateCall.data.taxAmount).toBeCloseTo(440, 5);
        expect(updateCall.data.totalAmount).toBeCloseTo(4440, 5);
        expect(updateCall.data.version).toEqual({ increment: 1 });
      });

      it('soft-deletes existing lines and creates new ones', async () => {
        mockPrisma.invoice.findFirst.mockResolvedValue(
          makeRawInvoice({ status: 'DRAFT', taxRate: 0 }),
        );
        mockPrisma.invoice.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.invoiceLine.updateMany.mockResolvedValue({ count: 2 });
        mockPrisma.invoiceLine.create.mockResolvedValue({});
        mockPrisma.invoice.findUniqueOrThrow.mockResolvedValue(
          makeRawInvoice({ status: 'DRAFT', version: 1 }),
        );

        await caller.invoices.update({
          id: INVOICE_ID,
          version: 0,
          lines: [
            {
              registrationId: REG_ID,
              description: 'Inscription Camp',
              quantity: 1,
              unitPrice: 5000,
            },
          ],
        });

        expect(mockPrisma.invoiceLine.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { invoiceId: INVOICE_ID, deletedAt: null },
            data: expect.objectContaining({
              deletedAt: expect.any(Date),
            }),
          }),
        );
        expect(mockPrisma.invoiceLine.create).toHaveBeenCalledTimes(1);
        expect(mockPrisma.invoiceLine.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            invoiceId: INVOICE_ID,
            registrationId: REG_ID,
            description: 'Inscription Camp',
            quantity: 1,
            unitPrice: 5000,
            totalPrice: 5000,
          }),
        });
      });
    });
  });

  describe('validate', () => {
    describe('access control', () => {
      it('rejects unauthenticated users', async () => {
        const { caller: anonCaller } = createTestCaller(null);
        await expect(
          anonCaller.invoices.validate({ id: INVOICE_ID }),
        ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      });

      it('rejects PARENT role', async () => {
        const { caller: parentCaller } = createTestCaller(PARENT_USER);
        await expect(
          parentCaller.invoices.validate({ id: INVOICE_ID }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      });
    });

    describe('business logic', () => {
      beforeEach(() => {
        ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
      });

      it('throws NOT_FOUND when invoice does not exist', async () => {
        mockPrisma.invoice.findFirst.mockResolvedValue(null);

        await expect(
          caller.invoices.validate({ id: INVOICE_ID }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      });

      it('throws PRECONDITION_FAILED when invoice is not DRAFT', async () => {
        mockPrisma.invoice.findFirst.mockResolvedValue(
          makeRawInvoice({ status: 'SENT' }),
        );

        await expect(
          caller.invoices.validate({ id: INVOICE_ID }),
        ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
      });

      it('throws PRECONDITION_FAILED for PAID invoice', async () => {
        mockPrisma.invoice.findFirst.mockResolvedValue(
          makeRawInvoice({ status: 'PAID' }),
        );

        await expect(
          caller.invoices.validate({ id: INVOICE_ID }),
        ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
      });

      it('updates DRAFT invoice to SENT', async () => {
        mockPrisma.invoice.findFirst.mockResolvedValue(
          makeRawInvoice({ status: 'DRAFT' }),
        );
        mockPrisma.invoice.update.mockResolvedValue(
          makeRawInvoice({ status: 'SENT' }),
        );
        mockPrisma.invoice.findUniqueOrThrow.mockResolvedValue({
          ...makeRawInvoice({ status: 'SENT' }),
          lines: [],
        });

        const result = await caller.invoices.validate({ id: INVOICE_ID });

        expect(result.status).toBe('SENT');
        expect(mockPrisma.invoice.update).toHaveBeenCalledWith({
          where: { id: INVOICE_ID },
          data: { status: 'SENT', pdfUrl: null, validatedById: STAFF_USER.id },
        });
      });

      it('validates a 0 XPF invoice without creating accounting entries', async () => {
        // Anti-régression prod 2026-07-06 : une écriture 0/0 viole la
        // contrainte BDD check_debit_or_credit (500 sur les brouillons legacy à 0).
        const zero = { subtotalHt: 0, taxAmount: 0, totalAmount: 0 };
        mockPrisma.invoice.findFirst.mockResolvedValue(
          makeRawInvoice({ status: 'DRAFT', ...zero }),
        );
        mockPrisma.invoice.update.mockResolvedValue(
          makeRawInvoice({ status: 'SENT', ...zero }),
        );
        mockPrisma.invoice.findUniqueOrThrow.mockResolvedValue({
          ...makeRawInvoice({ status: 'SENT', ...zero }),
          lines: [],
        });

        const result = await caller.invoices.validate({ id: INVOICE_ID });

        expect(result.status).toBe('SENT');
        expect(mockPrisma.accountingEntry.create).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------------
    // US-FACT-02 — imputation automatique des avoirs à l'émission
    // -----------------------------------------------------------------------
    describe('US-FACT-02 — déduction automatique des avoirs', () => {
      beforeEach(() => {
        ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
        mockPrisma.paymentMethod.findFirst.mockResolvedValue({
          id: 'd0000000-0000-1000-a000-000000000009',
          code: 'CREDIT_NOTE',
          accountingCode: '411000',
        });
        mockPrisma.payment.create.mockResolvedValue({ id: PAYMENT_ID });
      });

      /** Prépare une facture DRAFT de 10 000 XPF prête à être validée. */
      function arrangeDraftInvoice() {
        mockPrisma.invoice.findFirst.mockResolvedValue(makeRawInvoice({ status: 'DRAFT' }));
        mockPrisma.invoice.update.mockResolvedValue(makeRawInvoice({ status: 'SENT' }));
        mockPrisma.invoice.findUniqueOrThrow.mockResolvedValue({
          ...makeRawInvoice({ status: 'SENT' }),
          lines: [],
        });
      }

      function makeCredit(id: string, creditNoteId: string, amount: number) {
        return {
          id,
          creditNoteId,
          parentId: PARENT_USER.id,
          amountOriginal: amount,
          amountRemaining: amount,
          expiresAt: null,
          creditNote: {
            id: creditNoteId,
            invoiceNumber: 'AVO-2026-0001',
            status: 'SENT',
            isFutureCredit: true,
          },
        };
      }

      it('laisse la facture en SENT quand le client n\'a aucun avoir', async () => {
        arrangeDraftInvoice();
        mockPrisma.parentCredit.findMany.mockResolvedValue([]);

        const result = await caller.invoices.validate({ id: INVOICE_ID });

        expect(result.status).toBe('SENT');
        expect(mockPrisma.payment.create).not.toHaveBeenCalled();
      });

      it('impute un avoir partiel et laisse la facture en SENT', async () => {
        arrangeDraftInvoice();
        mockPrisma.parentCredit.findMany.mockResolvedValue([
          makeCredit('cr1', 'cn1', 2000),
        ]);
        // Second update : paidAmount porté à 2 000, statut inchangé.
        mockPrisma.invoice.update
          .mockResolvedValueOnce(makeRawInvoice({ status: 'SENT' }))
          .mockResolvedValueOnce(makeRawInvoice({ status: 'SENT', paidAmount: 2000 }));

        const result = await caller.invoices.validate({ id: INVOICE_ID });

        expect(result.status).toBe('SENT');
        expect(result.paidAmount).toBe(2000);

        const lastUpdate = mockPrisma.invoice.update.mock.calls.at(-1)![0];
        expect(lastUpdate.data).toEqual({ paidAmount: 2000, status: 'SENT' });
      });

      it('bascule la facture en PAID quand les avoirs la couvrent entièrement', async () => {
        arrangeDraftInvoice();
        mockPrisma.parentCredit.findMany.mockResolvedValue([
          makeCredit('cr1', 'cn1', 15000),
        ]);
        mockPrisma.invoice.update
          .mockResolvedValueOnce(makeRawInvoice({ status: 'SENT' }))
          .mockResolvedValueOnce(makeRawInvoice({ status: 'PAID', paidAmount: 10000 }));

        const result = await caller.invoices.validate({ id: INVOICE_ID });

        expect(result.status).toBe('PAID');

        const lastUpdate = mockPrisma.invoice.update.mock.calls.at(-1)![0];
        expect(lastUpdate.data).toEqual({ paidAmount: 10000, status: 'PAID' });
        // Le reliquat de 5 000 reste disponible pour une facture ultérieure.
        expect(mockPrisma.parentCredit.update).toHaveBeenCalledWith({
          where: { id: 'cr1' },
          data: { amountRemaining: 5000 },
        });
      });

      it('impute les avoirs APRÈS les écritures VE de la facture', async () => {
        arrangeDraftInvoice();
        mockPrisma.parentCredit.findMany.mockResolvedValue([
          makeCredit('cr1', 'cn1', 2000),
        ]);

        await caller.invoices.validate({ id: INVOICE_ID });

        // Les 2 premières écritures sont les VE (D 411000 / C 706000 + TGC),
        // les suivantes la BQ de l'imputation.
        const journals = mockPrisma.accountingEntry.create.mock.calls.map(
          (c: any[]) => c[0].data.journalCode,
        );
        expect(journals[0]).toBe('VE');
        expect(journals.at(-1)).toBe('BQ');
      });
    });
  });

  // =========================================================================
  // FEAT-004 — Tracabilite (createdById / validatedById / role-gating)
  // =========================================================================

  describe('FEAT-004 tracability', () => {
    // -----------------------------------------------------------------------
    // T1 — create remplit createdById = ctx.user.id
    // -----------------------------------------------------------------------
    describe('create sets createdById', () => {
      it('passes createdById = ctx.user.id to invoice.create', async () => {
        ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
        const created = makeRawInvoice();
        mockPrisma.invoice.create.mockResolvedValue(created);
        mockPrisma.invoiceLine.create.mockResolvedValue({});

        await caller.invoices.create({
          parentId: PARENT_USER.id,
          dueDate: '2026-04-15',
          lines: [
            { registrationId: null, description: 'Camp ete - Enfant', quantity: 5, unitPrice: 2000 },
          ],
        });

        const createCall = mockPrisma.invoice.create.mock.calls[0][0];
        expect(createCall.data.createdById).toBe(STAFF_USER.id);
      });

      it('does not set validatedById on create', async () => {
        ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
        const created = makeRawInvoice();
        mockPrisma.invoice.create.mockResolvedValue(created);
        mockPrisma.invoiceLine.create.mockResolvedValue({});

        await caller.invoices.create({
          parentId: PARENT_USER.id,
          dueDate: '2026-04-15',
          lines: [
            { registrationId: null, description: 'Camp ete - Enfant', quantity: 5, unitPrice: 2000 },
          ],
        });

        const createCall = mockPrisma.invoice.create.mock.calls[0][0];
        expect(createCall.data.validatedById).toBeUndefined();
      });
    });

    // -----------------------------------------------------------------------
    // T2 — createFromRegistration remplit createdById = ctx.user.id
    // -----------------------------------------------------------------------
    describe('createFromRegistration sets createdById', () => {
      const mockRegistration = {
        id: REG_ID,
        parentId: PARENT_USER.id,
        campId: CAMP_ID,
        childId: CHILD_ID,
        status: 'CONFIRMED',
        paymentStatus: 'UNPAID',
        deletedAt: null,
        camp: {
          name: 'Camp Ete 2026',
          startDate: new Date('2026-07-01'),
          endDate: new Date('2026-07-05'),
          pricePerDay: 2000,
          campType: { accountingCode: '706000' },
        },
        child: { firstName: 'Marie', lastName: 'Dupont' },
      };

      it('passes createdById = ctx.user.id to invoice.create', async () => {
        ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
        mockPrisma.registration.findFirst.mockResolvedValue(mockRegistration);
        mockPrisma.invoiceLine.findFirst.mockResolvedValue(null);
        const created = makeRawInvoice();
        mockPrisma.invoice.create.mockResolvedValue(created);
        mockPrisma.invoiceLine.create.mockResolvedValue({});

        await caller.invoices.createFromRegistration({ registrationId: REG_ID });

        const createCall = mockPrisma.invoice.create.mock.calls[0][0];
        expect(createCall.data.createdById).toBe(STAFF_USER.id);
      });
    });

    // -----------------------------------------------------------------------
    // T3 — validate remplit validatedById et ne touche pas createdById
    // -----------------------------------------------------------------------
    describe('validate sets validatedById and does not overwrite createdById', () => {
      it('passes validatedById = ctx.user.id to invoice.update', async () => {
        ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
        mockPrisma.invoice.findFirst.mockResolvedValue(makeRawInvoice({ status: 'DRAFT' }));
        mockPrisma.invoice.update.mockResolvedValue(makeRawInvoice({ status: 'SENT' }));
        mockPrisma.invoice.findUniqueOrThrow.mockResolvedValue({
          ...makeRawInvoice({ status: 'SENT' }),
          lines: [],
        });

        await caller.invoices.validate({ id: INVOICE_ID });

        const updateCall = mockPrisma.invoice.update.mock.calls[0][0];
        expect(updateCall.data.validatedById).toBe(STAFF_USER.id);
      });

      it('does not set createdById in the validate update call', async () => {
        ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
        mockPrisma.invoice.findFirst.mockResolvedValue(makeRawInvoice({ status: 'DRAFT' }));
        mockPrisma.invoice.update.mockResolvedValue(makeRawInvoice({ status: 'SENT' }));
        mockPrisma.invoice.findUniqueOrThrow.mockResolvedValue({
          ...makeRawInvoice({ status: 'SENT' }),
          lines: [],
        });

        await caller.invoices.validate({ id: INVOICE_ID });

        // createdById MUST NOT appear in the validate update — never overwrite it
        const updateCall = mockPrisma.invoice.update.mock.calls[0][0];
        expect(updateCall.data.createdById).toBeUndefined();
      });
    });

    // -----------------------------------------------------------------------
    // T4 — getById : STAFF reçoit creatorName/validatorName renseignés
    // -----------------------------------------------------------------------
    describe('getById role-gating', () => {
      it('returns creatorName and validatorName for STAFF', async () => {
        ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
        mockPrisma.invoice.findFirst.mockResolvedValue(
          makeInvoiceRow({
            creator: { id: STAFF_USER.id, name: 'Test Staff' },
            validator: { id: ADMIN_USER.id, name: 'Test Admin' },
          }),
        );

        const result = await caller.invoices.getById({ id: INVOICE_ID });

        expect(result).not.toBeNull();
        expect(result!.creatorName).toBe('Test Staff');
        expect(result!.validatorName).toBe('Test Admin');
      });

      it('returns creatorName and validatorName for ADMIN', async () => {
        ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
        mockPrisma.invoice.findFirst.mockResolvedValue(
          makeInvoiceRow({
            creator: { id: STAFF_USER.id, name: 'Test Staff' },
            validator: null,
          }),
        );

        const result = await caller.invoices.getById({ id: INVOICE_ID });

        expect(result).not.toBeNull();
        expect(result!.creatorName).toBe('Test Staff');
        expect(result!.validatorName).toBeNull();
      });

      // R3 — un PARENT reçoit null pour creatorName et validatorName
      it('returns null for creatorName and validatorName for PARENT (R3 non-exposition)', async () => {
        ({ caller, mockPrisma } = createTestCaller(PARENT_USER));
        mockPrisma.invoice.findFirst.mockResolvedValue(
          makeInvoiceRow({
            // Meme si la BDD retourne des données creator/validator,
            // le mapping les nullifie pour les PARENT
            creator: { id: STAFF_USER.id, name: 'Test Staff' },
            validator: { id: ADMIN_USER.id, name: 'Test Admin' },
          }),
        );

        const result = await caller.invoices.getById({ id: INVOICE_ID });

        expect(result).not.toBeNull();
        // Preuve du role-gating : null pour PARENT quelles que soient les données BDD
        expect(result!.creatorName).toBeNull();
        expect(result!.validatorName).toBeNull();
      });
    });

    // -----------------------------------------------------------------------
    // T5 — select whitelist : pas de champ sensible dans invoiceInclude
    // -----------------------------------------------------------------------
    describe('invoiceInclude select whitelist (no sensitive fields)', () => {
      it('getById select does not expose email, role or tokens on creator/validator', async () => {
        ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
        mockPrisma.invoice.findFirst.mockResolvedValue(null);

        await caller.invoices.getById({ id: INVOICE_ID });

        const findFirstCall = mockPrisma.invoice.findFirst.mock.calls[0][0];

        // creator select doit contenir uniquement id et name
        expect(findFirstCall.include.creator.select).toEqual({ id: true, name: true });
        expect(findFirstCall.include.creator.select).not.toHaveProperty('email');
        expect(findFirstCall.include.creator.select).not.toHaveProperty('role');
        expect(findFirstCall.include.creator.select).not.toHaveProperty('hashedPassword');

        // validator select idem
        expect(findFirstCall.include.validator.select).toEqual({ id: true, name: true });
        expect(findFirstCall.include.validator.select).not.toHaveProperty('email');
        expect(findFirstCall.include.validator.select).not.toHaveProperty('role');
        expect(findFirstCall.include.validator.select).not.toHaveProperty('hashedPassword');
      });
    });
  });

  // =========================================================================
  // updateStatus
  // =========================================================================

  describe('updateStatus', () => {
    describe('access control', () => {
      it('rejects unauthenticated users', async () => {
        const { caller: anonCaller } = createTestCaller(null);
        await expect(
          anonCaller.invoices.updateStatus({ id: INVOICE_ID, status: 'PAID', version: 0 }),
        ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      });

      it('rejects PARENT role', async () => {
        const { caller: parentCaller } = createTestCaller(PARENT_USER);
        await expect(
          parentCaller.invoices.updateStatus({ id: INVOICE_ID, status: 'PAID', version: 0 }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      });

      it('allows ADMIN role', async () => {
        ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
        mockPrisma.invoice.findFirst.mockResolvedValue(
          makeRawInvoice({ status: 'SENT' }),
        );
        mockPrisma.invoice.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.invoice.findUniqueOrThrow.mockResolvedValue(
          makeRawInvoice({ status: 'PAID', version: 1 }),
        );

        const result = await caller.invoices.updateStatus({
          id: INVOICE_ID,
          status: 'PAID',
          version: 0,
        });
        expect(result.status).toBe('PAID');
      });
    });

    describe('business logic', () => {
      beforeEach(() => {
        ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
      });

      it('updates the status to SENT', async () => {
        mockPrisma.invoice.findFirst.mockResolvedValue(
          makeRawInvoice({ status: 'DRAFT' }),
        );
        mockPrisma.invoice.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.invoice.findUniqueOrThrow.mockResolvedValue(
          makeRawInvoice({ status: 'SENT', version: 1 }),
        );

        const result = await caller.invoices.updateStatus({
          id: INVOICE_ID,
          status: 'SENT',
          version: 0,
        });
        expect(result.status).toBe('SENT');
      });

      it('updates the status to OVERDUE', async () => {
        mockPrisma.invoice.findFirst.mockResolvedValue(
          makeRawInvoice({ status: 'SENT' }),
        );
        mockPrisma.invoice.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.invoice.findUniqueOrThrow.mockResolvedValue(
          makeRawInvoice({ status: 'OVERDUE', version: 1 }),
        );

        const result = await caller.invoices.updateStatus({
          id: INVOICE_ID,
          status: 'OVERDUE',
          version: 0,
        });
        expect(result.status).toBe('OVERDUE');
      });

      it('updates the status to CANCELLED', async () => {
        mockPrisma.invoice.findFirst.mockResolvedValue(
          makeRawInvoice({ status: 'SENT', paidAmount: 0 }),
        );
        mockPrisma.invoice.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.invoice.findUniqueOrThrow.mockResolvedValue(
          makeRawInvoice({ status: 'CANCELLED', version: 1 }),
        );

        const result = await caller.invoices.updateStatus({
          id: INVOICE_ID,
          status: 'CANCELLED',
          version: 0,
        });
        expect(result.status).toBe('CANCELLED');
      });

      it('rejects invalid transition PAID to SENT', async () => {
        mockPrisma.invoice.findFirst.mockResolvedValue(
          makeRawInvoice({ status: 'PAID' }),
        );

        await expect(
          caller.invoices.updateStatus({
            id: INVOICE_ID,
            status: 'SENT',
            version: 0,
          }),
        ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
      });

      it('rejects cancellation of paid invoice', async () => {
        mockPrisma.invoice.findFirst.mockResolvedValue(
          makeRawInvoice({ status: 'SENT', paidAmount: 5000 }),
        );

        await expect(
          caller.invoices.updateStatus({
            id: INVOICE_ID,
            status: 'CANCELLED',
            version: 0,
          }),
        ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
      });

      it('throws CONFLICT on version mismatch', async () => {
        mockPrisma.invoice.findFirst.mockResolvedValue(
          makeRawInvoice({ status: 'DRAFT' }),
        );
        mockPrisma.invoice.updateMany.mockResolvedValue({ count: 0 });

        await expect(
          caller.invoices.updateStatus({
            id: INVOICE_ID,
            status: 'SENT',
            version: 0,
          }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
      });

      it('throws NOT_FOUND when invoice does not exist', async () => {
        mockPrisma.invoice.findFirst.mockResolvedValue(null);

        await expect(
          caller.invoices.updateStatus({
            id: INVOICE_ID,
            status: 'SENT',
            version: 0,
          }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      });
    });

    describe('input validation', () => {
      beforeEach(() => {
        ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
      });

      it('rejects DRAFT as a target status (not in allowed enum)', async () => {
        await expect(
          caller.invoices.updateStatus({ id: INVOICE_ID, status: 'DRAFT' as any, version: 0 }),
        ).rejects.toThrow();
      });

      it('rejects CREDITED as a target status', async () => {
        await expect(
          caller.invoices.updateStatus({ id: INVOICE_ID, status: 'CREDITED' as any, version: 0 }),
        ).rejects.toThrow();
      });

      it('rejects invalid UUID', async () => {
        await expect(
          caller.invoices.updateStatus({ id: 'bad', status: 'PAID', version: 0 }),
        ).rejects.toThrow();
      });

      it('rejects negative version', async () => {
        await expect(
          caller.invoices.updateStatus({ id: INVOICE_ID, status: 'PAID', version: -1 }),
        ).rejects.toThrow();
      });

      it('rejects non-integer version', async () => {
        await expect(
          caller.invoices.updateStatus({ id: INVOICE_ID, status: 'PAID', version: 1.5 }),
        ).rejects.toThrow();
      });
    });
  });

  // =========================================================================
  // delete
  // =========================================================================

  describe('delete', () => {
    describe('access control', () => {
      it('rejects unauthenticated users', async () => {
        const { caller: anonCaller } = createTestCaller(null);
        await expect(
          anonCaller.invoices.delete({ id: INVOICE_ID }),
        ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      });

      it('rejects PARENT role', async () => {
        const { caller: parentCaller } = createTestCaller(PARENT_USER);
        await expect(
          parentCaller.invoices.delete({ id: INVOICE_ID }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      });

    });

    describe('business logic', () => {
      beforeEach(() => {
        ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
      });

      it('throws PRECONDITION_FAILED when invoice has payments', async () => {
        mockPrisma.payment.count.mockResolvedValue(2);

        await expect(
          caller.invoices.delete({ id: INVOICE_ID }),
        ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
      });

      it('soft deletes invoice (sets deletedAt) when no payments exist', async () => {
        mockPrisma.payment.count.mockResolvedValue(0);
        mockPrisma.invoice.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.invoiceLine.findMany.mockResolvedValue([]);

        const result = await caller.invoices.delete({ id: INVOICE_ID });

        expect(result.success).toBe(true);
        const updateCall = mockPrisma.invoice.updateMany.mock.calls[0][0];
        expect(updateCall.where.id).toBe(INVOICE_ID);
        expect(updateCall.where.deletedAt).toBeNull();
        expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
      });

      it('resets registration paymentStatus to UNPAID on delete', async () => {
        const REG_ID_1 = 'r0000000-0000-4000-a000-000000000001';
        const REG_ID_2 = 'r0000000-0000-4000-a000-000000000002';

        mockPrisma.payment.count.mockResolvedValue(0);
        mockPrisma.invoice.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.invoiceLine.findMany.mockResolvedValue([
          { registrationId: REG_ID_1 },
          { registrationId: REG_ID_2 },
        ]);
        mockPrisma.registration.updateMany.mockResolvedValue({ count: 2 });

        const result = await caller.invoices.delete({ id: INVOICE_ID });

        expect(result.success).toBe(true);
        expect(mockPrisma.registration.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              id: { in: [REG_ID_1, REG_ID_2] },
              deletedAt: null,
            }),
            data: { paymentStatus: 'UNPAID' },
          }),
        );
      });

      it('does not update registrations when invoice has no linked lines', async () => {
        mockPrisma.payment.count.mockResolvedValue(0);
        mockPrisma.invoice.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.invoiceLine.findMany.mockResolvedValue([]);

        await caller.invoices.delete({ id: INVOICE_ID });

        expect(mockPrisma.registration.updateMany).not.toHaveBeenCalled();
      });

      it('throws NOT_FOUND when invoice does not exist or already deleted', async () => {
        mockPrisma.payment.count.mockResolvedValue(0);
        mockPrisma.invoice.updateMany.mockResolvedValue({ count: 0 });
        mockPrisma.invoiceLine.findMany.mockResolvedValue([]);

        await expect(
          caller.invoices.delete({ id: INVOICE_ID }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      });
    });
  });

  // =========================================================================
  // generatePDF
  // =========================================================================

  describe('generatePDF', () => {
    it('rejects PARENT users', async () => {
      const { caller: parentCaller } = createTestCaller(PARENT_USER);
      await expect(
        parentCaller.invoices.generatePDF({ id: INVOICE_ID }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('throws NOT_FOUND when invoice is missing', async () => {
      ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));

      await expect(
        caller.invoices.generatePDF({ id: INVOICE_ID }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    describe('payments loading and mapping', () => {
      beforeEach(() => {
        ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
        // findFirst retourne null par défaut → NOT_FOUND
        // Les assertions portent sur le call Prisma, pas sur le PDF généré
      });

      it('queries findFirst with payments select whitelist (amount, paymentDate, paymentMethod.name, creditNote.invoiceNumber)', async () => {
        // Invoice manquante — on vérifie uniquement la shape du query
        mockPrisma.invoice.findFirst.mockResolvedValue(null);

        await expect(
          caller.invoices.generatePDF({ id: INVOICE_ID }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });

        const findFirstCall = mockPrisma.invoice.findFirst.mock.calls[0][0];
        expect(findFirstCall.include).toHaveProperty('payments');
        expect(findFirstCall.include.payments.select).toEqual({
          amount: true,
          paymentDate: true,
          paymentMethod: { select: { name: true } },
          // US-FACT-02 : numéro de l'avoir imputé, pour l'afficher comme mode
          // de règlement sur le PDF. Aucun autre champ de l'avoir n'est exposé.
          creditNote: { select: { invoiceNumber: true } },
        });
      });

      it('includes parent, lines and payments together in the findFirst query', async () => {
        mockPrisma.invoice.findFirst.mockResolvedValue(null);

        await expect(
          caller.invoices.generatePDF({ id: INVOICE_ID }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });

        const findFirstCall = mockPrisma.invoice.findFirst.mock.calls[0][0];
        expect(findFirstCall.include).toHaveProperty('parent');
        expect(findFirstCall.include).toHaveProperty('lines');
        expect(findFirstCall.include).toHaveProperty('payments');
      });

      it('does not expose sensitive fields in the payments select (no id, no invoiceId, no parentId)', async () => {
        mockPrisma.invoice.findFirst.mockResolvedValue(null);

        await expect(
          caller.invoices.generatePDF({ id: INVOICE_ID }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });

        const findFirstCall = mockPrisma.invoice.findFirst.mock.calls[0][0];
        const paymentsSelect = findFirstCall.include.payments.select;
        expect(paymentsSelect).not.toHaveProperty('id');
        expect(paymentsSelect).not.toHaveProperty('invoiceId');
        expect(paymentsSelect).not.toHaveProperty('parentId');
        expect(paymentsSelect).not.toHaveProperty('notes');
      });
    });
  });

  // =========================================================================
  // sendEmail
  // =========================================================================

  describe('sendEmail (TD-008)', () => {
    const PDF_URL = 'https://store.blob.vercel-storage.com/invoices/FAC-2026-0001.pdf';
    let fetchMock: ReturnType<typeof vi.fn>;

    /** Facture complète telle que la lit `generateAndStoreInvoicePdf`. */
    function makeInvoiceForPdf(overrides: Record<string, any> = {}) {
      return {
        // Facture émise par défaut : le cas brouillon (« devis ») a son test.
        ...makeInvoiceRow({ status: 'SENT' }),
        parent: {
          firstName: 'Jean',
          lastName: 'Dupont',
          email: 'jean.dupont@example.nc',
          address: '15 Rue de la Baie',
          city: 'Noumea',
          postalCode: '98800',
        },
        lines: [
          {
            description: 'Camp ete',
            quantity: 1,
            unitPrice: 10000,
            totalPrice: 10000,
          },
        ],
        payments: [],
        ...overrides,
      };
    }

    function arrangeHappyPath(invoice: Record<string, any> = makeInvoiceForPdf()) {
      mockPrisma.invoice.findFirst.mockResolvedValue(invoice);
      mockPrisma.invoice.update.mockResolvedValue({});
      mockPrisma.appSetting.findUnique.mockResolvedValue(null);
      mockPrisma.appSetting.findMany.mockResolvedValue([
        { category: 'organization', key: 'short_name', value: '"ALVM"' },
        { category: 'email', key: 'from_name', value: '"ALVM"' },
        { category: 'email', key: 'from_email', value: '"noreply@alvm.nc"' },
        { category: 'email', key: 'reply_to', value: '"contact@alvm.nc"' },
      ]);
      generateInvoicePDF.mockResolvedValue(Buffer.from('%PDF-facture'));
      uploadToStorage.mockResolvedValue({ pathname: 'invoices/x.pdf', url: PDF_URL });
    }

    /** Corps JSON envoyé au fournisseur d'email. */
    function sentPayload() {
      return JSON.parse(fetchMock.mock.calls[0]![1].body);
    }

    beforeEach(() => {
      ({ caller, mockPrisma } = createTestCaller(ADMIN_USER));
      generateInvoicePDF.mockReset();
      uploadToStorage.mockReset();
      process.env.RESEND_API_KEY = 'resend_test_key';
      fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'email_123' }),
        text: async () => '',
      });
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      delete process.env.RESEND_API_KEY;
    });

    it('rejects PARENT users', async () => {
      const { caller: parentCaller } = createTestCaller(PARENT_USER);
      await expect(
        parentCaller.invoices.sendEmail({ id: INVOICE_ID }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('fails with an explicit precondition error when email is not configured', async () => {
      delete process.env.RESEND_API_KEY;

      await expect(
        caller.invoices.sendEmail({ id: INVOICE_ID }),
      ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

      // Aucun PDF généré, aucun appel réseau : on s'arrête avant.
      expect(generateInvoicePDF).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws NOT_FOUND when the invoice does not exist', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        caller.invoices.sendEmail({ id: INVOICE_ID }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sends the invoice with its PDF attached', async () => {
      arrangeHappyPath();

      const result = await caller.invoices.sendEmail({ id: INVOICE_ID });

      expect(result).toEqual({ success: true, sentTo: 'jean.dupont@example.nc' });
      expect(fetchMock).toHaveBeenCalledOnce();

      const payload = sentPayload();
      expect(payload.to).toEqual(['jean.dupont@example.nc']);
      expect(payload.from).toBe('ALVM <noreply@alvm.nc>');
      expect(payload.reply_to).toBe('contact@alvm.nc');
      expect(payload.subject).toContain('FAC-2026-0001');
      expect(payload.attachments).toHaveLength(1);
      expect(payload.attachments[0].filename).toBe('facture-FAC-2026-0001.pdf');
      expect(Buffer.from(payload.attachments[0].content, 'base64').toString()).toBe(
        '%PDF-facture',
      );
    });

    it('archives the freshly generated PDF on the invoice', async () => {
      arrangeHappyPath();

      await caller.invoices.sendEmail({ id: INVOICE_ID });

      expect(uploadToStorage).toHaveBeenCalledOnce();
      expect(mockPrisma.invoice.update).toHaveBeenCalledWith({
        where: { id: INVOICE_ID },
        data: { pdfUrl: PDF_URL },
      });
    });

    it('announces a quote (devis) while the invoice is still a draft', async () => {
      arrangeHappyPath(makeInvoiceForPdf({ status: 'DRAFT' }));

      await caller.invoices.sendEmail({ id: INVOICE_ID });

      const payload = sentPayload();
      expect(payload.subject).toContain('devis');
      expect(payload.attachments[0].filename).toBe('devis-FAC-2026-0001.pdf');
    });

    it('refuses to send when the client has no email address', async () => {
      arrangeHappyPath(
        makeInvoiceForPdf({
          parent: {
            firstName: 'Jean',
            lastName: 'Dupont',
            email: null,
            address: '15 Rue de la Baie',
            city: 'Noumea',
            postalCode: '98800',
          },
        }),
      );

      await expect(
        caller.invoices.sendEmail({ id: INVOICE_ID }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('surfaces a provider failure as a readable error', async () => {
      arrangeHappyPath();
      fetchMock.mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => 'domain is not verified',
        json: async () => ({}),
      });

      await expect(caller.invoices.sendEmail({ id: INVOICE_ID })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: expect.stringContaining('422'),
      });
    });

    it('allows STAFF to send', async () => {
      ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
      arrangeHappyPath();

      const result = await caller.invoices.sendEmail({ id: INVOICE_ID });

      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // fetchUnpaidRegistrations
  // =========================================================================

  describe('fetchUnpaidRegistrations', () => {
    const parentId = PARENT_USER.id;

    describe('access control', () => {
      it('rejects unauthenticated users', async () => {
        const { caller: anonCaller } = createTestCaller(null);
        await expect(
          anonCaller.invoices.fetchUnpaidRegistrations({ parentId }),
        ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      });

      it('rejects PARENT role', async () => {
        const { caller: parentCaller } = createTestCaller(PARENT_USER);
        await expect(
          parentCaller.invoices.fetchUnpaidRegistrations({ parentId }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      });
    });

    describe('business logic', () => {
      beforeEach(() => {
        ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
      });

      it('returns empty array when no unpaid registrations', async () => {
        mockPrisma.registration.findMany.mockResolvedValue([]);

        const result = await caller.invoices.fetchUnpaidRegistrations({ parentId });
        expect(result.registrations).toEqual([]);
      });

      it('returns mapped registrations with computed totalAmount', async () => {
        const regDate = new Date('2026-06-01');
        mockPrisma.registration.findMany.mockResolvedValue([
          {
            id: REG_ID,
            parentId,
            campId: CAMP_ID,
            childId: CHILD_ID,
            status: 'CONFIRMED',
            paymentStatus: 'UNPAID',
            registrationDate: regDate,
            deletedAt: null,
            camp: {
              id: CAMP_ID,
              name: 'Camp Ete',
              startDate: new Date('2026-07-01'),
              endDate: new Date('2026-07-10'),
              pricePerDay: 1500,
            },
            child: {
              id: CHILD_ID,
              firstName: 'Marie',
              lastName: 'Dupont',
            },
          },
        ]);

        const result = await caller.invoices.fetchUnpaidRegistrations({ parentId });

        expect(result.registrations).toHaveLength(1);
        const reg = result.registrations[0];
        expect(reg.campName).toBe('Camp Ete');
        expect(reg.childFirstName).toBe('Marie');
        expect(reg.childLastName).toBe('Dupont');
        // 10 days (July 1-10 inclusive) * 1500 = 15000
        expect(reg.totalAmount).toBe(15000);
        expect(reg.status).toBe('CONFIRMED');
        expect(reg.paymentStatus).toBe('UNPAID');
      });

      it('filters by CONFIRMED status, UNPAID paymentStatus, and deletedAt null', async () => {
        mockPrisma.registration.findMany.mockResolvedValue([]);

        await caller.invoices.fetchUnpaidRegistrations({ parentId });

        const call = mockPrisma.registration.findMany.mock.calls[0][0];
        expect(call.where.parentId).toBe(parentId);
        expect(call.where.status).toBe('CONFIRMED');
        expect(call.where.paymentStatus).toBe('UNPAID');
        expect(call.where.deletedAt).toBeNull();
      });
    });

    describe('input validation', () => {
      beforeEach(() => {
        ({ caller, mockPrisma } = createTestCaller(STAFF_USER));
      });

      it('rejects invalid parentId', async () => {
        await expect(
          caller.invoices.fetchUnpaidRegistrations({ parentId: 'bad' }),
        ).rejects.toThrow();
      });
    });
  });
});
