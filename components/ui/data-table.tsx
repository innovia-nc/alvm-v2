'use client';

import { EmptyState } from '@/components/shared/empty-state';
/**
 * Data Table Component (Generic & Reusable)
 *
 * Composant de table générique basé sur TanStack Table v8.
 * Fonctionnalités:
 * - Tri par colonne (clic sur header)
 * - Recherche globale (input)
 * - Pagination côté client
 * - Empty state personnalisable
 * - Loading state (skeleton)
 * - Design responsive
 */

import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown, ChevronDown, ChevronUp, Search } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface DataTableProps<TData, TValue> {
  /**
   * Définition des colonnes (TanStack Table)
   */
  columns: ColumnDef<TData, TValue>[];

  /**
   * Données à afficher
   */
  data: TData[];

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
   * Nombre de lignes par page
   * @default 10
   */
  pageSize?: number;

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
            <div key={j} className="h-12 flex-1 animate-pulse rounded-md bg-muted" />
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
    <EmptyState
      title="Aucune donnée"
      description="Les éléments ajoutés apparaîtront ici. Si un filtre est actif, essayez de le modifier."
      icon={Search}
    />
  );
}

// ============================================================================
// DATA TABLE COMPONENT
// ============================================================================

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  searchPlaceholder = 'Rechercher...',
  searchKey,
  pageSize = 10,
  emptyState,
  className,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    sortDescFirst: false,
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
    initialState: {
      pagination: {
        pageSize,
      },
    },
  });

  // ============================================================================
  // LOADING STATE
  // ============================================================================

  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        {searchKey && (
          <div className="flex items-center">
            <Input
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              disabled
              className="max-w-sm"
            />
          </div>
        )}
        <DataTableSkeleton columns={columns.length} />
      </div>
    );
  }

  // ============================================================================
  // EMPTY STATE
  // ============================================================================

  if (data.length === 0) {
    return (
      <div className={cn('space-y-4', className)}>
        {searchKey && (
          <div className="flex items-center">
            <Input
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ''}
              onChange={(event) => table.getColumn(searchKey)?.setFilterValue(event.target.value)}
              className="max-w-sm"
            />
          </div>
        )}
        {emptyState ?? <DataTableEmpty />}
      </div>
    );
  }

  // ============================================================================
  // TABLE RENDER
  // ============================================================================

  return (
    <div className={cn('space-y-4', className)}>
      {/* Search Input */}
      {searchKey && (
        <div className="flex items-center">
          <Input
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ''}
            onChange={(event) => table.getColumn(searchKey)?.setFilterValue(event.target.value)}
            className="max-w-sm"
          />
        </div>
      )}

      {/* Table */}
      <div className="w-full overflow-x-auto rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();

                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={
                        canSort
                          ? header.column.getIsSorted() === 'asc'
                            ? 'ascending'
                            : header.column.getIsSorted() === 'desc'
                              ? 'descending'
                              : 'none'
                          : undefined
                      }
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-sm py-2 text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span className="ml-auto" aria-hidden="true">
                            {header.column.getIsSorted() === 'asc' ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : header.column.getIsSorted() === 'desc' ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ArrowUpDown className="h-4 w-4" />
                            )}
                          </span>
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Aucun résultat.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {table.getPageCount() > 1 && (
        <div className="flex flex-col gap-3 px-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {table.getFilteredRowModel().rows.length} résultat
            {table.getFilteredRowModel().rows.length > 1 ? 's' : ''}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Précédent
            </Button>
            <div className="flex items-center gap-1 text-sm">
              <span className="text-muted-foreground">Page</span>
              <span className="font-medium">{table.getState().pagination.pageIndex + 1}</span>
              <span className="text-muted-foreground">sur</span>
              <span className="font-medium">{table.getPageCount()}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Suivant
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
