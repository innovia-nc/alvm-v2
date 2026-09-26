'use client';

import { FilterBar } from '@/components/shared/filter-bar';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AdminCreditNoteActions,
  adminCreditNoteColumns,
  type AdminCreditNoteType,
} from './columns';

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
  const {
    data,
    isLoading,
    error: listError,
    refetch: retryList,
  } = trpc.creditNotes.list.useQuery({
    sortBy: pagination.sortBy as 'creditNoteNumber' | 'issueDate' | 'totalAmount' | undefined,
    sortOrder: pagination.sortOrder,
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

  // Mutation de génération du PDF (TD-007) : archive le document puis l'ouvre.
  const generatePDFMutation = trpc.creditNotes.generatePDF.useMutation({
    onSuccess: (result) => {
      toast.success("PDF de l'avoir généré avec succès");
      utils.creditNotes.list.invalidate();
      router.refresh();
      if (result?.pdfUrl) {
        window.open(result.pdfUrl, '_blank');
      }
    },
    onError: (err) => {
      setError(err.message || 'Erreur lors de la génération du PDF');
      toast.error(err.message || 'Erreur lors de la génération du PDF');
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
    } catch {
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
    } catch {
      // Erreur déjà gérée par onError
    }
  }

  const creditNotes = data?.creditNotes || [];

  // Enrichir les colonnes avec les callbacks
  const columnsWithActions = adminCreditNoteColumns.map((col) => {
    if (col.id === 'actions') {
      return {
        ...col,
        cell: ({ row }: { row: Row<AdminCreditNoteType> }) => (
          <AdminCreditNoteActions
            item={row.original}
            onDelete={setDeletingItem}
            onUpdateStatus={(item: AdminCreditNoteType, status: 'SENT' | 'CANCELLED') => {
              setUpdatingStatus({ item, status });
            }}
            onGeneratePDF={(item: AdminCreditNoteType) => {
              setError(null);
              generatePDFMutation.mutate({ id: item.id });
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
      <FilterBar>
        <div className="grid w-full gap-2 sm:w-56">
          <Label htmlFor="list-status-filter">Statut</Label>
          <Select
            value={statusFilter}
            onValueChange={(val) => {
              setStatusFilter(val);
              pagination.resetToFirstPage();
            }}
          >
            <SelectTrigger className="w-full" id="list-status-filter">
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
      </FilterBar>

      <DataTableServer
        error={listError}
        onRetry={retryList}
        sortableColumns={['creditNoteNumber', 'issueDate', 'totalAmount']}
        columns={columnsWithActions}
        data={creditNotes}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="creditNoteNumber"
        searchPlaceholder="Rechercher par numéro, parent ou email..."
        search={searchTerm}
        onSearchChange={handleSearchChange}
      />

      {/* Dialog de confirmation de suppression */}
      <AlertDialog open={!!deletingItem} onOpenChange={(open) => !open && setDeletingItem(null)}>
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
            <AlertDialogCancel disabled={deleteMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
            <AlertDialogCancel disabled={updateStatusMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUpdateStatus}
              disabled={updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
