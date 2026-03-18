'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { DataTableServer } from '@/components/ui/data-table-server';
import {
  adminRegistrationColumns,
  type AdminRegistrationType,
  AdminRegistrationActions,
} from './columns';
import { RegistrationCancellationDialog } from './registration-cancellation-dialog';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

type StatusFilter = 'all' | 'PENDING' | 'CONFIRMED' | 'WAITLIST' | 'CANCELLED';

export function AdminRegistrationsTableClient() {
  const router = useRouter();
  const [deletingItem, setDeletingItem] = useState<AdminRegistrationType | null>(null);
  const [confirmingItem, setConfirmingItem] = useState<AdminRegistrationType | null>(null);
  const [cancellingItem, setCancellingItem] = useState<AdminRegistrationType | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [campFilter, setCampFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Hook de pagination server-side
  const pagination = useServerPagination({ defaultPageSize: 20 });

  // Query tRPC avec pagination, filtre statut et recherche
  const { data, isLoading } = trpc.registrations.list.useQuery({
    limit: pagination.limit,
    offset: pagination.offset,
    ...(statusFilter !== 'all' && { status: statusFilter }),
    ...(searchTerm && searchTerm.trim() !== '' && { search: searchTerm }),
  });

  const utils = trpc.useUtils();

  // Mutation de suppression
  const deleteMutation = trpc.registrations.delete.useMutation({
    onSuccess: () => {
      toast.success('Inscription supprimée avec succès');
      utils.registrations.list.invalidate();
      setDeletingItem(null);
      router.refresh();
    },
    onError: (err) => {
      setError(err.message || 'Impossible de supprimer cette inscription');
      toast.error('Erreur lors de la suppression');
      setDeletingItem(null);
    },
  });

  // Mutation créer facture
  const createInvoiceMutation = trpc.invoices.createFromRegistration.useMutation({
    onSuccess: (invoice) => {
      toast.success('Facture créée avec succès');
      utils.registrations.list.invalidate();
      router.push(`/dashboard/admin/invoices/${invoice.id}`);
      router.refresh();
    },
    onError: (err) => {
      toast.error(err.message || 'Erreur lors de la création de la facture');
    },
  });

  // Mutation confirmer inscription
  const confirmMutation = trpc.registrations.updateStatus.useMutation({
    onSuccess: () => {
      toast.success('Inscription confirmée avec succès');
      utils.registrations.list.invalidate();
      setConfirmingItem(null);
      router.refresh();
    },
    onError: (err) => {
      setError(err.message || 'Impossible de confirmer cette inscription');
      toast.error('Erreur lors de la confirmation');
      setConfirmingItem(null);
    },
  });


  // Extraire liste unique des camps
  const uniqueCamps = useMemo(() => {
    if (!data?.registrations) return [];
    return Array.from(new Set(data.registrations.map((r) => r.camp.name))).sort();
  }, [data?.registrations]);

  // Filtrer par camp (côté client post-fetch)
  const filteredRegistrations = useMemo(() => {
    if (!data?.registrations) return [];
    if (campFilter === 'all') return data.registrations;
    return data.registrations.filter((r) => r.camp.name === campFilter);
  }, [data?.registrations, campFilter]);

  // Enrichir les colonnes avec les callbacks
  const columnsWithActions = adminRegistrationColumns.map((col) => {
    if (col.id === 'actions') {
      return {
        ...col,
        cell: ({ row }: any) => (
          <AdminRegistrationActions
            item={row.original}
            onCreateInvoice={(item: AdminRegistrationType) => {
              createInvoiceMutation.mutate({
                registrationId: item.id,
                status: 'SENT'
              });
            }}
            onDelete={(item: AdminRegistrationType) => setDeletingItem(item)}
            onConfirm={(item: AdminRegistrationType) => setConfirmingItem(item)}
            onCancel={(item: AdminRegistrationType) => setCancellingItem(item)}
          />
        ),
      };
    }
    return col;
  });

  const hasActiveFilters = statusFilter !== 'all' || campFilter !== 'all' || searchTerm !== '';

  function resetFilters() {
    setStatusFilter('all');
    setCampFilter('all');
    setSearchTerm('');
  }

  // Callback pour la recherche
  function handleSearchChange(search: string) {
    setSearchTerm(search);
    pagination.resetToFirstPage();
  }

  function handleDelete() {
    if (!deletingItem) return;
    setError(null);
    deleteMutation.mutate({ id: deletingItem.id });
  }

  function handleConfirm() {
    if (!confirmingItem) return;
    setError(null);
    confirmMutation.mutate({ id: confirmingItem.id, status: 'CONFIRMED' });
  }

  function handleCancelSuccess() {
    toast.success('Inscription annulée avec succès');
    utils.registrations.list.invalidate();
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[180px]">
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
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="PENDING">En attente</SelectItem>
              <SelectItem value="CONFIRMED">Confirmées</SelectItem>
              <SelectItem value="WAITLIST">Liste d'attente</SelectItem>
              <SelectItem value="CANCELLED">Annulées</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="camp-filter" className="mb-2 block">
            Filtrer par camp
          </Label>
          <Select value={campFilter} onValueChange={setCampFilter}>
            <SelectTrigger id="camp-filter">
              <SelectValue placeholder="Tous les camps" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les camps</SelectItem>
              {uniqueCamps.map((camp) => (
                <SelectItem key={camp} value={camp}>
                  {camp}
                </SelectItem>
              ))}
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
        data={filteredRegistrations}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="child.firstName"
        searchPlaceholder="Rechercher par nom, email, camp..."
        onSearchChange={handleSearchChange}
      />

      {/* Dialog de confirmation de suppression */}
      <AlertDialog open={!!deletingItem} onOpenChange={() => setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer cette inscription ?
              <br />
              <br />
              Enfant : <strong>{deletingItem?.child.firstName} {deletingItem?.child.lastName}</strong>
              <br />
              Camp : <strong>{deletingItem?.camp.name}</strong>
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
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmation de validation */}
      <AlertDialog open={!!confirmingItem} onOpenChange={() => setConfirmingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer l&apos;inscription</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir valider cette inscription ?
              <br />
              <br />
              Enfant : <strong>{confirmingItem?.child.firstName} {confirmingItem?.child.lastName}</strong>
              <br />
              Camp : <strong>{confirmingItem?.camp.name}</strong>
              <br />
              <br />
              Le statut passera de &quot;En attente&quot; à &quot;Confirmée&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmMutation.isPending}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={confirmMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {confirmMutation.isPending ? 'Validation...' : 'Valider'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmation d'annulation avec gestion comptable */}
      <RegistrationCancellationDialog
        registration={cancellingItem}
        open={!!cancellingItem}
        onOpenChange={(open) => !open && setCancellingItem(null)}
        onSuccess={handleCancelSuccess}
      />
    </div>
  );
}
