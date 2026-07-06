'use client';

import type { Row } from '@tanstack/react-table';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { DataTableServer } from '@/components/ui/data-table-server';
import { staffChildColumns, type StaffChildType, StaffChildActions } from './columns';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import { toast } from 'sonner';

type AgeFilter = 'all' | '3-5' | '6-8' | '9-11' | '12-14' | '15-17';

export function ChildrenTableClient() {
  const router = useRouter();
  const [deletingItem, setDeletingItem] = useState<StaffChildType | null>(null);
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Hook de pagination server-side
  const pagination = useServerPagination({ defaultPageSize: 20 });

  // Query tRPC avec pagination et recherche
  const { data, isLoading } = trpc.children.list.useQuery({
    limit: pagination.limit,
    offset: pagination.offset,
    ...(searchTerm && searchTerm.trim() !== '' && { search: searchTerm }),
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

  // Calculer l'âge
  function calculateAge(birthDate: Date): number {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  // Filtrer les enfants selon l'âge
  const filteredChildren = (data?.children || []).filter((child) => {
    // Filtre par âge
    if (ageFilter === 'all') return true;

    const age = calculateAge(child.birthDate);
    if (ageFilter === '3-5') return age >= 3 && age <= 5;
    else if (ageFilter === '6-8') return age >= 6 && age <= 8;
    else if (ageFilter === '9-11') return age >= 9 && age <= 11;
    else if (ageFilter === '12-14') return age >= 12 && age <= 14;
    else if (ageFilter === '15-17') return age >= 15 && age <= 17;

    return true;
  });

  // Enrichir les colonnes avec les callbacks
  const columnsWithActions = staffChildColumns.map((col) => {
    if (col.id === 'actions') {
      return {
        ...col,
        cell: ({ row }: { row: Row<StaffChildType> }) => (
          <StaffChildActions
            item={row.original}
            onDelete={(item: StaffChildType) => setDeletingItem(item)}
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
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="age-filter" className="mb-2 block">
            Filtrer par âge
          </Label>
          <Select value={ageFilter} onValueChange={(val) => setAgeFilter(val as AgeFilter)}>
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
      </div>

      {/* Table avec pagination */}
      <DataTableServer
        columns={columnsWithActions}
        data={filteredChildren}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="firstName"
        searchPlaceholder="Rechercher par nom ou parent..."
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
              Nom : <strong>{deletingItem?.firstName} {deletingItem?.lastName}</strong>
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
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
