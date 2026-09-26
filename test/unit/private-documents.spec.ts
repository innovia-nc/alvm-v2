import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  access: vi.fn(),
  document: vi.fn(),
  invoice: vi.fn(),
  get: vi.fn(),
  pdf: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/server/helpers/child-access.helper', () => ({ hasChildAccess: mocks.access }));
vi.mock('@/server/db', () => ({
  prisma: {
    platformIntegration: { findUnique: vi.fn().mockResolvedValue({ enabled: true, encryptedSecret: null }) },
    appSetting: { findUnique: vi.fn().mockResolvedValue(null) },
    childDocument: { findFirst: mocks.document },
    staffDocument: { findFirst: mocks.document },
    invoice: { findFirst: mocks.invoice },
  },
}));
vi.mock('@vercel/blob', () => ({ get: mocks.get }));
vi.mock('@/server/services/invoice-pdf.service', () => ({ generateAndStoreInvoicePdf: mocks.pdf }));
import { GET } from '@/app/api/documents/[kind]/[id]/route';
const id = '10000000-0000-4000-a000-000000000001';
const request = (kind = 'child') =>
  GET(new Request('http://localhost/api/documents/' + kind + '/' + id), {
    params: Promise.resolve({ kind, id }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('BLOB_PRIVATE_READ_WRITE_TOKEN', 'private-test-token');
  mocks.auth.mockResolvedValue({ user: { id, role: 'PARENT' } });
  mocks.document.mockResolvedValue({
    childId: id,
    fileUrl: 'https://test.private.blob.vercel-storage.com/doc.pdf',
  });
  mocks.access.mockResolvedValue(true);
  mocks.get.mockImplementation(() => ({
    statusCode: 200,
    stream: new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('%PDF-test'));
        c.close();
      },
    }),
  }));
});
describe('authenticated personal document downloads', () => {
  it('refuses anonymous downloads before querying storage', async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await request()).status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('refuses another family and a parent reading staff documents', async () => {
    mocks.access.mockResolvedValue(false);
    expect((await request()).status).toBe(404);
    expect((await request('staff')).status).toBe(404);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('refuses deleted and legacy public documents', async () => {
    mocks.document.mockResolvedValueOnce(null);
    expect((await request()).status).toBe(404);
    mocks.document.mockResolvedValueOnce({
      childId: id,
      fileUrl: 'https://test.public.blob.vercel-storage.com/doc.pdf',
    });
    expect((await request()).status).toBe(409);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('does not send a storage token to a URL imitating the private hostname in its path', async () => {
    mocks.document.mockResolvedValue({
      childId: id,
      fileUrl: 'https://example.com/test.private.blob.vercel-storage.com/doc.pdf',
    });
    expect((await request()).status).toBe(409);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('streams an authorized private document without a reusable link or cache', async () => {
    const r = await request();
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    expect(await r.text()).toBe('%PDF-test');
    expect(mocks.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ access: 'private', useCache: false }),
    );
  });
  it('scopes invoices to the session and regenerates their current contents', async () => {
    mocks.invoice.mockResolvedValue({ id });
    mocks.pdf.mockResolvedValue({ pdfBuffer: Buffer.from('%PDF-current') });
    const r = await request('invoice');
    expect(r.status).toBe(200);
    expect(mocks.invoice).toHaveBeenCalledWith({
      where: { id, deletedAt: null, invoiceType: 'INVOICE', parentId: id },
    });
    expect(mocks.pdf).toHaveBeenCalledWith(expect.anything(), id, false);
  });
});
