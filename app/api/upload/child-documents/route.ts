/**
 * Documents PDF d'un enfant — televersement (TD-025).
 *
 * `components/ui/document-upload.tsx` poste ici un `multipart/form-data`
 * (`file`, `childId`, `description?`) : un `File` ne traverse pas
 * tRPC/superjson, d'ou une route HTTP. Le routeur `childDocuments` ne porte
 * que list/count/delete — c'est cette route qui cree la ligne.
 *
 * Ordre volontaire : blob d'abord, ligne ensuite. Si l'ecriture en base echoue,
 * le blob est supprime (best effort) pour ne pas laisser d'objet facture et
 * public sans aucune reference — pendant amont de TD-006.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { auth } from '@/lib/auth';
import { prisma } from '@/server/db';
import {
  uploadToStorage,
  deleteFromStorageBestEffort,
} from '@/lib/storage/blob-storage';
import { hasChildAccess } from '@/server/helpers/child-access.helper';

// Memes valeurs que `components/ui/document-upload.tsx`.
const MAX_SIZE = 5 * 1024 * 1024; // 5 Mo
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  let file: File | null = null;
  let childId = '';
  let description: string | null = null;
  try {
    const formData = await req.formData();
    const entry = formData.get('file');
    file = entry instanceof File ? entry : null;
    childId = String(formData.get('childId') ?? '');
    const rawDescription = formData.get('description');
    description =
      typeof rawDescription === 'string' && rawDescription.trim()
        ? rawDescription.trim()
        : null;
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  }

  if (!UUID_RE.test(childId)) {
    return NextResponse.json({ error: 'Enfant invalide' }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ error: 'Aucun fichier reçu' }, { status: 400 });
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json(
      { error: 'Format non autorisé. Seuls les fichiers PDF sont acceptés.' },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Fichier vide' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: 'Fichier trop volumineux. Taille maximale : 5MB' },
      { status: 400 },
    );
  }

  // Meme regle d'acces que les procedures tRPC : un parent n'atteint que ses
  // propres enfants, et le refus est un 404 indistinct.
  const allowed = await hasChildAccess(
    prisma,
    session.user.id,
    session.user.role ?? 'PARENT',
    childId,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: 'Enfant non trouvé ou accès refusé' },
      { status: 404 },
    );
  }

  const filename = `${randomUUID()}.pdf`;
  const originalFilename = file.name?.trim() || filename;

  let uploadedUrl: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await uploadToStorage(buffer, {
      pathname: `child-documents/${childId}/${filename}`,
      contentType: 'application/pdf',
    });
    uploadedUrl = url;
  } catch (error) {
    console.error('[upload/child-documents] Televersement impossible', error);
    return NextResponse.json(
      { error: "Le téléversement a échoué. Le stockage est-il configuré ?" },
      { status: 500 },
    );
  }

  try {
    const document = await prisma.childDocument.create({
      data: {
        childId,
        filename,
        originalFilename,
        fileUrl: uploadedUrl,
        mimeType: 'application/pdf',
        fileSize: file.size,
        description,
        uploadedBy: session.user.id,
      },
    });

    return NextResponse.json({
      id: document.id,
      childId: document.childId,
      filename: document.filename,
      originalFilename: document.originalFilename,
      fileUrl: document.fileUrl,
      fileSize: document.fileSize,
      description: document.description,
    });
  } catch (error) {
    console.error(
      '[upload/child-documents] Enregistrement impossible, blob annule',
      error,
    );
    await deleteFromStorageBestEffort(uploadedUrl, 'document enfant orphelin');
    return NextResponse.json(
      { error: "L'enregistrement du document a échoué" },
      { status: 500 },
    );
  }
}
