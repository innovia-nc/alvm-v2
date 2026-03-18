import { useState } from 'react';
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
 * Hook personnalisé pour gérer la pagination server-side
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
  const [page, setPage] = useState(defaultPage);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  // Calcul de l'offset (0-indexed pour PostgreSQL)
  const offset = (page - 1) * pageSize;
  const limit = pageSize;

  // Calcule le nombre total de pages
  const getTotalPages = (total: number): number => {
    if (total === 0) return 1;
    return Math.ceil(total / pageSize);
  };

  // Navigation
  const goToFirstPage = () => setPage(1);

  const goToLastPage = (total: number) => {
    const totalPages = getTotalPages(total);
    setPage(totalPages);
  };

  const goToPrevPage = () => {
    setPage((prev) => Math.max(1, prev - 1));
  };

  const goToNextPage = (totalPages: number) => {
    setPage((prev) => Math.min(totalPages, prev + 1));
  };

  // Helpers
  const hasPrevPage = page > 1;
  const hasNextPage = (totalPages: number) => page < totalPages;

  // Reset to first page (useful after search/filter change)
  const resetToFirstPage = () => setPage(1);

  return {
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
  };
}
