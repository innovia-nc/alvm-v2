import Link from 'next/link';
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
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-4 py-4">
      <span>
        {total} résultats — page {page} / {pages}
      </span>
      {page > 1 && (
        <Link
          className="underline"
          href={`${basePath}${basePath.includes('?') ? '&' : '?'}page=${page - 1}`}
        >
          Précédent
        </Link>
      )}
      {page < pages && (
        <Link
          className="underline"
          href={`${basePath}${basePath.includes('?') ? '&' : '?'}page=${page + 1}`}
        >
          Suivant
        </Link>
      )}
    </nav>
  );
}
