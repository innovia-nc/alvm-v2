/**
 * Logo de l'association — televersement et suppression du blob (TD-025).
 *
 * `components/ui/image-upload.tsx` (POST) et l'ecran `/dashboard/admin/settings`
 * (DELETE) appellent cette route depuis le navigateur : un `File` ne traverse
 * pas tRPC/superjson, d'ou une route HTTP plutot qu'une procedure.
 *
 * La route ne fait QUE manipuler le store. L'enregistrement de l'URL dans
 * `app_settings.organization.logo_url` reste porte par `settings.setLogoUrl` /
 * `settings.deleteLogoUrl`, appeles par l'ecran juste apres.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { auth } from '@/lib/auth';
import { prisma } from '@/server/db';
import {
  uploadToStorage,
  deleteFromStorageBestEffort,
} from '@/lib/storage/blob-storage';
import { parseLogoValue } from '@/server/helpers/settings';

// Memes valeurs que `components/ui/image-upload.tsx` : la validation client
// donne le message immediat, celle-ci fait autorite (le client est contournable).
const ACCEPTED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
};
const MAX_SIZE = 2 * 1024 * 1024; // 2 Mo

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  let file: File | null = null;
  try {
    const formData = await req.formData();
    const entry = formData.get('file');
    file = entry instanceof File ? entry : null;
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: 'Aucun fichier reçu' }, { status: 400 });
  }

  const extension = ACCEPTED_TYPES[file.type];
  if (!extension) {
    return NextResponse.json(
      { error: 'Format non autorisé. Formats acceptés : PNG, JPEG, SVG' },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Fichier vide' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: 'Fichier trop volumineux. Taille maximale : 2.0MB' },
      { status: 400 },
    );
  }

  // Nom unique OBLIGATOIRE : `settings.setLogoUrl` supprime le blob precedent
  // apres avoir enregistre le nouveau (TD-006). Avec un pathname fixe, les deux
  // URL seraient identiques et cette suppression effacerait le logo qu'on vient
  // de televerser.
  const pathname = `organization/logo-${randomUUID()}.${extension}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await uploadToStorage(buffer, {
      pathname,
      contentType: file.type,
    });
    return NextResponse.json({ url });
  } catch (error) {
    console.error('[upload/logo] Televersement impossible', error);
    return NextResponse.json(
      { error: "Le téléversement a échoué. Le stockage est-il configuré ?" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  let url: unknown;
  try {
    const body = await req.json();
    url = (body as { url?: unknown })?.url;
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  }

  if (typeof url !== 'string' || !url.trim()) {
    return NextResponse.json({ error: 'URL manquante' }, { status: 400 });
  }

  // Garde-fou : cette route ne peut effacer QUE le logo enregistre. Sans cette
  // comparaison, un compte ADMIN compromis pourrait faire supprimer n'importe
  // quel objet du store (PDF de facture, document d'enfant) via son URL.
  const setting = await prisma.appSetting.findUnique({
    where: { category_key: { category: 'organization', key: 'logo_url' } },
  });
  const storedUrl = parseLogoValue(setting?.value);

  if (!storedUrl || storedUrl !== url) {
    return NextResponse.json(
      { error: "L'URL ne correspond pas au logo enregistré" },
      { status: 400 },
    );
  }

  // Best effort (TD-006) : un store injoignable ne doit pas empecher l'ecran
  // de retirer ensuite l'URL des settings.
  await deleteFromStorageBestEffort(storedUrl, 'logo supprimé');

  return NextResponse.json({ success: true });
}
