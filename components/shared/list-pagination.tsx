import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function ListPagination({
  page,
  total,
  basePath,
}: {
  page: number;
  total: number;
  basePath: string;
}) {
  const pages = Math.max(1, Math.ceil(total / 20));
  if (total === 0 && page === 1) return null;
  const href = (next: number) => `${basePath}${basePath.includes('?') ? '&' : '?'}page=${next}`;
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm text-muted-foreground"
    >
      <span>
        {total} élément{total > 1 ? 's' : ''}
      </span>
      {(pages > 1 || page > 1) && (
        <div className="flex flex-wrap items-center gap-3">
          {page > 1 && (
            <Button asChild variant="outline" size="sm">
              <Link href={href(page - 1)}>Précédent</Link>
            </Button>
          )}
          <span>
            Page {page} sur {pages}
          </span>
          {page < pages && (
            <Button asChild variant="outline" size="sm">
              <Link href={href(page + 1)}>Suivant</Link>
            </Button>
          )}
        </div>
      )}
    </nav>
  );
}
