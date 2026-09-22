'use client';
import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
export function FecHistory() {
  const [offset, setOffset] = useState(0);
  const history = trpc.fec.history.useQuery({ offset });
  const utils = trpc.useUtils();
  const [error, setError] = useState('');
  async function download(id: string) {
    try {
      const row = await utils.fec.downloadExport.fetch({ id });
      const url = URL.createObjectURL(
        new Blob([row.content], { type: 'text/plain;charset=utf-8' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = row.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Téléchargement impossible. Réessayez.');
    }
  }
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Exports conservés</h2>
      {history.isError ? (
        <Button onClick={() => history.refetch()}>Réessayer le chargement</Button>
      ) : history.isLoading ? (
        <p>Chargement…</p>
      ) : (
        <ul>
          {history.data?.map((row) => (
            <li className="break-all border-b py-3" key={row.id}>
              <Button variant="link" onClick={() => download(row.id)}>
                {row.filename} — {row.createdAt.toLocaleString('fr-FR')}
              </Button>
              <p className="text-xs">
                {row.entryCount} écritures · SHA-256 {row.sha256}
              </p>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-3">
        <Button disabled={!offset} onClick={() => setOffset(offset - 20)}>
          Précédent
        </Button>
        <Button disabled={(history.data?.length ?? 0) < 20} onClick={() => setOffset(offset + 20)}>
          Suivant
        </Button>
      </div>
    </section>
  );
}
