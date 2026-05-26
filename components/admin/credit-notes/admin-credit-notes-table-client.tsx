'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { DataTableServer } from '@/components/ui/data-table-server';
import { adminCreditNoteColumns, type AdminCreditNoteType, AdminCreditNoteActions } from './columns';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export function AdminCreditNotesTableClient() {
  const router = useRouter();
  const [deletingItem, setDeletingItem] = useState<AdminCreditNoteType | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<{
    item: AdminCreditNoteType;
    status: 'SENT' | 'CANCELLED';
  } | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Hook de pagination server-side
  const pagination = useServerPagination({ defaultPageSize: 20 });

  // Query tRPC avec pagination, filtre statut et recherche server-side
  const { data, isLoading } = trpc.creditNotes.list.useQuery({
    limit: pagination.limit,
    offset: pagination.offset,
    ...(statusFilter !== 'all' && { status: statusFilter as 'DRAFT' | 'SENT' | 'CANCELLED' }),
    ...(searchTerm && searchTerm.trim() !== '' && { search: searchTerm }),
  });

  function handleSearchChange(search: string) {
    setSearchTerm(search);
    pagination.resetToFirstPage();
  }

  const utils = trpc.useUtils();

  // Mutation de suppression
  const deleteMutation = trpc.creditNotes.delete.useMutation({
    onSuccess: () => {
      toast.success('Avoir supprimé avec succès');
      setDeletingItem(null);
      utils.creditNotes.list.invalidate();
      router.refresh();
    },
    onError: (err) => {
      setError(err.message || 'Impossible de supprimer');
      setDeletingItem(null);
    },
  });

  // Mutation de mise à jour de statut
  const updateStatusMutation = trpc.creditNotes.updateStatus.useMutation({
    onSuccess: () => {
      toast.success('Statut mis à jour avec succès');
      setUpdatingStatus(null);
      utils.creditNotes.list.invalidate();
      router.refresh();
    },
    onError: (err) => {
      setError(err.message || 'Impossible de mettre à jour le statut');
      setUpdatingStatus(null);
    },
  });

  async function handleDelete() {
    if (!deletingItem) return;
    try {
      setError(null);
      await deleteMutation.mutateAsync({ id: deletingItem.id });
    } catch (err: any) {
      // Erreur déjà gérée par onError
    }
  }

  async function handleUpdateStatus() {
    if (!updatingStatus) return;
    try {
      setError(null);
      await updateStatusMutation.mutateAsync({
        id: updatingStatus.item.id,
        status: updatingStatus.status,
      });
    } catch (err: any) {
      // Erreur déjà gérée par onError
    }
  }

  const creditNotes = data?.creditNotes || [];

  // Enrichir les colonnes avec les callbacks
  const columnsWithActions = adminCreditNoteColumns.map((col) => {
    if (col.id === 'actions') {
      return {
        ...col,
        cell: ({ row }: any) => (
          <AdminCreditNoteActions
            item={row.original}
            onDelete={setDeletingItem}
            onUpdateStatus={(item: AdminCreditNoteType, status: 'SENT' | 'CANCELLED') => {
              setUpdatingStatus({ item, status });
            }}
          />
        ),
      };
    }
    return col;
  });

  const statusLabels = {
    SENT: 'émettre',
    CANCELLED: 'annuler',
  };

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filtre par statut */}
      <div className="flex gap-2">
        <Select value={statusFilter} onValueChange={(val) => {
          setStatusFilter(val);
          pagination.resetToFirstPage();
        }}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filtrer par statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="DRAFT">Brouillons</SelectItem>
            <SelectItem value="SENT">Émis</SelectItem>
            <SelectItem value="CANCELLED">Annulés</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTableServer
        columns={columnsWithActions}
        data={creditNotes}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="creditNoteNumber"
        searchPlaceholder="Rechercher par numéro, parent ou email..."
        onSearchChange={handleSearchChange}
      />

      {/* Dialog de confirmation de suppression */}
      <AlertDialog
        open={!!deletingItem}
        onOpenChange={(open) => !open && setDeletingItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer cet avoir ?
              <br />
              <br />
              Numéro : <strong>{deletingItem?.creditNoteNumber}</strong>
              <br />
              <br />
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmation de mise à jour de statut */}
      <AlertDialog
        open={!!updatingStatus}
        onOpenChange={(open) => !open && setUpdatingStatus(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer le changement de statut</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous {updatingStatus && statusLabels[updatingStatus.status]} cet avoir ?
              <br />
              <br />
              Numéro : <strong>{updatingStatus?.item.creditNoteNumber}</strong>
              <br />
              <br />
              Cette action modifiera le statut de l'avoir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateStatusMutation.isPending}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUpdateStatus}
              disabled={updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
