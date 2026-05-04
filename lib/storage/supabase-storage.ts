import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

function getStorageClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase Storage non configuré. Définir SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  cachedClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export interface UploadOptions {
  bucket: string;
  path: string;
  contentType?: string;
  upsert?: boolean;
}

export async function uploadToStorage(
  data: Buffer | Uint8Array | Blob,
  options: UploadOptions,
): Promise<{ path: string; publicUrl: string }> {
  const client = getStorageClient();

  const { error } = await client.storage
    .from(options.bucket)
    .upload(options.path, data, {
      contentType: options.contentType ?? 'application/octet-stream',
      upsert: options.upsert ?? true,
    });

  if (error) {
    throw new Error(`Upload Supabase Storage échoué : ${error.message}`);
  }

  const { data: publicData } = client.storage
    .from(options.bucket)
    .getPublicUrl(options.path);

  return { path: options.path, publicUrl: publicData.publicUrl };
}

export async function deleteFromStorage(bucket: string, path: string): Promise<void> {
  const client = getStorageClient();
  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) {
    throw new Error(`Suppression Supabase Storage échouée : ${error.message}`);
  }
}
