'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { DataTableServer } from '@/components/ui/data-table-server';
import { staffCampColumns, type StaffCampType, StaffCampActions } from './columns';
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
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  DuplicateCampDialog,
  type DuplicateFormValues,
} from '@/components/admin/camps/duplicate-camp-dialog';

type ActionType = 'publish' | 'close';
type StatusFilter = 'ALL' | 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED';

export function CampsTableClient() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [actioningCamp, setActioningCamp] = useState<{
    camp: StaffCampType;
    action: ActionType;
  } | null>(null);
  const [duplicatingCamp, setDuplicatingCamp] = useState<StaffCampType | null>(
    null
  );

  const pagination = useServerPagination({ defaultPageSize: 20 });

  const { data, isLoading } = trpc.camps.list.useQuery({
    limit: pagination.limit,
    offset: pagination.offset,
    search: searchTerm || undefined,
  });

  const { data: campTypes } = trpc.camps.listCampTypes.useQuery();

  const utils = trpc.useUtils();

  const updateMutation = trpc.camps.update.useMutation({
    onSuccess: () => {
      const action = actioningCamp?.action;
      toast.success(
        action === 'publish' ? 'ACM publié avec succès' : 'ACM fermé avec succès'
      );
      setActioningCamp(null);
      utils.camps.list.invalidate();
      router.refresh();
    },
    onError: (err) => {
      toast.error(err.message || "Impossible de mettre à jour l'ACM");
      setActioningCamp(null);
    },
  });

  const duplicateMutation = trpc.camps.duplicate.useMutation({
    onSuccess: () => {
      toast.success('ACM dupliqué avec succès');
      setDuplicatingCamp(null);
      utils.camps.list.invalidate();
      router.refresh();
    },
    onError: (err) => {
      toast.error(err.message || 'Erreur lors de la duplication');
    },
  });

  const filteredCamps = (data?.camps || []).filter((camp) => {
    if (statusFilter === 'ALL') return true;
    return camp.status === statusFilter;
  });

  async function handleAction() {
    if (!actioningCamp) return;
    try {
      await updateMutation.mutateAsync({
        id: actioningCamp.camp.id,
        status: actioningCamp.action === 'publish' ? 'PUBLISHED' : 'CLOSED',
      });
    } catch {
      // gérée par onError
    }
  }

  function handleDuplicate(values: DuplicateFormValues) {
    if (!duplicatingCamp) return;
    duplicateMutation.mutate({
      id: duplicatingCamp.id,
      name: values.name,
      campTypeId: values.campTypeId,
    });
  }

  const getActionTitle = () => {
    if (!actioningCamp) return '';
    return actioningCamp.action === 'publish' ? "Publier l'ACM" : "Fermer l'ACM";
  };

  const getActionDescription = () => {
    if (!actioningCamp) return '';
    const campName = actioningCamp.camp.name;
    return actioningCamp.action === 'publish'
      ? `Êtes-vous sûr de vouloir publier l'ACM "${campName}" ? Il sera visible par tous les parents.`
      : `Êtes-vous sûr de vouloir fermer l'ACM "${campName}" ? Aucune nouvelle inscription ne sera acceptée.`;
  };

  const columnsWithActions = staffCampColumns.map((col) => {
    if (col.id === 'actions') {
      return {
        ...col,
        cell: ({ row }: { row: { original: StaffCampType } }) => (
          <StaffCampActions
            item={row.original}
            onPublish={(camp: StaffCampType) =>
              setActioningCamp({ camp, action: 'publish' })
            }
            onClose={(camp: StaffCampType) =>
              setActioningCamp({ camp, action: 'close' })
            }
            onDuplicate={(camp: StaffCampType) => setDuplicatingCamp(camp)}
          />
        ),
      };
    }
    return col;
  });

  const isProcessing = updateMutation.isPending || duplicateMutation.isPending;
  const hasActiveFilters = statusFilter !== 'ALL';

  function resetFilters() {
    setStatusFilter('ALL');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="status-filter" className="mb-2 block">
            Filtrer par statut
          </Label>
          <Select
            value={statusFilter}
            onValueChange={(val) => setStatusFilter(val as StatusFilter)}
          >
            <SelectTrigger id="status-filter">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les statuts</SelectItem>
              <SelectItem value="DRAFT">Brouillons</SelectItem>
              <SelectItem value="PUBLISHED">Publiés</SelectItem>
              <SelectItem value="CLOSED">Fermés</SelectItem>
              <SelectItem value="CANCELLED">Annulés</SelectItem>
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

      <DataTableServer
        columns={columnsWithActions}
        data={filteredCamps}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="name"
        searchPlaceholder="Rechercher par nom ou lieu..."
        onSearchChange={setSearchTerm}
      />

      <AlertDialog
        open={!!actioningCamp}
        onOpenChange={(open) => !open && setActioningCamp(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{getActionTitle()}</AlertDialogTitle>
            <AlertDialogDescription>
              {getActionDescription()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleAction} disabled={isProcessing}>
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DuplicateCampDialog
        open={!!duplicatingCamp}
        onOpenChange={(open) => !open && setDuplicatingCamp(null)}
        onConfirm={handleDuplicate}
        originalCampName={duplicatingCamp?.name ?? ''}
        originalCampTypeId={duplicatingCamp?.campTypeId ?? ''}
        campTypes={campTypes ?? []}
        isSubmitting={duplicateMutation.isPending}
      />
    </div>
  );
}
