import { useState, useCallback, useMemo } from 'react';
import { PAGINATION_DEFAULTS } from '@/lib/constants/pagination';

interface UseServerPaginationOptions {
  /**
   * Nombre d'éléments par page
   * @default PAGINATION_DEFAULTS.DEFAULT_PAGE_SIZE (20)
   */
  defaultPageSize?: number;

  /**
   * Page initiale (1-indexed)
   * @default 1
   */
  defaultPage?: number;
}

export interface UseServerPaginationReturn {
  /** Page actuelle (1-indexed) */
  page: number;

  /** Définir la page actuelle */
  setPage: (page: number) => void;

  /** Nombre d'éléments par page */
  pageSize: number;

  /** Définir le nombre d'éléments par page */
  setPageSize: (size: number) => void;

  /** Offset pour la requête (0-indexed) */
  offset: number;

  /** Limite pour la requête */
  limit: number;

  /** Calcule le nombre total de pages */
  getTotalPages: (total: number) => number;

  /** Va à la première page */
  goToFirstPage: () => void;

  /** Va à la dernière page */
  goToLastPage: (total: number) => void;

  /** Va à la page précédente */
  goToPrevPage: () => void;

  /** Va à la page suivante */
  goToNextPage: (totalPages: number) => void;

  /** Vérifie si la page précédente existe */
  hasPrevPage: boolean;

  /** Vérifie si la page suivante existe */
  hasNextPage: (totalPages: number) => boolean;

  /** Réinitialise à la page 1 (utile après recherche/filtre) */
  resetToFirstPage: () => void;
}

/**
 * Hook personnalisé pour gérer la pagination server-side.
 *
 * Toutes les fonctions retournées sont stabilisées avec useCallback et l'objet
 * retourné est mémoïsé avec useMemo. Cela garantit des références stables entre
 * les renders, ce qui est indispensable pour éviter des boucles de re-render
 * dans les useEffect qui dépendent de l'objet pagination (ex: DataTableServer).
 *
 * @example
 * ```tsx
 * const pagination = useServerPagination({ defaultPageSize: 20 });
 *
 * const { data } = trpc.camps.list.useQuery({
 *   limit: pagination.limit,
 *   offset: pagination.offset
 * });
 *
 * const totalPages = pagination.getTotalPages(data.total);
 * ```
 */
export function useServerPagination({
  defaultPageSize = PAGINATION_DEFAULTS.DEFAULT_PAGE_SIZE,
  defaultPage = 1,
}: UseServerPaginationOptions = {}): UseServerPaginationReturn {
  const [page, setPageState] = useState(defaultPage);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);

  // Calcul de l'offset (0-indexed pour PostgreSQL)
  const offset = (page - 1) * pageSize;
  const limit = pageSize;

  // Stabilisation des fonctions : useCallback garantit une référence stable tant
  // que les dépendances n'ont pas changé. Sans cela, chaque render recrée de
  // nouvelles fonctions, ce qui invalide les useEffect qui en dépendent.

  const setPage = useCallback((newPage: number) => {
    setPageState(newPage);
  }, []);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
  }, []);

  const getTotalPages = useCallback((total: number): number => {
    if (total === 0) return 1;
    return Math.ceil(total / pageSize);
  }, [pageSize]);

  const goToFirstPage = useCallback(() => setPageState(1), []);

  const goToLastPage = useCallback((total: number) => {
    const totalPages = Math.ceil(total / pageSize) || 1;
    setPageState(totalPages);
  }, [pageSize]);

  const goToPrevPage = useCallback(() => {
    setPageState((prev) => Math.max(1, prev - 1));
  }, []);

  const goToNextPage = useCallback((totalPages: number) => {
    setPageState((prev) => Math.min(totalPages, prev + 1));
  }, []);

  const hasNextPage = useCallback(
    (totalPages: number) => page < totalPages,
    [page],
  );

  const resetToFirstPage = useCallback(() => setPageState(1), []);

  const hasPrevPage = page > 1;

  // Mémoïsation de l'objet retourné : évite qu'une nouvelle référence d'objet
  // soit créée à chaque render quand page et pageSize n'ont pas changé.
  return useMemo(
    () => ({
      page,
      setPage,
      pageSize,
      setPageSize,
      offset,
      limit,
      getTotalPages,
      goToFirstPage,
      goToLastPage,
      goToPrevPage,
      goToNextPage,
      hasPrevPage,
      hasNextPage,
      resetToFirstPage,
    }),
    [
      page,
      setPage,
      pageSize,
      setPageSize,
      offset,
      limit,
      getTotalPages,
      goToFirstPage,
      goToLastPage,
      goToPrevPage,
      goToNextPage,
      hasPrevPage,
      hasNextPage,
      resetToFirstPage,
    ],
  );
}
