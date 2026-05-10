'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { DataTableServer } from '@/components/ui/data-table-server';
import {
  staffRegistrationColumns,
  type StaffRegistrationType,
  StaffRegistrationActions,
} from './columns';
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
import { RegistrationStatusDialog } from './registration-status-dialog';
import { CancelRegistrationDialog } from './cancel-registration-dialog';

type StatusFilter = 'all' | 'PENDING' | 'CONFIRMED' | 'WAITLIST' | 'CANCELLED';

export function RegistrationsTableClient() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const createInvoiceMutation = trpc.invoices.createFromRegistration.useMutation({
    onSuccess: (invoice) => {
      toast.success('Facture créée avec succès');
      utils.registrations.list.invalidate();
      router.push(`/dashboard/staff/invoices/${invoice.id}`);
    },
    onError: (err) => {
      toast.error(err.message || 'Erreur lors de la création de la facture');
    },
  });

  // States pour les 2 dialogs
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    registrationId: string;
    childName: string;
    campName: string;
    currentStatus: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'WAITLIST';
    newStatus: 'CONFIRMED' | 'WAITLIST';
  } | null>(null);

  const [cancelDialog, setCancelDialog] = useState<{
    open: boolean;
    registrationId: string;
    childName: string;
    campName: string;
    hasInvoice: boolean;
  } | null>(null);

  // Hook de pagination server-side
  const pagination = useServerPagination({ defaultPageSize: 20 });

  // Query tRPC avec pagination et filtre statut
  const { data, isLoading } = trpc.registrations.list.useQuery({
    limit: pagination.limit,
    offset: pagination.offset,
    ...(statusFilter !== 'all' && { status: statusFilter }),
  });

  // Enrichir les colonnes avec les callbacks
  const columnsWithActions = staffRegistrationColumns.map((col) => {
    if (col.id === 'actions') {
      return {
        ...col,
        cell: ({ row }: any) => (
          <StaffRegistrationActions
            item={row.original}
            onCreateInvoice={(item: StaffRegistrationType) =>
              createInvoiceMutation.mutate({
                registrationId: item.id,
                status: 'SENT',
              })
            }
            onConfirm={(item: StaffRegistrationType) =>
              setConfirmDialog({
                open: true,
                registrationId: item.id,
                childName: `${item.child.firstName} ${item.child.lastName}`,
                campName: item.camp.name,
                currentStatus: item.status,
                newStatus: 'CONFIRMED',
              })
            }
            onWaitlist={(item: StaffRegistrationType) =>
              setConfirmDialog({
                open: true,
                registrationId: item.id,
                childName: `${item.child.firstName} ${item.child.lastName}`,
                campName: item.camp.name,
                currentStatus: item.status,
                newStatus: 'WAITLIST',
              })
            }
            onCancel={(item: StaffRegistrationType) =>
              setCancelDialog({
                open: true,
                registrationId: item.id,
                childName: `${item.child.firstName} ${item.child.lastName}`,
                campName: item.camp.name,
                hasInvoice: !!item.invoiceId,
              })
            }
          />
        ),
      };
    }
    return col;
  });

  const hasActiveFilters = statusFilter !== 'all';

  function resetFilters() {
    setStatusFilter('all');
  }

  return (
    <div className="space-y-4">
      {/* Filtres */}
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
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="PENDING">En attente</SelectItem>
              <SelectItem value="CONFIRMED">Confirmées</SelectItem>
              <SelectItem value="WAITLIST">Liste d'attente</SelectItem>
              <SelectItem value="CANCELLED">Annulées</SelectItem>
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
        data={data?.registrations || []}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="child.firstName"
        searchPlaceholder="Rechercher par nom d'enfant, parent ou camp..."
      />

      {/* Dialog de confirmation de statut (Confirmer / Mettre en attente) */}
      {confirmDialog && (
        <RegistrationStatusDialog
          registrationId={confirmDialog.registrationId}
          currentStatus={confirmDialog.currentStatus}
          childName={confirmDialog.childName}
          campName={confirmDialog.campName}
          newStatus={confirmDialog.newStatus}
          open={confirmDialog.open}
          onOpenChange={(open) => !open && setConfirmDialog(null)}
        />
      )}

      {/* Dialog d'annulation */}
      {cancelDialog && (
        <CancelRegistrationDialog
          registrationId={cancelDialog.registrationId}
          childName={cancelDialog.childName}
          campName={cancelDialog.campName}
          hasInvoice={cancelDialog.hasInvoice}
          open={cancelDialog.open}
          onOpenChange={(open) => !open && setCancelDialog(null)}
        />
      )}
    </div>
  );
}
