/**
 * Router staffDocuments — suppression.
 *
 * Couvre notamment TD-006 : le blob doit être supprimé en même temps que la
 * ligne, sans jamais faire échouer la suppression fonctionnelle.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  createTestCaller,
  ADMIN_USER,
  PARENT_USER,
  type TestCaller,
} from '../helpers/test-caller';

const deleteFromStorageBestEffort = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/storage/blob-storage', () => ({
  uploadToStorage: vi.fn(),
  deleteFromStorage: vi.fn(),
  deleteFromStorageBestEffort: (...args: unknown[]) =>
    deleteFromStorageBestEffort(...args),
}));

const STAFF_ID = 'c0000000-0000-4000-a000-000000000001';
const DOC_ID = 'c0000000-0000-4000-a000-000000000010';
const FILE_URL = 'https://store.blob.vercel-storage.com/staff-documents/contrat.pdf';

const now = new Date('2025-06-15T10:00:00Z');

function makeDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC_ID,
    staffId: STAFF_ID,
    filename: 'contrat-abc123.pdf',
    originalFilename: 'contrat.pdf',
    fileUrl: FILE_URL,
    mimeType: 'application/pdf',
    fileSize: 4096,
    description: 'Contrat 2025',
    uploadedBy: ADMIN_USER.id,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

describe('staffDocuments router — delete', () => {
  let admin: TestCaller;

  beforeEach(() => {
    admin = createTestCaller(ADMIN_USER);
    deleteFromStorageBestEffort.mockClear();
    deleteFromStorageBestEffort.mockResolvedValue(true);
  });

  it('should deny unauthenticated access', async () => {
    const { caller } = createTestCaller(null);
    await expect(
      caller.staffDocuments.delete({ documentId: DOC_ID }),
    ).rejects.toThrow(TRPCError);
  });

  it('should deny PARENT access', async () => {
    const parent = createTestCaller(PARENT_USER);
    parent.mockPrisma.staffDocument.findFirst.mockResolvedValue(makeDocument());

    await expect(
      parent.caller.staffDocuments.delete({ documentId: DOC_ID }),
    ).rejects.toThrow('Accès réservé au personnel');
  });

  it('should soft-delete the row and delete the blob (TD-006)', async () => {
    admin.mockPrisma.staffDocument.findFirst.mockResolvedValue(makeDocument());
    admin.mockPrisma.staffMember.findFirst.mockResolvedValue({ userId: STAFF_ID });
    admin.mockPrisma.staffDocument.update.mockResolvedValue(
      makeDocument({ deletedAt: new Date() }),
    );

    const result = await admin.caller.staffDocuments.delete({ documentId: DOC_ID });

    expect(result.success).toBe(true);
    expect(admin.mockPrisma.staffDocument.update).toHaveBeenCalledWith({
      where: { id: DOC_ID },
      data: { deletedAt: expect.any(Date) },
    });
    expect(deleteFromStorageBestEffort).toHaveBeenCalledWith(FILE_URL, expect.any(String));
  });

  it('should still succeed when the blob store fails', async () => {
    admin.mockPrisma.staffDocument.findFirst.mockResolvedValue(makeDocument());
    admin.mockPrisma.staffMember.findFirst.mockResolvedValue({ userId: STAFF_ID });
    admin.mockPrisma.staffDocument.update.mockResolvedValue(
      makeDocument({ deletedAt: new Date() }),
    );
    deleteFromStorageBestEffort.mockResolvedValue(false);

    const result = await admin.caller.staffDocuments.delete({ documentId: DOC_ID });

    expect(result.success).toBe(true);
  });

  it('should not touch the blob store when the document is not found', async () => {
    admin.mockPrisma.staffDocument.findFirst.mockResolvedValue(null);

    await expect(
      admin.caller.staffDocuments.delete({ documentId: DOC_ID }),
    ).rejects.toThrow('Document non trouvé');

    expect(deleteFromStorageBestEffort).not.toHaveBeenCalled();
  });
});
