/**
 * Routes HTTP métier (`src/http/*`) sur la vraie base, sous RLS : documents
 * téléchargeables, PDF générés, téléversements.
 *
 * Seul le SDK du stockage (`@vercel/blob`) est simulé : l'accès aux données,
 * les contrôles d'habilitation, la lecture des jetons d'intégration et le
 * rendu PDF sont réels. Les sessions sont de vrais cookies Auth.js chiffrés,
 * revalidés en base comme en production (`resolveRequestUser`).
 */
import { encode } from '@auth/core/jwt';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveRequestUser } from '@back/auth/request-auth';
import { handleDocumentDownload } from '@back/http/documents.handler';
import {
  handleAttendanceListPdf,
  handleChildProfilePdf,
  handleStaffProfilePdf,
} from '@back/http/generated-pdf.handler';
import type { RequestUser } from '@back/http/tenant-request';
import {
  handleChildDocumentUpload,
  handleLogoDelete,
  handleLogoUpload,
  handleStaffDocumentUpload,
} from '@back/http/uploads.handler';
import { createOwnerClient, trpcCodeOf } from './helpers/db';
import { seedTenantDataset, type TenantDataset } from './helpers/dataset';
import {
  createParent,
  createSuperAdmin,
  provisionTenant,
  type TestParent,
} from './helpers/tenants';

const blob = vi.hoisted(() => ({
  put: vi.fn(),
  del: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
}));
vi.mock('@vercel/blob', () => blob);

const PRIVATE_HOST = 'https://integration.private.blob.vercel-storage.com';
const PUBLIC_HOST = 'https://integration.public.blob.vercel-storage.com';
const SESSION_COOKIE = 'authjs.session-token';

let owner: PrismaClient;
let superAdmin: RequestUser;
let A: TenantDataset;
let B: TenantDataset;
let adminA: RequestUser;
let adminB: RequestUser;
let parentA: RequestUser;
let parentB: RequestUser;
let staffA: RequestUser;
let otherFamilyA: TestParent;

const pdfBytes = () => new TextEncoder().encode('%PDF-1.4 document de test');

function uploadRequest(path: string, fields: Record<string, string | File>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return new Request(`http://back.test/api/upload/${path}`, { method: 'POST', body: form });
}

const pdfFile = (name = 'certificat.pdf') =>
  new File([pdfBytes()], name, { type: 'application/pdf' });

async function body(response: Response) {
  return new Uint8Array(await response.arrayBuffer());
}

async function expectPdf(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('application/pdf');
  const bytes = await body(response);
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  return bytes;
}

beforeAll(async () => {
  owner = createOwnerClient();
  const platformAdmin = await createSuperAdmin();
  superAdmin = platformAdmin;
  A = await seedTenantDataset(await provisionTenant(platformAdmin, 'http-a'));
  B = await seedTenantDataset(await provisionTenant(platformAdmin, 'http-b'));
  adminA = A.tenant.admin;
  adminB = B.tenant.admin;
  parentA = { id: A.parentId, role: 'PARENT', organizationId: A.tenant.organization.id };
  parentB = { id: B.parentId, role: 'PARENT', organizationId: B.tenant.organization.id };
  staffA = { id: A.staffId, role: 'STAFF', organizationId: A.tenant.organization.id };
  otherFamilyA = await createParent(A.tenant);
});

afterAll(async () => {
  await owner?.$disconnect();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('BLOB_PRIVATE_READ_WRITE_TOKEN', 'private-test-token');
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'public-test-token');
  blob.put.mockImplementation(
    async (pathname: string, _data: unknown, options: { access: string }) => ({
      pathname,
      url: `${options.access === 'private' ? PRIVATE_HOST : PUBLIC_HOST}/${pathname}`,
    }),
  );
  blob.del.mockResolvedValue(undefined);
  blob.get.mockImplementation(async () => ({
    statusCode: 200,
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue(pdfBytes());
        controller.close();
      },
    }),
  }));
});

/** Toutes les routes, pour un utilisateur donné et les pièces de A. */
function everyRoute(user: RequestUser | null) {
  return {
    'document facture': () => handleDocumentDownload({ kind: 'invoice', id: A.invoiceId }, user),
    'document avoir': () => handleDocumentDownload({ kind: 'credit', id: A.creditNoteId }, user),
    'document enfant': () => handleDocumentDownload({ kind: 'child', id: A.childDocumentId }, user),
    'document personnel': () =>
      handleDocumentDownload({ kind: 'staff', id: A.staffDocumentId }, user),
    'liste de présence': () => handleAttendanceListPdf(A.campId, user),
    'fiche enfant': () => handleChildProfilePdf(A.childId, user),
    'fiche personnel': () => handleStaffProfilePdf(A.staffId, user),
    'téléversement document enfant': () =>
      handleChildDocumentUpload(
        uploadRequest('child-documents', { childId: A.childId, file: pdfFile() }),
        user,
      ),
    'téléversement document personnel': () =>
      handleStaffDocumentUpload(
        uploadRequest('staff-documents', { staffId: A.staffId, file: pdfFile() }),
        user,
      ),
    'téléversement logo': () =>
      handleLogoUpload(
        uploadRequest('logo', { file: new File([pdfBytes()], 'logo.png', { type: 'image/png' }) }),
        user,
      ),
    'suppression logo': () =>
      handleLogoDelete(
        new Request('http://back.test/api/upload/logo', {
          method: 'DELETE',
          body: JSON.stringify({ url: `${PUBLIC_HOST}/organizations/x/logo.png` }),
        }),
        user,
      ),
  };
}

describe('sans session : 401 partout, sans toucher au stockage', () => {
  it.each(Object.entries(everyRoute(null)))('%s', async (_name, call) => {
    expect((await call()).status).toBe(401);
    expect(blob.put).not.toHaveBeenCalled();
    expect(blob.get).not.toHaveBeenCalled();
    expect(blob.del).not.toHaveBeenCalled();
  });
});

describe('super administrateur : 403 partout (aucun accès aux données métier)', () => {
  it.each(Object.keys(everyRoute(null)))('%s', async (name) => {
    const call = everyRoute(superAdmin)[name as keyof ReturnType<typeof everyRoute>];
    expect((await call()).status).toBe(403);
    expect(blob.put).not.toHaveBeenCalled();
    expect(blob.get).not.toHaveBeenCalled();
  });
});

describe('autre association : 404 indistinct, sans toucher au stockage', () => {
  const crossTenant = [
    'document facture',
    'document avoir',
    'document enfant',
    'document personnel',
    'liste de présence',
    'fiche enfant',
    'fiche personnel',
    'téléversement document enfant',
    'téléversement document personnel',
  ] as const;

  it.each(crossTenant)('admin de B → %s de A', async (name) => {
    expect((await everyRoute(adminB)[name]()).status).toBe(404);
    expect(blob.put).not.toHaveBeenCalled();
    expect(blob.get).not.toHaveBeenCalled();
  });

  it.each(['document facture', 'document avoir', 'document enfant', 'fiche enfant'] as const)(
    'parent de B → %s de A',
    async (name) => {
      expect((await everyRoute(parentB)[name]()).status).toBe(404);
      expect(blob.get).not.toHaveBeenCalled();
    },
  );

  it('un parent de B ne téléverse pas de document sur un enfant de A', async () => {
    const response = await handleChildDocumentUpload(
      uploadRequest('child-documents', { childId: A.childId, file: pdfFile() }),
      parentB,
    );
    expect(response.status).toBe(404);
    expect(blob.put).not.toHaveBeenCalled();
    expect(await owner.childDocument.count({ where: { childId: A.childId } })).toBe(1);
  });

  it('une autre famille de la même association : même 404 indistinct', async () => {
    for (const call of [
      () => handleDocumentDownload({ kind: 'invoice', id: A.invoiceId }, otherFamilyA),
      () => handleDocumentDownload({ kind: 'child', id: A.childDocumentId }, otherFamilyA),
      () => handleChildProfilePdf(A.childId, otherFamilyA),
    ])
      expect((await call()).status).toBe(404);
  });

  it('identifiant inconnu ou mal formé : 404, jamais 500', async () => {
    const unknown = '00000000-0000-4000-a000-000000000000';
    for (const call of [
      () => handleDocumentDownload({ kind: 'invoice', id: unknown }, adminA),
      () => handleDocumentDownload({ kind: 'invoice', id: 'pas-un-uuid' }, adminA),
      () => handleDocumentDownload({ kind: 'inconnu', id: unknown }, adminA),
      () => handleAttendanceListPdf(unknown, adminA),
      () => handleChildProfilePdf(unknown, adminA),
      () => handleStaffProfilePdf(unknown, adminA),
    ])
      expect((await call()).status).toBe(404);
  });
});

describe('dans son association', () => {
  it('facture et avoir régénérés en PDF, pour l’admin et pour le parent concerné', async () => {
    await expectPdf(await handleDocumentDownload({ kind: 'invoice', id: A.invoiceId }, adminA));
    await expectPdf(await handleDocumentDownload({ kind: 'invoice', id: A.invoiceId }, parentA));
    await expectPdf(await handleDocumentDownload({ kind: 'credit', id: A.creditNoteId }, parentA));
    // Téléchargement sans archivage : aucune écriture sur le stockage.
    expect(blob.put).not.toHaveBeenCalled();
  });

  it('document privé d’un enfant relu depuis le stockage avec le jeton privé', async () => {
    const response = await handleDocumentDownload(
      { kind: 'child', id: A.childDocumentId },
      parentA,
    );
    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(await body(response))).toContain('%PDF');
    const stored = await owner.childDocument.findUniqueOrThrow({
      where: { id: A.childDocumentId },
    });
    expect(blob.get).toHaveBeenCalledWith(
      stored.fileUrl,
      expect.objectContaining({ access: 'private', token: 'private-test-token' }),
    );
  });

  it('document du personnel : personnel et admin oui, parent non', async () => {
    expect(
      (await handleDocumentDownload({ kind: 'staff', id: A.staffDocumentId }, staffA)).status,
    ).toBe(200);
    expect(
      (await handleDocumentDownload({ kind: 'staff', id: A.staffDocumentId }, parentA)).status,
    ).toBe(404);
  });

  it('liste de présence PDF du camp de l’association (personnel et admin), refusée au parent', async () => {
    const response = await handleAttendanceListPdf(A.campId, adminA);
    expect(response.headers.get('content-disposition')).toMatch(/^inline; filename="presences-/);
    await expectPdf(response);
    await expectPdf(await handleAttendanceListPdf(A.campId, staffA));
    expect((await handleAttendanceListPdf(A.campId, parentA)).status).toBe(403);
  });

  it('fiche enfant (admin, parent de l’enfant) et fiche du personnel (admin)', async () => {
    await expectPdf(await handleChildProfilePdf(A.childId, adminA));
    await expectPdf(await handleChildProfilePdf(A.childId, parentA));
    await expectPdf(await handleStaffProfilePdf(A.staffId, adminA));
    expect((await handleStaffProfilePdf(A.staffId, parentA)).status).toBe(403);
  });

  it('téléversement d’un document d’enfant : objet rangé sous l’association, ligne créée dans son tenant', async () => {
    const response = await handleChildDocumentUpload(
      uploadRequest('child-documents', {
        childId: A.childId,
        file: pdfFile(),
        description: 'Vaccins',
      }),
      parentA,
    );
    expect(response.status).toBe(200);
    const created = (await response.json()) as { id: string; fileUrl: string };
    expect(created.fileUrl).toBe(`/api/documents/child/${created.id}`);

    const [pathname, , options] = blob.put.mock.calls[0];
    expect(pathname).toMatch(
      new RegExp(
        `^organizations/${A.tenant.organization.id}/child-documents/${A.childId}/[0-9a-f-]+\\.pdf$`,
      ),
    );
    expect(options).toMatchObject({ access: 'private', token: 'private-test-token' });
    const row = await owner.childDocument.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({
      organizationId: A.tenant.organization.id,
      childId: A.childId,
      uploadedBy: A.parentId,
      fileUrl: `${PRIVATE_HOST}/${pathname}`,
      description: 'Vaccins',
    });

    // Le document téléversé est invisible depuis B, lisible par son parent.
    expect((await handleDocumentDownload({ kind: 'child', id: created.id }, adminB)).status).toBe(
      404,
    );
    expect((await handleDocumentDownload({ kind: 'child', id: created.id }, parentA)).status).toBe(
      200,
    );
  });

  it('téléversement : type et taille validés côté serveur', async () => {
    const text = new File(['bonjour'], 'note.txt', { type: 'text/plain' });
    const response = await handleChildDocumentUpload(
      uploadRequest('child-documents', { childId: A.childId, file: text }),
      adminA,
    );
    expect(response.status).toBe(400);
    expect(blob.put).not.toHaveBeenCalled();
  });

  it('téléversement d’un document du personnel (admin), refusé au parent', async () => {
    const response = await handleStaffDocumentUpload(
      uploadRequest('staff-documents', { staffId: A.staffId, file: pdfFile('diplome.pdf') }),
      adminA,
    );
    expect(response.status).toBe(200);
    const created = (await response.json()) as { id: string };
    expect(
      (await owner.staffDocument.findUniqueOrThrow({ where: { id: created.id } })).organizationId,
    ).toBe(A.tenant.organization.id);
    expect(
      (
        await handleStaffDocumentUpload(
          uploadRequest('staff-documents', { staffId: A.staffId, file: pdfFile() }),
          parentA,
        )
      ).status,
    ).toBe(404);
  });

  it('logo : téléversé sous l’association, enregistrable par elle seule, supprimable par elle seule', async () => {
    const upload = await handleLogoUpload(
      uploadRequest('logo', { file: new File([pdfBytes()], 'logo.png', { type: 'image/png' }) }),
      adminA,
    );
    expect(upload.status).toBe(200);
    const { url } = (await upload.json()) as { url: string };
    expect(url).toMatch(
      new RegExp(
        `^${PUBLIC_HOST}/organizations/${A.tenant.organization.id}/logo-[0-9a-f-]+\\.png$`,
      ),
    );
    expect(
      (await handleLogoUpload(uploadRequest('logo', { file: pdfFile() }), parentA)).status,
    ).toBe(403);

    // L'URL d'un objet de A est refusée comme logo de B.
    expect(await trpcCodeOf(B.tenant.adminCaller.settings.setLogoUrl({ url }))).toBe('BAD_REQUEST');
    await A.tenant.adminCaller.settings.setLogoUrl({ url });
    expect(await A.tenant.adminCaller.settings.getLogoUrl()).toBe(url);
    expect(await B.tenant.adminCaller.settings.getLogoUrl()).toBeNull();

    const deleteRequest = () =>
      new Request('http://back.test/api/upload/logo', {
        method: 'DELETE',
        body: JSON.stringify({ url }),
      });
    expect((await handleLogoDelete(deleteRequest(), adminB)).status).toBe(400);
    expect(blob.del).not.toHaveBeenCalled();
    expect((await handleLogoDelete(deleteRequest(), adminA)).status).toBe(200);
    expect(blob.del).toHaveBeenCalledWith(url, { token: 'public-test-token' });
  });
});

describe('PDF archivés par les procédures tRPC (seul le stockage est simulé)', () => {
  it('facture : rendu réel, objet rangé sous l’association, URL enregistrée sur la ligne', async () => {
    const result = await A.tenant.adminCaller.invoices.generatePDF({ id: A.invoiceId });
    expect(result.pdfUrl).toBe(`/api/documents/invoice/${A.invoiceId}`);
    const [pathname, data, options] = blob.put.mock.calls[0];
    expect(pathname).toMatch(
      new RegExp(
        `^organizations/${A.tenant.organization.id}/invoices/FAC-\\d{4}-\\d{4}-${A.invoiceId}\\.pdf$`,
      ),
    );
    expect(options).toMatchObject({ access: 'private', contentType: 'application/pdf' });
    expect(Buffer.from(data).subarray(0, 5).toString()).toBe('%PDF-');
    const row = await owner.invoice.findUniqueOrThrow({ where: { id: A.invoiceId } });
    expect(row.pdfUrl).toBe(`${PRIVATE_HOST}/${pathname}`);
  });

  it('avoir : même chaîne, sous le préfixe de l’association', async () => {
    await A.tenant.adminCaller.creditNotes.generatePDF({ id: A.creditNoteId });
    const [pathname] = blob.put.mock.calls[0];
    expect(pathname).toMatch(
      new RegExp(
        `^organizations/${A.tenant.organization.id}/credit-notes/AVO-\\d{4}-\\d{4}-${A.creditNoteId}\\.pdf$`,
      ),
    );
  });

  it('une pièce de A est introuvable pour l’admin de B, rien n’est archivé', async () => {
    expect(await trpcCodeOf(B.tenant.adminCaller.invoices.generatePDF({ id: A.invoiceId }))).toBe(
      'NOT_FOUND',
    );
    expect(
      await trpcCodeOf(B.tenant.adminCaller.creditNotes.generatePDF({ id: A.creditNoteId })),
    ).toBe('NOT_FOUND');
    expect(blob.put).not.toHaveBeenCalled();
  });

  it('envoi par email sans clé configurée : refus explicite, écran désactivé', async () => {
    expect(await A.tenant.adminCaller.settings.isEmailConfigured()).toEqual({
      configured: false,
      fromEmail: null,
    });
    expect(await trpcCodeOf(A.tenant.adminCaller.invoices.sendEmail({ id: A.invoiceId }))).toBe(
      'PRECONDITION_FAILED',
    );
    expect(blob.put).not.toHaveBeenCalled();
  });
});

describe('session réelle : cookie Auth.js revalidé en base à chaque requête', () => {
  async function cookieFor(user: RequestUser, overrides: Record<string, unknown> = {}) {
    const { sessionVersion } = await owner.user.findUniqueOrThrow({ where: { id: user.id } });
    const token = await encode({
      token: {
        id: user.id,
        role: user.role,
        organizationId: user.organizationId,
        sessionVersion,
        ...overrides,
      },
      secret: process.env.AUTH_SECRET!,
      salt: SESSION_COOKIE,
    });
    return { cookie: `${SESSION_COOKIE}=${token}` };
  }

  it('un cookie valide ouvre les documents de son association', async () => {
    const user = await resolveRequestUser(await cookieFor(adminA));
    expect(user).toEqual({
      id: adminA.id,
      role: 'ADMIN',
      organizationId: A.tenant.organization.id,
    });
    await expectPdf(await handleDocumentDownload({ kind: 'invoice', id: A.invoiceId }, user));
  });

  it('un cookie qui revendique une autre association est rejeté (401)', async () => {
    const forged = await cookieFor(adminA, { organizationId: B.tenant.organization.id });
    const user = await resolveRequestUser(forged);
    expect(user).toBeNull();
    expect((await handleDocumentDownload({ kind: 'invoice', id: B.invoiceId }, user)).status).toBe(
      401,
    );
  });

  it('un rôle élevé dans le cookie, une version révoquée ou un cookie illisible sont rejetés', async () => {
    expect(await resolveRequestUser(await cookieFor(parentA, { role: 'ADMIN' }))).toBeNull();
    expect(await resolveRequestUser(await cookieFor(parentA, { sessionVersion: 999 }))).toBeNull();
    expect(await resolveRequestUser({ cookie: `${SESSION_COOKIE}=pas-un-jwe` })).toBeNull();
    expect(await resolveRequestUser({})).toBeNull();
  });
});
