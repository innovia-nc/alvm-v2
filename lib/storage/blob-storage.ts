import { put, del } from '@vercel/blob';
import type { Readable } from 'node:stream';

export interface UploadOptions {
  pathname: string;
  contentType?: string;
  access?: 'public';
}

type UploadData = Buffer | Blob | File | Readable | ReadableStream;

export async function uploadToStorage(
  data: UploadData,
  options: UploadOptions,
): Promise<{ pathname: string; url: string }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      'Vercel Blob non configuré. BLOB_READ_WRITE_TOKEN absent — connecter le store Blob au projet sur Vercel.',
    );
  }

  const blob = await put(options.pathname, data, {
    access: options.access ?? 'public',
    contentType: options.contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  return { pathname: blob.pathname, url: blob.url };
}

export async function deleteFromStorage(url: string): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      'Vercel Blob non configuré. BLOB_READ_WRITE_TOKEN absent — connecter le store Blob au projet sur Vercel.',
    );
  }

  await del(url);
}

/**
 * Supprime un objet du store en « best effort » (TD-006).
 *
 * La suppression fonctionnelle (ligne en base) fait autorité : si le store est
 * injoignable, mal configuré ou que l'objet a déjà disparu, on ne fait PAS
 * échouer la mutation appelante — on trace et on continue. L'inverse
 * (suppression du blob avant la base, ou rollback sur échec blob) laisserait
 * l'utilisateur devant un document qu'il croit supprimé et qui réapparaît.
 *
 * @param url URL publique du blob, telle que stockée en base (`fileUrl`,
 *            `logo_url`…). Une valeur vide/nulle est ignorée silencieusement.
 * @param context libellé court utilisé dans le log d'échec (ex. `'document enfant'`)
 * @returns `true` si l'objet a été supprimé, `false` si l'appel a échoué ou
 *          qu'il n'y avait rien à supprimer.
 */
export async function deleteFromStorageBestEffort(
  url: string | null | undefined,
  context: string,
): Promise<boolean> {
  if (!url) return false;

  try {
    await deleteFromStorage(url);
    return true;
  } catch (error) {
    // Blob orphelin : facturé et toujours accessible par URL publique.
    // Tracé pour permettre un nettoyage manuel, jamais propagé à l'appelant.
    console.error(
      `[blob-storage] Suppression du blob impossible (${context}) : ${url}`,
      error,
    );
    return false;
  }
}
