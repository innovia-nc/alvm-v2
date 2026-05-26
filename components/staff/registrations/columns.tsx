'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  MoreHorizontal,
  Eye,
  FileText,
} from 'lucide-react';
import Link from 'next/link';
import { StatusBadge } from '@/components/shared/status-badge';

type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'CREDITED';

// ============================================================================
// TYPES
// ============================================================================

export type StaffRegistrationType = {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'WAITLIST';
  createdAt: Date;
  updatedAt: Date;
  camp: {
    name: string;
  };
  child: {
    firstName: string;
    lastName: string;
  };
  parent: {
    firstName: string;
    lastName: string;
    email: string;
  };
  totalAmount: number;
  invoiceId: string | null;
  invoiceStatus: InvoiceStatus | null;
};

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

export const staffRegistrationColumns: ColumnDef<StaffRegistrationType>[] = [
  {
    accessorKey: 'child',
    header: 'Enfant',
    cell: ({ row }) => {
      const child = row.original.child;
      return (
        <div className="font-medium">
          {child.firstName} {child.lastName}
        </div>
      );
    },
  },
  {
    accessorKey: 'parent',
    header: 'Parent',
    cell: ({ row }) => {
      const parent = row.original.parent;
      return (
        <div>
          <div className="font-medium">
            {parent.firstName} {parent.lastName}
          </div>
          <div className="text-xs text-muted-foreground">{parent.email}</div>
        </div>
      );
    },
  },
  {
    accessorKey: 'camp.name',
    header: 'Camp',
    cell: ({ row }) => {
      return (
        <div className="max-w-[200px] truncate">{row.original.camp.name}</div>
      );
    },
  },
  {
    accessorKey: 'totalAmount',
    header: 'Montant',
    cell: ({ row }) => {
      const amount = parseFloat(row.original.totalAmount.toString());
      return (
        <div className="font-medium">
          {amount.toLocaleString('fr-FR')} XPF
        </div>
      );
    },
  },
  {
    accessorKey: 'status',
    header: 'Statut',
    cell: ({ row }) => <StatusBadge type="registration" status={row.original.status} />,
  },
  {
    accessorKey: 'invoiceId',
    header: 'Facture',
    cell: ({ row }) => {
      const { invoiceId, invoiceStatus } = row.original;

      if (!invoiceId || !invoiceStatus) {
        return <span className="text-xs text-muted-foreground">Aucune</span>;
      }

      return (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge type="invoice" status={invoiceStatus} />
          <Button variant="link" size="sm" asChild className="h-auto p-0 text-xs">
            <Link href={`/dashboard/staff/invoices/${invoiceId}`}>
              Voir la facture
            </Link>
          </Button>
        </div>
      );
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Date',
    cell: ({ row }) => {
      return (
        <div className="text-sm">
          {new Date(row.original.createdAt).toLocaleDateString('fr-FR')}
        </div>
      );
    },
  },
  {
    id: 'actions',
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row }) => {
      return (
        <StaffRegistrationActions
          item={row.original}
          onConfirm={() => {}}
          onWaitlist={() => {}}
          onCancel={() => {}}
          onCreateInvoice={() => {}}
        />
      );
    },
  },
];

// ============================================================================
// ACTIONS COMPONENT
// ============================================================================

interface StaffRegistrationActionsProps {
  item: StaffRegistrationType;
  onConfirm?: (item: StaffRegistrationType) => void;
  onWaitlist?: (item: StaffRegistrationType) => void;
  onCancel?: (item: StaffRegistrationType) => void;
  onCreateInvoice?: (item: StaffRegistrationType) => void;
}

export function StaffRegistrationActions({
  item,
  onConfirm,
  onWaitlist,
  onCancel,
  onCreateInvoice,
}: StaffRegistrationActionsProps) {
  // Logique des actions basée sur le statut
  const isPending = item.status === 'PENDING';
  const isConfirmed = item.status === 'CONFIRMED';
  const isWaitlist = item.status === 'WAITLIST';
  const canCreateInvoice = isConfirmed && !item.invoiceId;

  // Le staff peut avoir des actions supplémentaires sur les waitlist
  const hasActions = isPending || isConfirmed || isWaitlist;

  return (
    <div className="flex justify-end gap-2">
      <Link href={`/dashboard/staff/registrations/${item.id}`}>
        <Button variant="outline" size="sm">
          <Eye className="mr-2 h-4 w-4" />
          Voir
        </Button>
      </Link>
      {hasActions && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <span className="sr-only">Menu d&apos;actions</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Actions pour BROUILLON (PENDING) */}
            {isPending && (
              <>
                <DropdownMenuItem onClick={() => onConfirm?.(item)}>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Confirmer
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onWaitlist?.(item)}>
                  <AlertCircle className="mr-2 h-4 w-4" />
                  Mettre en attente
                </DropdownMenuItem>
              </>
            )}

            {/* Actions pour CONFIRMÉE */}
            {isConfirmed && (
              <>
                {canCreateInvoice && (
                  <DropdownMenuItem onClick={() => onCreateInvoice?.(item)}>
                    <FileText className="mr-2 h-4 w-4" />
                    Créer facture
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => onCancel?.(item)}
                  className="text-destructive focus:text-destructive"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Annuler
                </DropdownMenuItem>
              </>
            )}

            {/* Actions pour LISTE D'ATTENTE */}
            {isWaitlist && (
              <>
                <DropdownMenuItem onClick={() => onConfirm?.(item)}>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Confirmer
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onCancel?.(item)}
                  className="text-destructive focus:text-destructive"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Annuler
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
