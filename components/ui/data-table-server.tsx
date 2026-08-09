/**
 * Data Table Component avec Server-Side Pagination
 *
 * Composant de table générique basé sur TanStack Table v8.
 * Fonctionnalités:
 * - Tri par colonne (clic sur header)
 * - Recherche globale (déclenchée sur « Entrée » ou bouton « Rechercher »)
 * - **Pagination SERVER-SIDE** (limit/offset)
 * - Empty state personnalisable
 * - Loading state (skeleton)
 * - Design responsive
 *
 * @example
 * ```tsx
 * const pagination = useServerPagination({ defaultPageSize: 20 });
 * const { data, isLoading } = trpc.camps.list.useQuery({
 *   limit: pagination.limit,
 *   offset: pagination.offset
 * });
 *
 * <DataTableServer
 *   columns={campColumns}
 *   data={data?.camps ?? []}
 *   totalCount={data?.total ?? 0}
 *   isLoading={isLoading}
 *   pagination={pagination}
 * />
 * ```
 */

'use client';

import * as React from 'react';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PAGINATION_DEFAULTS } from '@/lib/constants/pagination';
import type { UseServerPaginationReturn } from '@/hooks/use-server-pagination';

// ============================================================================
// TYPES
// ============================================================================

interface DataTableServerProps<TData, TValue> {
  /**
   * Définition des colonnes (TanStack Table)
   */
  columns: ColumnDef<TData, TValue>[];

  /**
   * Données à afficher (pour la page actuelle)
   */
  data: TData[];

  /**
   * Nombre TOTAL d'éléments (tous confondus, pas juste la page actuelle)
   */
  totalCount: number;

  /**
   * État de chargement
   * @default false
   */
  isLoading?: boolean;

  /**
   * Placeholder pour l'input de recherche
   * @default "Rechercher..."
   */
  searchPlaceholder?: string;

  /**
   * Clé de colonne pour la recherche globale
   * Si non fourni, désactive la recherche
   */
  searchKey?: string;

  /**
   * Objet de pagination retourné par useServerPagination
   */
  pagination: UseServerPaginationReturn;

  /**
   * Callback appelé quand l'utilisateur VALIDE sa recherche (touche « Entrée »
   * ou bouton « Rechercher »). Jamais appelé pendant la frappe.
   */
  onSearchChange?: (search: string) => void;

  /**
   * Composant personnalisé pour l'empty state
   */
  emptyState?: React.ReactNode;

  /**
   * Classe CSS personnalisée pour le conteneur
   */
  className?: string;
}

// ============================================================================
// SKELETON COMPONENT
// ============================================================================

function DataTableSkeleton({ columns }: { columns: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: columns }).map((_, j) => (
            <div
              key={j}
              className="h-12 flex-1 animate-pulse rounded-md bg-muted"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// EMPTY STATE COMPONENT
// ============================================================================

function DataTableEmpty() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
        <Search className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">Aucune donnée</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Aucun résultat ne correspond à votre recherche.
      </p>
    </div>
  );
}

// ============================================================================
// PAGINATION COMPONENT
// ============================================================================

interface DataTablePaginationProps {
  pagination: UseServerPaginationReturn;
  totalCount: number;
}

function DataTablePagination({
  pagination,
  totalCount,
}: DataTablePaginationProps) {
  const totalPages = pagination.getTotalPages(totalCount);
  const currentPage = pagination.page;

  // Générer les numéros de page à afficher
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const showPages = 5; // Nombre de pages à afficher au maximum

    if (totalPages <= showPages) {
      // Afficher toutes les pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Logique pour afficher les pages avec ellipsis
      if (currentPage <= 3) {
        // Début : 1 2 3 4 ... last
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push('ellipsis');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        // Fin : 1 ... last-3 last-2 last-1 last
        pages.push(1);
        pages.push('ellipsis');
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // Milieu : 1 ... current-1 current current+1 ... last
        pages.push(1);
        pages.push('ellipsis');
        pages.push(currentPage - 1);
        pages.push(currentPage);
        pages.push(currentPage + 1);
        pages.push('ellipsis');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex flex-col gap-4 px-2 sm:flex-row sm:items-center sm:justify-between">
      {/* Compteur de résultats et sélecteur de taille */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="text-sm text-muted-foreground">
          {totalCount === 0 ? (
            'Aucun résultat'
          ) : (
            <>
              {(currentPage - 1) * pagination.pageSize + 1} -{' '}
              {Math.min(currentPage * pagination.pageSize, totalCount)} sur{' '}
              {totalCount} résultat{totalCount > 1 ? 's' : ''}
            </>
          )}
        </div>

        {/* Sélecteur de taille de page */}
        {totalCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Afficher</span>
            <Select
              value={pagination.pageSize.toString()}
              onValueChange={(value) => {
                pagination.setPageSize(Number(value));
                pagination.resetToFirstPage();
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGINATION_DEFAULTS.PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">par page</span>
          </div>
        )}
      </div>

      {/* Navigation pagination */}
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            {/* Bouton Précédent */}
            <PaginationItem>
              <PaginationPrevious
                onClick={(e) => {
                  e.preventDefault();
                  if (pagination.hasPrevPage) {
                    pagination.goToPrevPage();
                  }
                }}
                className={cn(
                  !pagination.hasPrevPage &&
                    'pointer-events-none opacity-50'
                )}
                href="#"
              />
            </PaginationItem>

            {/* Numéros de pages */}
            {pageNumbers.map((page, index) => (
              <PaginationItem key={`page-${page}-${index}`}>
                {page === 'ellipsis' ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink
                    onClick={(e) => {
                      e.preventDefault();
                      pagination.setPage(page);
                    }}
                    isActive={page === currentPage}
                    href="#"
                  >
                    {page}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))}

            {/* Bouton Suivant */}
            <PaginationItem>
              <PaginationNext
                onClick={(e) => {
                  e.preventDefault();
                  if (pagination.hasNextPage(totalPages)) {
                    pagination.goToNextPage(totalPages);
                  }
                }}
                className={cn(
                  !pagination.hasNextPage(totalPages) &&
                    'pointer-events-none opacity-50'
                )}
                href="#"
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

// ============================================================================
// DATA TABLE SERVER COMPONENT
// ============================================================================

export function DataTableServer<TData, TValue>({
  columns,
  data,
  totalCount,
  isLoading = false,
  searchPlaceholder = 'Rechercher...',
  searchKey,
  pagination,
  onSearchChange,
  emptyState,
  className,
}: DataTableServerProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});

  // Recherche : la saisie (`searchValue`) est purement locale. Elle n'est
  // remontée au serveur qu'à la VALIDATION explicite — touche « Entrée » ou
  // bouton « Rechercher » (US-UX-01). Aucun debounce, donc aucun appel réseau
  // pendant la frappe. `submittedSearch` porte le dernier terme réellement
  // soumis : c'est lui qui pilote l'empty state et le message « aucun résultat ».
  const [searchValue, setSearchValue] = React.useState('');
  const [submittedSearch, setSubmittedSearch] = React.useState('');

  const submitSearch = React.useCallback(() => {
    const term = searchValue.trim();

    // Rien à faire si le terme soumis est identique au précédent : évite un
    // refetch et un retour en page 1 intempestifs sur un « Entrée » répété.
    if (term === submittedSearch) return;

    setSubmittedSearch(term);
    onSearchChange?.(term);
    pagination.setPage(1);
  }, [searchValue, submittedSearch, onSearchChange, pagination]);

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    // Empêche la soumission du formulaire parent quand la table est imbriquée.
    event.preventDefault();
    submitSearch();
  }

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    // IMPORTANT: Pas de getPaginationRowModel() car pagination server-side
    manualPagination: true,
    pageCount: pagination.getTotalPages(totalCount),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
  });

  // ============================================================================
  // RENDER
  // ============================================================================
  // Le champ de recherche est rendu une seule fois, à une position STABLE dans
  // l'arbre, quel que soit l'état (chargement / vide / table). C'est volontaire :
  // si l'input était démonté ou désactivé pendant un refetch (isLoading), il
  // perdait le focus et la saisie en cours, obligeant à taper très vite ou à
  // coller le texte. En le gardant monté, React préserve focus + valeur pendant
  // que seul le contenu en dessous bascule.

  return (
    <div className={cn('space-y-4', className)}>
      {/* Search Input (toujours monté, jamais désactivé) */}
      {searchKey && (
        <div className="flex items-center gap-2">
          <Input
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            aria-label={searchPlaceholder}
            className="max-w-sm"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={submitSearch}
            aria-label="Rechercher"
          >
            <Search className="mr-2 h-4 w-4" />
            Rechercher
          </Button>
        </div>
      )}

      {isLoading ? (
        <DataTableSkeleton columns={columns.length} />
      ) : totalCount === 0 && !submittedSearch ? (
        emptyState ?? <DataTableEmpty />
      ) : (
        <>
          {/* Table */}
          <div className="w-full overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const canSort = header.column.getCanSort();

                      return (
                        <TableHead key={header.id}>
                          {header.isPlaceholder ? null : (
                            <div
                              className={cn(
                                canSort &&
                                  'flex cursor-pointer select-none items-center gap-2',
                                !canSort && 'flex items-center'
                              )}
                              onClick={
                                canSort
                                  ? header.column.getToggleSortingHandler()
                                  : undefined
                              }
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                              {canSort && (
                                <span className="ml-auto">
                                  {header.column.getIsSorted() === 'asc' ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : header.column.getIsSorted() ===
                                    'desc' ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <div className="h-4 w-4" />
                                  )}
                                </span>
                              )}
                            </div>
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {data.length > 0 ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      {submittedSearch
                        ? `Aucun résultat pour « ${submittedSearch} »`
                        : 'Aucun résultat'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Server-Side */}
          <DataTablePagination pagination={pagination} totalCount={totalCount} />
        </>
      )}
    </div>
  );
}
