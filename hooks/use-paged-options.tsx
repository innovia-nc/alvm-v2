'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export function usePagedOptions(label: string) {
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 20;
  return {
    params: { search: search || undefined, offset, limit },
    controls(total: number, loading: boolean, error: unknown, retry: () => unknown) {
      return (
        <div className="space-y-2 rounded border p-3">
          <label className="text-sm">
            Rechercher {label}
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
            />
          </label>
          {error ? (
            <p role="alert">
              Chargement impossible.{' '}
              <Button type="button" variant="outline" onClick={() => retry()}>
                Réessayer
              </Button>
            </p>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <span role="status">
                {loading
                  ? 'Chargement…'
                  : `${Math.min(offset + 1, total)}–${Math.min(offset + limit, total)} sur ${total}`}
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={offset === 0 || loading}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                Précédent
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={offset + limit >= total || loading}
                onClick={() => setOffset(offset + limit)}
              >
                Suivant
              </Button>
            </div>
          )}
        </div>
      );
    },
  };
}
