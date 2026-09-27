'use client';

import { PaymentDialog } from '@/components/admin/payment-dialog';
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
import { Loader2, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { AdminInvoiceActions, adminInvoiceColumns, type AdminInvoiceType } from './columns';

type InvoiceStatusFilter = 'all' | 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export function AdminInvoicesTableClient() {
  const router = useRouter();
  const initialStatus = useSearchParams().get('status');
  const [deletingItem, setDeletingItem] = useState<AdminInvoiceType | null>(null);
  const [sendingEmailItem, setSendingEmailItem] = useState<AdminInvoiceType | null>(null);
  const [validatingItem, setValidatingItem] = useState<AdminInvoiceType | null>(null);
  const [paymentDialogItem, setPaymentDialogItem] = useState<AdminInvoiceType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatusFilter>(
    ['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED'].includes(initialStatus ?? '')
      ? (initialStatus as InvoiceStatusFilter)
      : 'all',
  );
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Hook de pagination server-side
  const pagination = useServerPagination({ defaultPageSize: 20 });

  // Query tRPC avec pagination, filtres et recherche
  const {
    data,
    isLoading,
    error: listError,
    refetch: retryList,
  } = trpc.invoices.list.useQuery({
    sortBy: pagination.sortBy as
      | 'invoiceNumber'
      | 'issueDate'
      | 'dueDate'
      | 'totalAmount'
      | 'parent'
      | undefined,
    sortOrder: pagination.sortOrder,
    limit: pagination.limit,
    offset: pagination.offset,
    ...(statusFilter !== 'all' && { status: statusFilter }),
    ...(searchTerm && searchTerm.trim() !== '' && { search: searchTerm }),
  });

  // Callback pour la recherche (debounce + reset page géré par DataTableServer)
  function handleSearchChange(search: string) {
    setSearchTerm(search);
    pagination.resetToFirstPage();
  }

  const utils = trpc.useUtils();

  // Mutation de suppression
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

  // Mutation de génération PDF
  const generatePDFMutation = trpc.invoices.generatePDF.useMutation({
    onSuccess: (data) => {
      toast.success('PDF généré avec succès');
      utils.invoices.list.invalidate();
      router.refresh();

      // Ouvrir le PDF généré si l'URL est retournée
      if (data?.pdfUrl) {
        window.open(data.pdfUrl, '_blank');
      }
    },
    onError: (err) => {
      setError(err.message || 'Erreur lors de la génération du PDF');
      toast.error(err.message || 'Erreur lors de la génération du PDF');
    },
  });

  // TD-008 : état de la configuration email — le dialogue de confirmation le
  // dit explicitement plutôt que de laisser l'envoi échouer.
  const { data: emailStatus } = trpc.settings.isEmailConfigured.useQuery();
  const emailConfigured = emailStatus?.configured ?? true;

  // Mutation d'envoi email
  const sendEmailMutation = trpc.invoices.sendEmail.useMutation({
    onSuccess: (data) => {
      toast.success(`Email envoyé à ${data.sentTo}`);
      setSendingEmailItem(null);
      utils.invoices.list.invalidate();
      router.refresh();
    },
    onError: (err) => {
      setError(err.message || "Erreur lors de l'envoi de l'email");
      setSendingEmailItem(null);
    },
  });

  // Mutation de validation
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

  async function handleDelete() {
    if (!deletingItem) return;
    try {
      setError(null);
      await deleteMutation.mutateAsync({ id: deletingItem.id });
    } catch {
      // Erreur déjà gérée par onError
    }
  }

  async function handleSendEmail() {
    if (!sendingEmailItem) return;
    try {
      setError(null);
      await sendEmailMutation.mutateAsync({ id: sendingEmailItem.id });
    } catch {
      // Erreur déjà gérée par onError
    }
  }

  async function handleValidate() {
    if (!validatingItem) return;
    try {
      setError(null);
      await validateMutation.mutateAsync({ id: validatingItem.id });
    } catch {
      // Erreur déjà gérée par onError
    }
  }

  // Réinitialiser les filtres
  const resetFilters = () => {
    setStatusFilter('all');
    setSearchTerm('');
    pagination.setPage(1);
  };

  const hasActiveFilters = statusFilter !== 'all' || searchTerm !== '';

  // Enrichir les colonnes avec les callbacks
  // Fonction pour gérer le téléchargement direct du PDF
  const handleDirectPDFDownload = async (item: AdminInvoiceType) => {
    if (!item.pdfUrl) {
      // Si pas de PDF, on le génère puis on l'ouvre automatiquement
      try {
        setError(null);
        await generatePDFMutation.mutateAsync({ id: item.id });
        // Le PDF s'ouvre automatiquement via onSuccess de la mutation
      } catch {
        // Erreur déjà gérée par onError de la mutation
      }
    } else {
      // Si PDF existe, on l'ouvre directement
      window.open(item.pdfUrl, '_blank');
    }
  };

  const columnsWithActions = adminInvoiceColumns.map((col) => {
    if (col.id === 'actions') {
      return {
        ...col,
        cell: ({ row }: { row: Row<AdminInvoiceType> }) => (
          <AdminInvoiceActions
            item={row.original}
            onDelete={setDeletingItem}
            onGeneratePDF={handleDirectPDFDownload}
            onSendEmail={setSendingEmailItem}
            onValidate={setValidatingItem}
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

      {/* Filtres */}
      <div className="flex flex-wrap gap-4 items-end">
        <FilterBar>
          <div className="grid w-full gap-2 sm:w-56">
            <Label htmlFor="list-status-filter">Statut</Label>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as InvoiceStatusFilter)}
            >
              <SelectTrigger id="list-status-filter">
                <SelectValue placeholder="Filtrer par statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="DRAFT">Brouillons</SelectItem>
                <SelectItem value="SENT">Émises</SelectItem>
                <SelectItem value="PAID">Payées</SelectItem>
                <SelectItem value="OVERDUE">En retard</SelectItem>
                <SelectItem value="CANCELLED">Annulées</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </FilterBar>

        {hasActiveFilters && (
          <Button variant="outline" onClick={resetFilters}>
            <X className="mr-2 h-4 w-4" />
            Réinitialiser
          </Button>
        )}
      </div>

      <DataTableServer
        error={listError}
        onRetry={retryList}
        sortableColumns={['invoiceNumber', 'issueDate', 'dueDate', 'totalAmount', 'parent']}
        columns={columnsWithActions}
        data={data?.invoices || []}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="invoiceNumber"
        searchPlaceholder="Rechercher par numéro, nom ou email du parent..."
        search={searchTerm}
        onSearchChange={handleSearchChange}
      />

      {/* Dialog de confirmation de suppression */}
      <AlertDialog open={!!deletingItem} onOpenChange={(open) => !open && setDeletingItem(null)}>
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

      {/* Dialog de génération PDF supprimé - téléchargement direct maintenant */}

      {/* Dialog de confirmation d'envoi email */}
      <AlertDialog
        open={!!sendingEmailItem}
        onOpenChange={(open) => !open && setSendingEmailItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Envoyer par email</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous envoyer cette facture au parent par email ?
              <br />
              <br />
              Numéro : <strong>{sendingEmailItem?.invoiceNumber}</strong>
              <br />
              Destinataire : <strong>{sendingEmailItem?.parent.email}</strong>
              {!emailConfigured && (
                <div className="mt-4 rounded-lg bg-yellow-50 p-3 text-yellow-900">
                  <strong>Envoi indisponible :</strong> la configuration email de l'environnement
                  est incomplète. Contactez l'administrateur.
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendEmailMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSendEmail}
              disabled={sendEmailMutation.isPending || !emailConfigured}
            >
              {sendEmailMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Envoyer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmation de validation */}
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
            <AlertDialogCancel disabled={validateMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleValidate} disabled={validateMutation.isPending}>
              {validateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Valider
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog d'enregistrement de paiement */}
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
