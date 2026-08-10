/**
 * TD-006 — suppression des objets Vercel Blob.
 *
 * `deleteFromStorageBestEffort` est le point d'appel de tous les routers qui
 * suppriment un fichier : il ne doit JAMAIS propager d'erreur (la suppression
 * fonctionnelle en base fait autorité), mais il doit bien appeler le store.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const del = vi.fn();

vi.mock('@vercel/blob', () => ({
  put: vi.fn(),
  del: (...args: unknown[]) => del(...args),
}));

import { deleteFromStorage, deleteFromStorageBestEffort } from '@/lib/storage/blob-storage';

const URL_1 = 'https://store.public.blob.vercel-storage.com/child-documents/doc.pdf';

describe('blob-storage — suppression (TD-006)', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    del.mockReset();
    del.mockResolvedValue(undefined);
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test';
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  describe('deleteFromStorage', () => {
    it('supprime le blob', async () => {
      await deleteFromStorage(URL_1);
      expect(del).toHaveBeenCalledWith(URL_1);
    });

    it('échoue explicitement si le store n’est pas configuré', async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN;

      await expect(deleteFromStorage(URL_1)).rejects.toThrow('BLOB_READ_WRITE_TOKEN');
      expect(del).not.toHaveBeenCalled();
    });
  });

  describe('deleteFromStorageBestEffort', () => {
    it('supprime le blob et retourne true', async () => {
      const result = await deleteFromStorageBestEffort(URL_1, 'document enfant');

      expect(result).toBe(true);
      expect(del).toHaveBeenCalledWith(URL_1);
    });

    it('n’appelle pas le store pour une URL absente', async () => {
      expect(await deleteFromStorageBestEffort(null, 'document enfant')).toBe(false);
      expect(await deleteFromStorageBestEffort(undefined, 'document enfant')).toBe(false);
      expect(await deleteFromStorageBestEffort('', 'document enfant')).toBe(false);
      expect(del).not.toHaveBeenCalled();
    });

    it('avale l’erreur du store et la trace (la suppression métier fait autorité)', async () => {
      del.mockRejectedValue(new Error('Blob not found'));

      const result = await deleteFromStorageBestEffort(URL_1, 'document enfant');

      expect(result).toBe(false);
      expect(consoleError).toHaveBeenCalled();
      expect(String(consoleError.mock.calls[0]![0])).toContain(URL_1);
    });

    it('avale aussi l’absence de configuration du store', async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN;

      await expect(
        deleteFromStorageBestEffort(URL_1, 'logo supprimé'),
      ).resolves.toBe(false);
    });
  });
});
