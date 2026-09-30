/**
 * Téléversements (TD-025) : `POST /api/upload/{logo|child-documents|staff-documents}`,
 * `DELETE /api/upload/logo`.
 *
 * Un `File` ne traverse pas tRPC/superjson, d'où des routes HTTP. Règles :
 * - MIME et taille validés ICI (la validation des composants se contourne) ;
 * - objet rangé sous le préfixe de l'association (`tenantBlobPath`) ;
 * - blob d'abord, ligne ensuite, blob annulé si la ligne échoue (pendant
 *   amont de TD-006) ;
 * - nom de blob unique pour le logo (`settings.setLogoUrl` supprime l'ancien).
 */
import { randomUUID } from 'node:crypto';
import { uploadToStorage, deleteFromStorageBestEffort } from '@back/storage/blob-storage';
import { tenantBlobPath } from '@back/storage/tenant-path';
import { hasChildAccess } from '@back/helpers/child-access.helper';
import { parseLogoValue } from '@back/helpers/settings';
import { jsonError, openTenantRequest, type RequestUser } from '@back/http/tenant-request';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024; // 5 Mo — comme `components/ui/document-upload.tsx`
const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2 Mo — comme `components/ui/image-upload.tsx`
const LOGO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
};

async function readForm(request: Request): Promise<FormData | null> {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}

function formText(form: FormData, key: string): string | null {
  const value = form.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function validatePdf(file: File | null): Response | null {
  if (!file) return jsonError('Aucun fichier reçu', 400);
  if (file.type !== 'application/pdf')
    return jsonError('Format non autorisé. Seuls les fichiers PDF sont acceptés.', 400);
  if (file.size === 0) return jsonError('Fichier vide', 400);
  if (file.size > MAX_DOCUMENT_SIZE)
    return jsonError('Fichier trop volumineux. Taille maximale : 5MB', 400);
  return null;
}

async function storePrivatePdf(file: File, pathname: string): Promise<string | Response> {
  try {
    const { url } = await uploadToStorage(Buffer.from(await file.arrayBuffer()), {
      pathname,
      contentType: 'application/pdf',
      access: 'private',
    });
    return url;
  } catch (error) {
    console.error('[upload] Téléversement impossible', error);
    return jsonError('Le téléversement a échoué. Le stockage est-il configuré ?', 500);
  }
}

/** Logo de l'association (ADMIN). L'URL est ensuite enregistrée par `settings.setLogoUrl`. */
export async function handleLogoUpload(request: Request, user: RequestUser | null) {
  const tenant = await openTenantRequest(user, []);
  if (tenant instanceof Response) return tenant;
  if (tenant.user.role !== 'ADMIN') return jsonError('Non autorisé', 403);

  const form = await readForm(request);
  if (!form) return jsonError('Requête invalide', 400);
  const entry = form.get('file');
  const file = entry instanceof File ? entry : null;
  if (!file) return jsonError('Aucun fichier reçu', 400);
  const extension = LOGO_TYPES[file.type];
  if (!extension) return jsonError('Format non autorisé. Formats acceptés : PNG, JPEG, SVG', 400);
  if (file.size === 0) return jsonError('Fichier vide', 400);
  if (file.size > MAX_LOGO_SIZE) return jsonError('Fichier trop volumineux. Taille maximale : 2.0MB', 400);

  try {
    const { url } = await uploadToStorage(Buffer.from(await file.arrayBuffer()), {
      pathname: tenantBlobPath(tenant.user.organizationId, `logo-${randomUUID()}.${extension}`),
      contentType: file.type,
    });
    return Response.json({ url });
  } catch (error) {
    console.error('[upload/logo] Téléversement impossible', error);
    return jsonError('Le téléversement a échoué. Le stockage est-il configuré ?', 500);
  }
}

/**
 * Suppression du blob du logo (ADMIN). Garde-fou : seule l'URL enregistrée
 * pour CETTE association peut être effacée — jamais un autre objet du store.
 */
export async function handleLogoDelete(request: Request, user: RequestUser | null) {
  const tenant = await openTenantRequest(user, []);
  if (tenant instanceof Response) return tenant;
  if (tenant.user.role !== 'ADMIN') return jsonError('Non autorisé', 403);

  let url: unknown;
  try {
    url = ((await request.json()) as { url?: unknown })?.url;
  } catch {
    return jsonError('Requête invalide', 400);
  }
  if (typeof url !== 'string' || !url.trim()) return jsonError('URL manquante', 400);

  const storedUrl = await tenant.run(async (db) =>
    parseLogoValue(
      (
        await db.appSetting.findFirst({
          where: { category: 'organization', key: 'logo_url' },
          select: { value: true },
        })
      )?.value,
    ),
  );
  if (!storedUrl || storedUrl !== url)
    return jsonError("L'URL ne correspond pas au logo enregistré", 400);

  // Best effort (TD-006) : un store injoignable n'empêche pas l'écran de
  // retirer ensuite l'URL des réglages.
  await deleteFromStorageBestEffort(storedUrl, 'logo supprimé');
  return Response.json({ success: true });
}

/** Document PDF d'un enfant — même règle d'accès que les procédures tRPC. */
export async function handleChildDocumentUpload(request: Request, user: RequestUser | null) {
  const tenant = await openTenantRequest(user, ['documents', 'children']);
  if (tenant instanceof Response) return tenant;

  const form = await readForm(request);
  if (!form) return jsonError('Requête invalide', 400);
  const childId = formText(form, 'childId') ?? '';
  const entry = form.get('file');
  const file = entry instanceof File ? entry : null;
  if (!UUID.test(childId)) return jsonError('Enfant invalide', 400);
  const invalid = validatePdf(file);
  if (invalid || !file) return invalid!;

  // Un parent n'atteint que ses propres enfants ; le refus est un 404 indistinct.
  const allowed = await tenant.run((db) =>
    hasChildAccess(db, tenant.user.id, tenant.user.role, childId),
  );
  if (!allowed) return jsonError('Enfant non trouvé ou accès refusé', 404);

  const filename = `${randomUUID()}.pdf`;
  const stored = await storePrivatePdf(
    file,
    tenantBlobPath(tenant.user.organizationId, `child-documents/${childId}/${filename}`),
  );
  if (stored instanceof Response) return stored;

  try {
    const document = await tenant.run((db) =>
      db.childDocument.create({
        data: {
          childId,
          filename,
          originalFilename: file.name?.trim() || filename,
          fileUrl: stored,
          mimeType: 'application/pdf',
          fileSize: file.size,
          description: formText(form, 'description'),
          uploadedBy: tenant.user.id,
        },
        select: {
          id: true,
          childId: true,
          filename: true,
          originalFilename: true,
          fileSize: true,
          description: true,
        },
      }),
    );
    return Response.json({ ...document, fileUrl: `/api/documents/child/${document.id}` });
  } catch (error) {
    console.error('[upload/child-documents] Enregistrement impossible, blob annulé', error);
    await deleteFromStorageBestEffort(stored, 'document enfant orphelin');
    return jsonError("L'enregistrement du document a échoué", 500);
  }
}

/** Document PDF d'un membre du personnel — personnel et administrateurs. */
export async function handleStaffDocumentUpload(request: Request, user: RequestUser | null) {
  const tenant = await openTenantRequest(user, ['documents', 'staff']);
  if (tenant instanceof Response) return tenant;

  const form = await readForm(request);
  if (!form) return jsonError('Requête invalide', 400);
  const staffId = formText(form, 'staffId') ?? '';
  const entry = form.get('file');
  const file = entry instanceof File ? entry : null;
  if (!UUID.test(staffId)) return jsonError('Membre du personnel invalide', 400);
  const invalid = validatePdf(file);
  if (invalid || !file) return invalid!;

  const allowed =
    ['STAFF', 'ADMIN'].includes(tenant.user.role) &&
    (await tenant.run((db) =>
      db.staffMember.findFirst({ where: { userId: staffId, deletedAt: null }, select: { userId: true } }),
    ));
  if (!allowed) return jsonError('Membre du personnel non trouvé ou accès refusé', 404);

  const filename = `${randomUUID()}.pdf`;
  const stored = await storePrivatePdf(
    file,
    tenantBlobPath(tenant.user.organizationId, `staff-documents/${staffId}/${filename}`),
  );
  if (stored instanceof Response) return stored;

  try {
    const document = await tenant.run((db) =>
      db.staffDocument.create({
        data: {
          staffId,
          filename,
          originalFilename: file.name?.trim() || filename,
          fileUrl: stored,
          mimeType: 'application/pdf',
          fileSize: file.size,
          description: formText(form, 'description'),
          uploadedBy: tenant.user.id,
        },
        select: {
          id: true,
          staffId: true,
          filename: true,
          originalFilename: true,
          fileSize: true,
          description: true,
        },
      }),
    );
    return Response.json({ ...document, fileUrl: `/api/documents/staff/${document.id}` });
  } catch (error) {
    console.error('[upload/staff-documents] Enregistrement impossible, blob annulé', error);
    await deleteFromStorageBestEffort(stored, 'document personnel orphelin');
    return jsonError("L'enregistrement du document a échoué", 500);
  }
}
