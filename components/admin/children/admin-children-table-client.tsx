'use client';

import { FilterBar } from '@/components/shared/filter-bar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DataTableServer } from '@/components/ui/data-table-server';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { trpc } from '@/lib/trpc/client';
import type { Row } from '@tanstack/react-table';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { AdminChildActions, adminChildColumns, type AdminChildType } from './columns';

type AgeFilter = 'all' | '3-5' | '6-8' | '9-11' | '12-14' | '15-17';

export function AdminChildrenTableClient() {
  const router = useRouter();
  const [deletingItem, setDeletingItem] = useState<AdminChildType | null>(null);
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Hook de pagination server-side
  const pagination = useServerPagination({ defaultPageSize: 20 });

  // Convertir le filtre d'âge en ageMin/ageMax pour le serveur
  const ageRange = ageFilter !== 'all' ? ageFilter.split('-').map(Number) : null;

  // Query tRPC avec pagination, recherche et filtre âge côté serveur
  const {
    data,
    isLoading,
    error: listError,
    refetch: retryList,
  } = trpc.children.list.useQuery({
    sortBy: pagination.sortBy as 'lastName' | 'firstName' | 'birthDate' | 'createdAt' | undefined,
    sortOrder: pagination.sortOrder,
    limit: pagination.limit,
    offset: pagination.offset,
    ...(searchTerm && searchTerm.trim() !== '' && { search: searchTerm }),
    ...(ageRange && { ageMin: ageRange[0], ageMax: ageRange[1] }),
  });

  const utils = trpc.useUtils();

  // Mutation de suppression
  const deleteMutation = trpc.children.delete.useMutation({
    onSuccess: () => {
      toast.success('Enfant supprimé avec succès');
      utils.children.list.invalidate();
      setDeletingItem(null);
      router.refresh();
    },
    onError: (error) => {
      toast.error('Erreur lors de la suppression', {
        description: error.message,
      });
    },
  });

  const children = data?.children || [];

  // Enrichir les colonnes avec les callbacks
  const columnsWithActions = adminChildColumns.map((col) => {
    if (col.id === 'actions') {
      return {
        ...col,
        cell: ({ row }: { row: Row<AdminChildType> }) => (
          <AdminChildActions
            item={row.original}
            onDelete={(item: AdminChildType) => setDeletingItem(item)}
          />
        ),
      };
    }
    return col;
  });

  const hasActiveFilters = ageFilter !== 'all' || searchTerm !== '';

  function resetFilters() {
    setAgeFilter('all');
    setSearchTerm('');
  }

  // Callback pour la recherche
  function handleSearchChange(search: string) {
    setSearchTerm(search);
    pagination.resetToFirstPage();
  }

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <FilterBar>
        <div className="w-full sm:w-56">
          <Label htmlFor="age-filter" className="mb-2 block">
            Filtrer par âge
          </Label>
          <Select
            value={ageFilter}
            onValueChange={(val) => {
              setAgeFilter(val as AgeFilter);
              pagination.resetToFirstPage();
            }}
          >
            <SelectTrigger id="age-filter">
              <SelectValue placeholder="Tous les âges" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les âges</SelectItem>
              <SelectItem value="3-5">3-5 ans</SelectItem>
              <SelectItem value="6-8">6-8 ans</SelectItem>
              <SelectItem value="9-11">9-11 ans</SelectItem>
              <SelectItem value="12-14">12-14 ans</SelectItem>
              <SelectItem value="15-17">15-17 ans</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilters && (
          <div>
            <Button variant="outline" onClick={resetFilters} size="default">
              <X className="mr-2 h-4 w-4" />
              Réinitialiser
            </Button>
          </div>
        )}
      </FilterBar>

      {/* Table avec pagination */}
      <DataTableServer
        error={listError}
        onRetry={retryList}
        sortableColumns={['lastName', 'firstName', 'birthDate', 'createdAt']}
        columns={columnsWithActions}
        data={children}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="firstName"
        searchPlaceholder="Rechercher par nom ou parent..."
        search={searchTerm}
        onSearchChange={handleSearchChange}
      />

      {/* Dialog de confirmation de suppression */}
      <AlertDialog open={!!deletingItem} onOpenChange={() => setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer cet enfant ?
              <br />
              <br />
              Nom :{' '}
              <strong>
                {deletingItem?.firstName} {deletingItem?.lastName}
              </strong>
              <br />
              <br />
              Cette action est irréversible et supprimera également toutes les inscriptions
              associées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingItem) {
                  deleteMutation.mutate({ id: deletingItem.id });
                }
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
