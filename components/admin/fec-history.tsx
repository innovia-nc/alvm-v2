'use client';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { LoadingState } from '@/components/shared/loading-state';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc/client';
import { useState } from 'react';
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
    <Card>
      <CardHeader>
        <CardTitle>Exports conservés</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {history.isError ? (
          <ErrorState onRetry={() => history.refetch()} />
        ) : history.isLoading ? (
          <LoadingState label="Chargement des exports…" />
        ) : !history.data?.length ? (
          <EmptyState
            title="Aucun export conservé"
            description="Les exports générés apparaîtront ici pour être téléchargés à nouveau."
          />
        ) : (
          <ul>
            {history.data?.map((row) => (
              <li className="break-all border-b py-3" key={row.id}>
                <Button
                  variant="link"
                  className="h-auto justify-start px-0 text-left"
                  onClick={() => download(row.id)}
                >
                  {row.filename} — {row.createdAt.toLocaleString('fr-FR')}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {row.entryCount} écritures · SHA-256 {row.sha256}
                </p>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" disabled={!offset} onClick={() => setOffset(offset - 20)}>
            Précédent
          </Button>
          <Button
            variant="outline"
            disabled={(history.data?.length ?? 0) < 20}
            onClick={() => setOffset(offset + 20)}
          >
            Suivant
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
