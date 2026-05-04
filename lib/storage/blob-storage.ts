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
  await del(url);
}
