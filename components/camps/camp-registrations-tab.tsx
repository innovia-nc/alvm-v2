'use client';

import type { Row } from '@tanstack/react-table';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { DataTableServer } from '@/components/ui/data-table-server';
import {
  createCampRegistrationColumns,
  CampRegistrationActions,
  type CampRegistrationType,
} from './camp-registrations-columns';
import { RegistrationCancellationDialog } from '@/components/admin/registrations/registration-cancellation-dialog';
import type { AdminRegistrationType } from '@/components/admin/registrations/columns';
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
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

type StatusFilter = 'all' | 'PENDING' | 'CONFIRMED' | 'WAITLIST' | 'CANCELLED';

interface CampRegistrationsTabProps {
  campId: string;
  basePath: string;
}

export function CampRegistrationsTab({ campId, basePath }: CampRegistrationsTabProps) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingItem, setDeletingItem] = useState<CampRegistrationType | null>(null);
  const [confirmingItem, setConfirmingItem] = useState<CampRegistrationType | null>(null);
  const [cancellingItem, setCancellingItem] = useState<CampRegistrationType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pagination = useServerPagination({ defaultPageSize: 20 });

  const { data, isLoading } = trpc.registrations.list.useQuery({
    campId,
    limit: pagination.limit,
    offset: pagination.offset,
    ...(statusFilter !== 'all' && { status: statusFilter }),
    ...(searchTerm && searchTerm.trim() !== '' && { search: searchTerm }),
  });

  const utils = trpc.useUtils();

  // Mutations
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

  const createInvoiceMutation = trpc.invoices.createFromRegistration.useMutation({
    onSuccess: (invoice) => {
      toast.success('Facture créée avec succès');
      utils.registrations.list.invalidate();
      const invoicesPath = basePath.replace('/camps', '/invoices');
      router.push(`${invoicesPath}/${invoice.id}`);
      router.refresh();
    },
    onError: (err) => {
      toast.error(err.message || 'Erreur lors de la création de la facture');
    },
  });

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

  // Derive registrations path from basePath
  const registrationsPath = basePath.replace('/camps', '/registrations');

  const baseColumns = useMemo(
    () => createCampRegistrationColumns(basePath),
    [basePath]
  );

  // Override actions column with callbacks
  const columns = baseColumns.map((col) => {
    if (col.id === 'actions') {
      return {
        ...col,
        cell: ({ row }: { row: Row<CampRegistrationType> }) => (
          <CampRegistrationActions
            item={row.original}
            registrationsPath={registrationsPath}
            onCreateInvoice={(item: CampRegistrationType) => {
              createInvoiceMutation.mutate({
                registrationId: item.id,
                status: 'SENT',
              });
            }}
            onDelete={(item: CampRegistrationType) => setDeletingItem(item)}
            onConfirm={(item: CampRegistrationType) => setConfirmingItem(item)}
            onCancel={(item: CampRegistrationType) => setCancellingItem(item)}
          />
        ),
      };
    }
    return col;
  });

  const registrations: CampRegistrationType[] = useMemo(() => {
    if (!data?.registrations) return [];
    return data.registrations.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      child: r.child,
      parent: r.parent,
      camp: r.camp,
      totalAmount: r.totalAmount,
      invoiceId: r.invoiceId,
    }));
  }, [data?.registrations]);

  const hasActiveFilters = statusFilter !== 'all' || searchTerm !== '';

  function handleSearchChange(search: string) {
    setSearchTerm(search);
    pagination.resetToFirstPage();
  }

  function resetFilters() {
    setStatusFilter('all');
    setSearchTerm('');
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

      <div className="flex flex-wrap gap-4 items-end">
        <div className="min-w-[180px]">
          <Label htmlFor="reg-status-filter" className="mb-2 block">
            Filtrer par statut
          </Label>
          <Select
            value={statusFilter}
            onValueChange={(val) => {
              setStatusFilter(val as StatusFilter);
              pagination.resetToFirstPage();
            }}
          >
            <SelectTrigger id="reg-status-filter">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="PENDING">En attente</SelectItem>
              <SelectItem value="CONFIRMED">Confirmées</SelectItem>
              <SelectItem value="WAITLIST">Liste d&apos;attente</SelectItem>
              <SelectItem value="CANCELLED">Annulées</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilters && (
          <Button variant="outline" onClick={resetFilters} size="default">
            <X className="mr-2 h-4 w-4" />
            Réinitialiser
          </Button>
        )}
      </div>

      <DataTableServer
        columns={columns}
        data={registrations}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="child.firstName"
        searchPlaceholder="Rechercher par nom..."
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

      {/* Dialog d'annulation avec gestion comptable */}
      <RegistrationCancellationDialog
        registration={cancellingItem as AdminRegistrationType | null}
        open={!!cancellingItem}
        onOpenChange={(open) => !open && setCancellingItem(null)}
        onSuccess={handleCancelSuccess}
      />
    </div>
  );
}
