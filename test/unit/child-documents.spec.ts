import { describe, it, expect, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  createTestCaller,
  ADMIN_USER,
  STAFF_USER,
  PARENT_USER,
  type TestCaller,
} from '../helpers/test-caller';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CHILD_ID = 'b0000000-0000-4000-a000-000000000001';
const CHILD_ID_OTHER = 'b0000000-0000-4000-a000-000000000002';
const DOC_ID_1 = 'b0000000-0000-4000-a000-000000000010';
const DOC_ID_2 = 'b0000000-0000-4000-a000-000000000011';
const UPLOADER_ID = 'b0000000-0000-4000-a000-000000000020';

const now = new Date('2025-06-15T10:00:00Z');

function makeDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC_ID_1,
    childId: CHILD_ID,
    filename: 'document-abc123.pdf',
    originalFilename: 'certificat-medical.pdf',
    fileUrl: 'https://example.com/doc.pdf',
    mimeType: 'application/pdf',
    fileSize: 12345,
    description: 'Certificat medical 2025',
    uploadedBy: UPLOADER_ID,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeChildRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: CHILD_ID,
    deletedAt: null,
    ...overrides,
  };
}

function makeParentLink(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b0000000-0000-4000-a000-000000000030',
    childId: CHILD_ID,
    parentId: PARENT_USER.id,
    isPrimary: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('childDocuments router', () => {
  let admin: TestCaller;
  let staff: TestCaller;
  let parent: TestCaller;

  beforeEach(() => {
    admin = createTestCaller(ADMIN_USER);
    staff = createTestCaller(STAFF_USER);
    parent = createTestCaller(PARENT_USER);
  });

  // =========================================================================
  // list
  // =========================================================================

  describe('list', () => {
    it('should deny unauthenticated access', async () => {
      const { caller } = createTestCaller(null);
      await expect(
        caller.childDocuments.list({ childId: CHILD_ID }),
      ).rejects.toThrow(TRPCError);
    });

    it('should return documents for ADMIN', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChildRecord());
      admin.mockPrisma.childDocument.findMany.mockResolvedValue([
        makeDocument(),
        makeDocument({ id: DOC_ID_2, originalFilename: 'attestation.pdf' }),
      ]);

      const result = await admin.caller.childDocuments.list({ childId: CHILD_ID });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(DOC_ID_1);
      expect(result[0].originalFilename).toBe('certificat-medical.pdf');
      expect(result[1].id).toBe(DOC_ID_2);
    });

    it('should return documents for STAFF', async () => {
      staff.mockPrisma.child.findFirst.mockResolvedValue(makeChildRecord());
      staff.mockPrisma.childDocument.findMany.mockResolvedValue([makeDocument()]);

      const result = await staff.caller.childDocuments.list({ childId: CHILD_ID });

      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe('document-abc123.pdf');
    });

    it('should return documents for PARENT with access (via childParent link)', async () => {
      parent.mockPrisma.childParent.findFirst.mockResolvedValue(makeParentLink());
      parent.mockPrisma.childDocument.findMany.mockResolvedValue([makeDocument()]);

      const result = await parent.caller.childDocuments.list({ childId: CHILD_ID });

      expect(result).toHaveLength(1);
      // Verify assertChildAccess used childParent.findFirst for PARENT role
      expect(parent.mockPrisma.childParent.findFirst).toHaveBeenCalledWith({
        where: {
          parentId: PARENT_USER.id,
          childId: CHILD_ID,
          child: { deletedAt: null },
        },
      });
    });

    it('should throw NOT_FOUND for PARENT without access', async () => {
      parent.mockPrisma.childParent.findFirst.mockResolvedValue(null);

      await expect(
        parent.caller.childDocuments.list({ childId: CHILD_ID }),
      ).rejects.toThrow('Enfant non trouve ou acces refuse');
    });

    it('should throw NOT_FOUND for ADMIN when child does not exist', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(null);

      await expect(
        admin.caller.childDocuments.list({ childId: CHILD_ID }),
      ).rejects.toThrow('Enfant non trouve');
    });

    it('should throw NOT_FOUND for STAFF when child does not exist', async () => {
      staff.mockPrisma.child.findFirst.mockResolvedValue(null);

      await expect(
        staff.caller.childDocuments.list({ childId: CHILD_ID }),
      ).rejects.toThrow('Enfant non trouve');
    });

    it('should return empty array when no documents exist', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChildRecord());
      admin.mockPrisma.childDocument.findMany.mockResolvedValue([]);

      const result = await admin.caller.childDocuments.list({ childId: CHILD_ID });

      expect(result).toHaveLength(0);
    });

    it('should only return non-deleted documents', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChildRecord());
      admin.mockPrisma.childDocument.findMany.mockResolvedValue([makeDocument()]);

      await admin.caller.childDocuments.list({ childId: CHILD_ID });

      const findManyCall = admin.mockPrisma.childDocument.findMany.mock.calls[0][0];
      expect(findManyCall.where.deletedAt).toBeNull();
    });

    it('should order documents by createdAt desc', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChildRecord());
      admin.mockPrisma.childDocument.findMany.mockResolvedValue([]);

      await admin.caller.childDocuments.list({ childId: CHILD_ID });

      const findManyCall = admin.mockPrisma.childDocument.findMany.mock.calls[0][0];
      expect(findManyCall.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('should map all fields correctly', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChildRecord());
      admin.mockPrisma.childDocument.findMany.mockResolvedValue([makeDocument()]);

      const result = await admin.caller.childDocuments.list({ childId: CHILD_ID });

      const doc = result[0];
      expect(doc.id).toBe(DOC_ID_1);
      expect(doc.childId).toBe(CHILD_ID);
      expect(doc.filename).toBe('document-abc123.pdf');
      expect(doc.originalFilename).toBe('certificat-medical.pdf');
      expect(doc.fileUrl).toBe('https://example.com/doc.pdf');
      expect(doc.mimeType).toBe('application/pdf');
      expect(doc.fileSize).toBe(12345);
      expect(doc.description).toBe('Certificat medical 2025');
      expect(doc.uploadedBy).toBe(UPLOADER_ID);
      expect(doc.createdAt).toEqual(now);
      expect(doc.updatedAt).toEqual(now);
    });

    it('should handle document with null description', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChildRecord());
      admin.mockPrisma.childDocument.findMany.mockResolvedValue([
        makeDocument({ description: null }),
      ]);

      const result = await admin.caller.childDocuments.list({ childId: CHILD_ID });

      expect(result[0].description).toBeNull();
    });

    it('should check access via child.findFirst for ADMIN/STAFF roles', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChildRecord());
      admin.mockPrisma.childDocument.findMany.mockResolvedValue([]);

      await admin.caller.childDocuments.list({ childId: CHILD_ID });

      expect(admin.mockPrisma.child.findFirst).toHaveBeenCalledWith({
        where: { id: CHILD_ID, deletedAt: null },
        select: { id: true },
      });
    });
  });

  // =========================================================================
  // getById
  // =========================================================================

  describe('getById', () => {
    it('should deny unauthenticated access', async () => {
      const { caller } = createTestCaller(null);
      await expect(
        caller.childDocuments.getById({ id: DOC_ID_1 }),
      ).rejects.toThrow(TRPCError);
    });

    it('should return document for ADMIN', async () => {
      admin.mockPrisma.childDocument.findFirst.mockResolvedValue(makeDocument());
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChildRecord());

      const result = await admin.caller.childDocuments.getById({ id: DOC_ID_1 });

      expect(result).not.toBeNull();
      expect(result!.id).toBe(DOC_ID_1);
      expect(result!.originalFilename).toBe('certificat-medical.pdf');
    });

    it('should return document for STAFF', async () => {
      staff.mockPrisma.childDocument.findFirst.mockResolvedValue(makeDocument());
      staff.mockPrisma.child.findFirst.mockResolvedValue(makeChildRecord());

      const result = await staff.caller.childDocuments.getById({ id: DOC_ID_1 });

      expect(result).not.toBeNull();
      expect(result!.id).toBe(DOC_ID_1);
    });

    it('should return document for PARENT with access', async () => {
      parent.mockPrisma.childDocument.findFirst.mockResolvedValue(makeDocument());
      parent.mockPrisma.childParent.findFirst.mockResolvedValue(makeParentLink());

      const result = await parent.caller.childDocuments.getById({ id: DOC_ID_1 });

      expect(result).not.toBeNull();
      expect(result!.id).toBe(DOC_ID_1);
    });

    it('should throw NOT_FOUND for PARENT without access to child', async () => {
      parent.mockPrisma.childDocument.findFirst.mockResolvedValue(
        makeDocument({ childId: CHILD_ID_OTHER }),
      );
      parent.mockPrisma.childParent.findFirst.mockResolvedValue(null);

      await expect(
        parent.caller.childDocuments.getById({ id: DOC_ID_1 }),
      ).rejects.toThrow('Enfant non trouve ou acces refuse');
    });

    it('should return null when document does not exist', async () => {
      admin.mockPrisma.childDocument.findFirst.mockResolvedValue(null);

      const result = await admin.caller.childDocuments.getById({ id: DOC_ID_1 });

      expect(result).toBeNull();
    });

    it('should check child access after finding the document', async () => {
      admin.mockPrisma.childDocument.findFirst.mockResolvedValue(makeDocument());
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChildRecord());

      await admin.caller.childDocuments.getById({ id: DOC_ID_1 });

      // First call is childDocument.findFirst, then child.findFirst for access check
      expect(admin.mockPrisma.childDocument.findFirst).toHaveBeenCalledTimes(1);
      expect(admin.mockPrisma.child.findFirst).toHaveBeenCalledWith({
        where: { id: CHILD_ID, deletedAt: null },
        select: { id: true },
      });
    });

    it('should return null and not check access when doc is deleted (findFirst returns null)', async () => {
      admin.mockPrisma.childDocument.findFirst.mockResolvedValue(null);

      const result = await admin.caller.childDocuments.getById({ id: DOC_ID_1 });

      expect(result).toBeNull();
      // assertChildAccess should NOT be called since doc was not found
      expect(admin.mockPrisma.child.findFirst).not.toHaveBeenCalled();
    });

    it('should map all document fields in the response', async () => {
      admin.mockPrisma.childDocument.findFirst.mockResolvedValue(makeDocument());
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChildRecord());

      const result = await admin.caller.childDocuments.getById({ id: DOC_ID_1 });

      expect(result).not.toBeNull();
      expect(result!.id).toBe(DOC_ID_1);
      expect(result!.childId).toBe(CHILD_ID);
      expect(result!.filename).toBe('document-abc123.pdf');
      expect(result!.originalFilename).toBe('certificat-medical.pdf');
      expect(result!.fileUrl).toBe('https://example.com/doc.pdf');
      expect(result!.mimeType).toBe('application/pdf');
      expect(result!.fileSize).toBe(12345);
      expect(result!.description).toBe('Certificat medical 2025');
      expect(result!.uploadedBy).toBe(UPLOADER_ID);
    });

    it('should throw NOT_FOUND for ADMIN when child of document is deleted', async () => {
      admin.mockPrisma.childDocument.findFirst.mockResolvedValue(makeDocument());
      admin.mockPrisma.child.findFirst.mockResolvedValue(null);

      await expect(
        admin.caller.childDocuments.getById({ id: DOC_ID_1 }),
      ).rejects.toThrow('Enfant non trouve');
    });
  });

  // =========================================================================
  // delete
  // =========================================================================

  describe('delete', () => {
    it('should deny unauthenticated access', async () => {
      const { caller } = createTestCaller(null);
      await expect(
        caller.childDocuments.delete({ documentId: DOC_ID_1 }),
      ).rejects.toThrow(TRPCError);
    });

    it('should soft-delete a document for ADMIN', async () => {
      admin.mockPrisma.childDocument.findFirst.mockResolvedValue(makeDocument());
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChildRecord());
      admin.mockPrisma.childDocument.update.mockResolvedValue(
        makeDocument({ deletedAt: new Date() }),
      );

      const result = await admin.caller.childDocuments.delete({ documentId: DOC_ID_1 });

      expect(result.success).toBe(true);
      expect(admin.mockPrisma.childDocument.update).toHaveBeenCalledWith({
        where: { id: DOC_ID_1 },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('should soft-delete a document for STAFF', async () => {
      staff.mockPrisma.childDocument.findFirst.mockResolvedValue(makeDocument());
      staff.mockPrisma.child.findFirst.mockResolvedValue(makeChildRecord());
      staff.mockPrisma.childDocument.update.mockResolvedValue(
        makeDocument({ deletedAt: new Date() }),
      );

      const result = await staff.caller.childDocuments.delete({ documentId: DOC_ID_1 });

      expect(result.success).toBe(true);
    });

    it('should allow PARENT with access to delete a document', async () => {
      parent.mockPrisma.childDocument.findFirst.mockResolvedValue(makeDocument());
      parent.mockPrisma.childParent.findFirst.mockResolvedValue(makeParentLink());
      parent.mockPrisma.childDocument.update.mockResolvedValue(
        makeDocument({ deletedAt: new Date() }),
      );

      const result = await parent.caller.childDocuments.delete({ documentId: DOC_ID_1 });

      expect(result.success).toBe(true);
    });

    it('should throw NOT_FOUND for PARENT without access', async () => {
      parent.mockPrisma.childDocument.findFirst.mockResolvedValue(
        makeDocument({ childId: CHILD_ID_OTHER }),
      );
      parent.mockPrisma.childParent.findFirst.mockResolvedValue(null);

      await expect(
        parent.caller.childDocuments.delete({ documentId: DOC_ID_1 }),
      ).rejects.toThrow('Enfant non trouve ou acces refuse');
    });

    it('should throw NOT_FOUND when document does not exist', async () => {
      admin.mockPrisma.childDocument.findFirst.mockResolvedValue(null);

      await expect(
        admin.caller.childDocuments.delete({ documentId: DOC_ID_1 }),
      ).rejects.toThrow('Document non trouve ou deja supprime');
    });

    it('should throw NOT_FOUND when document is already soft-deleted', async () => {
      // findFirst with deletedAt: null will return null for already-deleted docs
      admin.mockPrisma.childDocument.findFirst.mockResolvedValue(null);

      await expect(
        admin.caller.childDocuments.delete({ documentId: DOC_ID_1 }),
      ).rejects.toThrow('Document non trouve ou deja supprime');
    });

    it('should throw NOT_FOUND for ADMIN when child of document does not exist', async () => {
      admin.mockPrisma.childDocument.findFirst.mockResolvedValue(makeDocument());
      admin.mockPrisma.child.findFirst.mockResolvedValue(null); // child deleted

      await expect(
        admin.caller.childDocuments.delete({ documentId: DOC_ID_1 }),
      ).rejects.toThrow('Enfant non trouve');
    });

    it('should check child access before performing the delete', async () => {
      admin.mockPrisma.childDocument.findFirst.mockResolvedValue(makeDocument());
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChildRecord());
      admin.mockPrisma.childDocument.update.mockResolvedValue(
        makeDocument({ deletedAt: new Date() }),
      );

      await admin.caller.childDocuments.delete({ documentId: DOC_ID_1 });

      // assertChildAccess should have been called
      expect(admin.mockPrisma.child.findFirst).toHaveBeenCalledWith({
        where: { id: CHILD_ID, deletedAt: null },
        select: { id: true },
      });
    });

    it('should use the document childId for access check', async () => {
      const docForOtherChild = makeDocument({ childId: CHILD_ID_OTHER });
      admin.mockPrisma.childDocument.findFirst.mockResolvedValue(docForOtherChild);
      admin.mockPrisma.child.findFirst.mockResolvedValue(
        makeChildRecord({ id: CHILD_ID_OTHER }),
      );
      admin.mockPrisma.childDocument.update.mockResolvedValue(
        makeDocument({ deletedAt: new Date() }),
      );

      await admin.caller.childDocuments.delete({ documentId: DOC_ID_1 });

      expect(admin.mockPrisma.child.findFirst).toHaveBeenCalledWith({
        where: { id: CHILD_ID_OTHER, deletedAt: null },
        select: { id: true },
      });
    });
  });

  // =========================================================================
  // count
  // =========================================================================

  describe('count', () => {
    it('should deny unauthenticated access', async () => {
      const { caller } = createTestCaller(null);
      await expect(
        caller.childDocuments.count({ childId: CHILD_ID }),
      ).rejects.toThrow(TRPCError);
    });

    it('should return document count for ADMIN', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChildRecord());
      admin.mockPrisma.childDocument.count.mockResolvedValue(5);

      const result = await admin.caller.childDocuments.count({ childId: CHILD_ID });

      expect(result).toBe(5);
    });

    it('should return document count for STAFF', async () => {
      staff.mockPrisma.child.findFirst.mockResolvedValue(makeChildRecord());
      staff.mockPrisma.childDocument.count.mockResolvedValue(3);

      const result = await staff.caller.childDocuments.count({ childId: CHILD_ID });

      expect(result).toBe(3);
    });

    it('should return document count for PARENT with access', async () => {
      parent.mockPrisma.childParent.findFirst.mockResolvedValue(makeParentLink());
      parent.mockPrisma.childDocument.count.mockResolvedValue(2);

      const result = await parent.caller.childDocuments.count({ childId: CHILD_ID });

      expect(result).toBe(2);
    });

    it('should throw NOT_FOUND for PARENT without access', async () => {
      parent.mockPrisma.childParent.findFirst.mockResolvedValue(null);

      await expect(
        parent.caller.childDocuments.count({ childId: CHILD_ID }),
      ).rejects.toThrow('Enfant non trouve ou acces refuse');
    });

    it('should throw NOT_FOUND for ADMIN when child does not exist', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(null);

      await expect(
        admin.caller.childDocuments.count({ childId: CHILD_ID }),
      ).rejects.toThrow('Enfant non trouve');
    });

    it('should return zero when no documents exist', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChildRecord());
      admin.mockPrisma.childDocument.count.mockResolvedValue(0);

      const result = await admin.caller.childDocuments.count({ childId: CHILD_ID });

      expect(result).toBe(0);
    });

    it('should count only non-deleted documents', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChildRecord());
      admin.mockPrisma.childDocument.count.mockResolvedValue(3);

      await admin.caller.childDocuments.count({ childId: CHILD_ID });

      const countCall = admin.mockPrisma.childDocument.count.mock.calls[0][0];
      expect(countCall.where.deletedAt).toBeNull();
    });

    it('should count documents for the specified childId', async () => {
      admin.mockPrisma.child.findFirst.mockResolvedValue(makeChildRecord());
      admin.mockPrisma.childDocument.count.mockResolvedValue(3);

      await admin.caller.childDocuments.count({ childId: CHILD_ID });

      const countCall = admin.mockPrisma.childDocument.count.mock.calls[0][0];
      expect(countCall.where.childId).toBe(CHILD_ID);
    });

    it('should check child access via childParent for PARENT role', async () => {
      parent.mockPrisma.childParent.findFirst.mockResolvedValue(makeParentLink());
      parent.mockPrisma.childDocument.count.mockResolvedValue(1);

      await parent.caller.childDocuments.count({ childId: CHILD_ID });

      expect(parent.mockPrisma.childParent.findFirst).toHaveBeenCalledWith({
        where: {
          parentId: PARENT_USER.id,
          childId: CHILD_ID,
          child: { deletedAt: null },
        },
      });
    });
  });
});
