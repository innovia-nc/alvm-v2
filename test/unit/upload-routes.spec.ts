/**
 * Routes de televersement (TD-025).
 *
 * Trois appels du navigateur n'avaient aucune route en face : le logo de
 * l'association et les documents PDF d'un enfant etaient impossibles a
 * televerser. Ces tests couvrent l'authentification, l'habilitation, la
 * validation du fichier et les deux garde-fous ajoutes :
 * - le nom du blob du logo est unique (sinon `settings.setLogoUrl` supprime
 *   le fichier qui vient d'etre televerse) ;
 * - un echec d'ecriture en base annule le blob deja televerse.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
const uploadToStorage = vi.fn();
const deleteFromStorageBestEffort = vi.fn();
const appSettingFindUnique = vi.fn();
const childDocumentCreate = vi.fn();
const childFindFirst = vi.fn();
const childParentFindFirst = vi.fn();
const staffFindFirst = vi.fn();
const staffDocumentCreate = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));

vi.mock('@/lib/storage/blob-storage', () => ({
  uploadToStorage: (...args: unknown[]) => uploadToStorage(...args),
  deleteFromStorageBestEffort: (...args: unknown[]) =>
    deleteFromStorageBestEffort(...args),
}));

vi.mock('@/server/db', () => ({
  prisma: {
    appSetting: { findUnique: (...a: unknown[]) => appSettingFindUnique(...a) },
    staffMember: { findFirst: (...a: unknown[]) => staffFindFirst(...a) },
    staffDocument: { create: (...a: unknown[]) => staffDocumentCreate(...a) },
    childDocument: { create: (...a: unknown[]) => childDocumentCreate(...a) },
    child: { findFirst: (...a: unknown[]) => childFindFirst(...a) },
    childParent: { findFirst: (...a: unknown[]) => childParentFindFirst(...a) },
  },
}));

import { POST as logoPost, DELETE as logoDelete } from '@/app/api/upload/logo/route';
import { POST as documentPost } from '@/app/api/upload/child-documents/route';
import { POST as staffPost } from '@/app/api/upload/staff-documents/route';

const ADMIN = { user: { id: 'a0000000-0000-4000-a000-000000000001', role: 'ADMIN' } };
const PARENT = { user: { id: 'a0000000-0000-4000-a000-000000000003', role: 'PARENT' } };
const CHILD_ID = 'c0000000-0000-4000-a000-000000000001';

function pngFile(size = 128) {
  return new File([new Uint8Array(size)], 'logo.png', { type: 'image/png' });
}

function pdfFile(size = 1024, name = 'certificat.pdf') {
  return new File([new Uint8Array(size)], name, { type: 'application/pdf' });
}

function postRequest(formData: FormData) {
  return new Request('http://localhost/api/upload', {
    method: 'POST',
    body: formData,
  }) as any;
}

function deleteRequest(body: unknown) {
  return new Request('http://localhost/api/upload/logo', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  uploadToStorage.mockResolvedValue({
    pathname: 'organization/logo.png',
    url: 'https://blob.vercel-storage.com/organization/logo.png',
  });
  deleteFromStorageBestEffort.mockResolvedValue(true);
});

describe('POST /api/upload/logo', () => {
  it('refuse un visiteur non authentifié', async () => {
    authMock.mockResolvedValue(null);
    const form = new FormData();
    form.append('file', pngFile());

    const res = await logoPost(postRequest(form));

    expect(res.status).toBe(401);
    expect(uploadToStorage).not.toHaveBeenCalled();
  });

  it('refuse un PARENT (logo = réglage ADMIN)', async () => {
    authMock.mockResolvedValue(PARENT);
    const form = new FormData();
    form.append('file', pngFile());

    const res = await logoPost(postRequest(form));

    expect(res.status).toBe(403);
    expect(uploadToStorage).not.toHaveBeenCalled();
  });

  it('refuse un format non autorisé', async () => {
    authMock.mockResolvedValue(ADMIN);
    const form = new FormData();
    form.append('file', new File(['x'], 'virus.exe', { type: 'application/octet-stream' }));

    const res = await logoPost(postRequest(form));

    expect(res.status).toBe(400);
    expect(uploadToStorage).not.toHaveBeenCalled();
  });

  it('refuse un fichier au-delà de 2 Mo', async () => {
    authMock.mockResolvedValue(ADMIN);
    const form = new FormData();
    form.append('file', pngFile(2 * 1024 * 1024 + 1));

    const res = await logoPost(postRequest(form));

    expect(res.status).toBe(400);
    expect(uploadToStorage).not.toHaveBeenCalled();
  });

  it('téléverse et retourne l’URL du blob', async () => {
    authMock.mockResolvedValue(ADMIN);
    const form = new FormData();
    form.append('file', pngFile());

    const res = await logoPost(postRequest(form));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      url: 'https://blob.vercel-storage.com/organization/logo.png',
    });
    expect(uploadToStorage).toHaveBeenCalledWith(expect.any(Buffer), {
      pathname: expect.stringMatching(/^organization\/logo-[0-9a-f-]{36}\.png$/),
      contentType: 'image/png',
    });
  });

  it('donne un nom de blob différent à chaque téléversement', async () => {
    authMock.mockResolvedValue(ADMIN);

    for (let i = 0; i < 2; i++) {
      const form = new FormData();
      form.append('file', pngFile());
      await logoPost(postRequest(form));
    }

    // Sans cette unicité, `settings.setLogoUrl` supprimerait le blob précédent
    // — qui serait le nouveau, à URL identique (TD-006).
    const pathnames = uploadToStorage.mock.calls.map((c: any[]) => c[1].pathname);
    expect(new Set(pathnames).size).toBe(2);
  });

  it('répond 500 si le store est injoignable', async () => {
    authMock.mockResolvedValue(ADMIN);
    uploadToStorage.mockRejectedValue(new Error('BLOB_READ_WRITE_TOKEN absent'));
    const form = new FormData();
    form.append('file', pngFile());

    const res = await logoPost(postRequest(form));

    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/upload/logo', () => {
  it('refuse un PARENT', async () => {
    authMock.mockResolvedValue(PARENT);

    const res = await logoDelete(deleteRequest({ url: 'https://blob/x.png' }));

    expect(res.status).toBe(403);
    expect(deleteFromStorageBestEffort).not.toHaveBeenCalled();
  });

  it('refuse une URL qui n’est pas le logo enregistré', async () => {
    authMock.mockResolvedValue(ADMIN);
    appSettingFindUnique.mockResolvedValue({
      value: JSON.stringify('https://blob/organization/logo-1.png'),
    });

    const res = await logoDelete(
      deleteRequest({ url: 'https://blob/invoices/FA-2026-0001.pdf' }),
    );

    expect(res.status).toBe(400);
    expect(deleteFromStorageBestEffort).not.toHaveBeenCalled();
  });

  it('supprime le blob du logo enregistré', async () => {
    authMock.mockResolvedValue(ADMIN);
    appSettingFindUnique.mockResolvedValue({
      value: JSON.stringify('https://blob/organization/logo-1.png'),
    });

    const res = await logoDelete(
      deleteRequest({ url: 'https://blob/organization/logo-1.png' }),
    );

    expect(res.status).toBe(200);
    expect(deleteFromStorageBestEffort).toHaveBeenCalledWith(
      'https://blob/organization/logo-1.png',
      expect.any(String),
    );
  });
});

describe('POST /api/upload/child-documents', () => {
  function documentForm(overrides: { childId?: string; description?: string } = {}) {
    const form = new FormData();
    form.append('file', pdfFile());
    form.append('childId', overrides.childId ?? CHILD_ID);
    if (overrides.description) form.append('description', overrides.description);
    return form;
  }

  it('refuse un visiteur non authentifié', async () => {
    authMock.mockResolvedValue(null);

    const res = await documentPost(postRequest(documentForm()));

    expect(res.status).toBe(401);
    expect(uploadToStorage).not.toHaveBeenCalled();
  });

  it('refuse un fichier qui n’est pas un PDF', async () => {
    authMock.mockResolvedValue(ADMIN);
    const form = new FormData();
    form.append('file', pngFile());
    form.append('childId', CHILD_ID);

    const res = await documentPost(postRequest(form));

    expect(res.status).toBe(400);
    expect(uploadToStorage).not.toHaveBeenCalled();
  });

  it('refuse un identifiant d’enfant malformé', async () => {
    authMock.mockResolvedValue(ADMIN);

    const res = await documentPost(postRequest(documentForm({ childId: 'pas-un-uuid' })));

    expect(res.status).toBe(400);
    expect(uploadToStorage).not.toHaveBeenCalled();
  });

  it('répond 404 pour un PARENT non rattaché à l’enfant', async () => {
    authMock.mockResolvedValue(PARENT);
    childParentFindFirst.mockResolvedValue(null);

    const res = await documentPost(postRequest(documentForm()));

    expect(res.status).toBe(404);
    expect(uploadToStorage).not.toHaveBeenCalled();
  });

  it('crée le document pour un PARENT rattaché', async () => {
    authMock.mockResolvedValue(PARENT);
    childParentFindFirst.mockResolvedValue({ id: 'link-1' });
    childDocumentCreate.mockImplementation(async ({ data }: any) => ({
      id: 'd0000000-0000-4000-a000-000000000001',
      ...data,
    }));

    const res = await documentPost(
      postRequest(documentForm({ description: '  Certificat médical  ' })),
    );

    expect(res.status).toBe(200);
    expect(childDocumentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        childId: CHILD_ID,
        originalFilename: 'certificat.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        description: 'Certificat médical',
        uploadedBy: PARENT.user.id,
        fileUrl: 'https://blob.vercel-storage.com/organization/logo.png',
      }),
    });
    expect(uploadToStorage).toHaveBeenCalledWith(expect.any(Buffer), {
      pathname: expect.stringMatching(
        new RegExp(`^child-documents/${CHILD_ID}/[0-9a-f-]{36}\\.pdf$`),
      ),
      contentType: 'application/pdf',
      access: 'private',
    });
  });

  it('supprime le blob si l’enregistrement en base échoue', async () => {
    authMock.mockResolvedValue(ADMIN);
    childFindFirst.mockResolvedValue({ id: CHILD_ID });
    childDocumentCreate.mockRejectedValue(new Error('deadlock'));

    const res = await documentPost(postRequest(documentForm()));

    expect(res.status).toBe(500);
    expect(deleteFromStorageBestEffort).toHaveBeenCalledWith(
      'https://blob.vercel-storage.com/organization/logo.png',
      expect.any(String),
    );
  });

  it('répond 404 pour un ADMIN quand l’enfant n’existe pas', async () => {
    authMock.mockResolvedValue(ADMIN);
    childFindFirst.mockResolvedValue(null);

    const res = await documentPost(postRequest(documentForm()));

    expect(res.status).toBe(404);
    expect(uploadToStorage).not.toHaveBeenCalled();
  });
});


describe('POST /api/upload/staff-documents', () => {
  function form() { const data=new FormData();data.set('staffId',CHILD_ID);data.set('file',pdfFile());return postRequest(data); }
  it('refuses a parent before uploading', async () => { authMock.mockResolvedValue(PARENT);expect((await staffPost(form())).status).toBe(404);expect(uploadToStorage).not.toHaveBeenCalled(); });
  it('stores a staff PDF privately and returns only its authenticated route', async () => {
    authMock.mockResolvedValue(ADMIN);staffFindFirst.mockResolvedValue({userId:CHILD_ID});staffDocumentCreate.mockImplementation(async ({data}: {data: Record<string,unknown>})=>({id:CHILD_ID,...data}));
    const response=await staffPost(form());expect(response.status).toBe(200);expect((await response.json()).fileUrl).toBe(`/api/documents/staff/${CHILD_ID}`);expect(uploadToStorage).toHaveBeenCalledWith(expect.any(Buffer),expect.objectContaining({access:'private'}));
  });
  it('cleans up the private blob after a failed database insert', async () => {
    authMock.mockResolvedValue(ADMIN);staffFindFirst.mockResolvedValue({userId:CHILD_ID});staffDocumentCreate.mockRejectedValue(new Error('rollback'));expect((await staffPost(form())).status).toBe(500);expect(deleteFromStorageBestEffort).toHaveBeenCalled();
  });
});
