'use client';

import type { Row } from '@tanstack/react-table';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { DataTableServer } from '@/components/ui/data-table-server';
import {
  staffInvoiceColumns,
  StaffInvoiceActions,
  type StaffInvoiceType,
} from './columns';
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
import { PaymentDialog } from '@/components/admin/payment-dialog';

export function InvoicesTableClient() {
  const router = useRouter();
  const [validatingItem, setValidatingItem] = useState<StaffInvoiceType | null>(null);
  const [deletingItem, setDeletingItem] = useState<StaffInvoiceType | null>(null);
  const [paymentDialogItem, setPaymentDialogItem] = useState<StaffInvoiceType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pagination = useServerPagination({ defaultPageSize: 20 });

  const { data, isLoading } = trpc.invoices.list.useQuery({
    limit: pagination.limit,
    offset: pagination.offset,
  });

  const utils = trpc.useUtils();

  const validateMutation = trpc.invoices.validate.useMutation({
    onSuccess: () => {
      toast.success('Facture validée avec succès');
      setValidatingItem(null);
      utils.invoices.list.invalidate();
      router.refresh();
    },
    onError: (err) => {
      setError(err.message || 'Erreur lors de la validation');
      setValidatingItem(null);
    },
  });

  const deleteMutation = trpc.invoices.delete.useMutation({
    onSuccess: () => {
      toast.success('Facture supprimée avec succès');
      setDeletingItem(null);
      utils.invoices.list.invalidate();
      router.refresh();
    },
    onError: (err) => {
      setError(err.message || 'Impossible de supprimer');
      setDeletingItem(null);
    },
  });

  const generatePDFMutation = trpc.invoices.generatePDF.useMutation({
    onSuccess: (data) => {
      toast.success('PDF généré avec succès');
      utils.invoices.list.invalidate();
      router.refresh();
      if (data?.pdfUrl) {
        window.open(data.pdfUrl, '_blank');
      }
    },
    onError: (err) => {
      toast.error(err.message || 'Erreur lors de la génération du PDF');
    },
  });

  async function handleValidate() {
    if (!validatingItem) return;
    try {
      setError(null);
      await validateMutation.mutateAsync({ id: validatingItem.id });
    } catch {
      // géré par onError
    }
  }

  async function handleDelete() {
    if (!deletingItem) return;
    try {
      setError(null);
      await deleteMutation.mutateAsync({ id: deletingItem.id });
    } catch {
      // géré par onError
    }
  }

  async function handleGeneratePDF(item: StaffInvoiceType) {
    if (item.pdfUrl) {
      window.open(item.pdfUrl, '_blank');
      return;
    }
    try {
      setError(null);
      await generatePDFMutation.mutateAsync({ id: item.id });
    } catch {
      // géré par onError
    }
  }

  const columnsWithActions = staffInvoiceColumns.map((col) => {
    if (col.id === 'actions') {
      return {
        ...col,
        cell: ({ row }: { row: Row<StaffInvoiceType> }) => (
          <StaffInvoiceActions
            item={row.original}
            onValidate={setValidatingItem}
            onDelete={setDeletingItem}
            onGeneratePDF={handleGeneratePDF}
            onRecordPayment={setPaymentDialogItem}
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
        data={data?.invoices || []}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="invoiceNumber"
        searchPlaceholder="Rechercher par numéro ou statut..."
      />

      <AlertDialog
        open={!!validatingItem}
        onOpenChange={(open) => !open && setValidatingItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Valider la facture</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous valider cette facture ?
              <br />
              <br />
              Numéro : <strong>{validatingItem?.invoiceNumber}</strong>
              <br />
              Montant :{' '}
              <strong>
                {validatingItem &&
                  parseFloat(validatingItem.totalAmount.toString()).toLocaleString('fr-FR')}{' '}
                XPF
              </strong>
              <br />
              <br />
              La facture passera du statut BROUILLON à ENVOYÉE.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={validateMutation.isPending}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleValidate}
              disabled={validateMutation.isPending}
            >
              {validateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Valider
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deletingItem}
        onOpenChange={(open) => !open && setDeletingItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer cette facture ?
              <br />
              <br />
              Numéro : <strong>{deletingItem?.invoiceNumber}</strong>
              <br />
              Montant :{' '}
              <strong>
                {deletingItem &&
                  parseFloat(deletingItem.totalAmount.toString()).toLocaleString('fr-FR')}{' '}
                XPF
              </strong>
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

      <PaymentDialog
        open={!!paymentDialogItem}
        onOpenChange={(open) => !open && setPaymentDialogItem(null)}
        invoiceId={paymentDialogItem?.id}
        onSuccess={() => {
          setPaymentDialogItem(null);
          utils.invoices.list.invalidate();
          router.refresh();
        }}
      />
    </div>
  );
}
