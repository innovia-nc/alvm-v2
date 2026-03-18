'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { DataTableServer } from '@/components/ui/data-table-server';
import { adminRefundColumns, type AdminRefundType, AdminRefundActions } from './columns';
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
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export function AdminRefundsTableClient() {
  const router = useRouter();
  const [deletingItem, setDeletingItem] = useState<AdminRefundType | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hook de pagination server-side
  const pagination = useServerPagination({ defaultPageSize: 20 });

  // Query tRPC avec pagination
  const { data, isLoading } = trpc.refunds.list.useQuery({
    limit: pagination.limit,
    offset: pagination.offset,
  });

  const utils = trpc.useUtils();

  // Mutation de suppression
  const deleteMutation = trpc.refunds.delete.useMutation({
    onSuccess: () => {
      toast.success('Remboursement supprimé avec succès');
      setDeletingItem(null);
      utils.refunds.list.invalidate();
      router.refresh();
    },
    onError: (err) => {
      setError(err.message || 'Impossible de supprimer');
      setDeletingItem(null);
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

  // Enrichir les colonnes avec les callbacks
  const columnsWithActions = adminRefundColumns.map((col) => {
    if (col.id === 'actions') {
      return {
        ...col,
        cell: ({ row }: any) => (
          <AdminRefundActions
            item={row.original}
            onDelete={setDeletingItem}
          />
        ),
      };
    }
    return col;
  });

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <DataTableServer
        columns={columnsWithActions}
        data={data?.refunds || []}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="reference"
        searchPlaceholder="Rechercher par facture, parent, méthode ou référence..."
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
              Êtes-vous sûr de vouloir supprimer ce remboursement ?
              <br />
              <br />
              Montant : <strong>{deletingItem && parseFloat(deletingItem.amount.toString()).toLocaleString('fr-FR')} XPF</strong>
              <br />
              Facture : <strong>{deletingItem?.payment.invoice.invoiceNumber}</strong>
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
    </div>
  );
}
