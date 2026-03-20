'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  MoreVertical,
  Eye,
} from 'lucide-react';
import Link from 'next/link';

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
};

// ============================================================================
// HELPERS
// ============================================================================

function getStatusBadge(status: string) {
  switch (status) {
    case 'PENDING':
      return {
        label: 'En attente',
        icon: Clock,
        className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      };
    case 'CONFIRMED':
      return {
        label: 'Confirmée',
        icon: CheckCircle,
        className: 'bg-green-100 text-green-800 border-green-200',
      };
    case 'CANCELLED':
      return {
        label: 'Annulée',
        icon: XCircle,
        className: 'bg-red-100 text-red-800 border-red-200',
      };
    case 'WAITLIST':
      return {
        label: "Liste d'attente",
        icon: AlertCircle,
        className: 'bg-orange-100 text-orange-800 border-orange-200',
      };
    default:
      return {
        label: status,
        icon: AlertCircle,
        className: '',
      };
  }
}

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
    cell: ({ row }) => {
      const statusInfo = getStatusBadge(row.original.status);
      const StatusIcon = statusInfo.icon;
      return (
        <Badge variant="outline" className={statusInfo.className}>
          <StatusIcon className="mr-1 h-3 w-3" />
          {statusInfo.label}
        </Badge>
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
}

export function StaffRegistrationActions({
  item,
  onConfirm,
  onWaitlist,
  onCancel,
}: StaffRegistrationActionsProps) {
  // Logique des actions basée sur le statut
  const isPending = item.status === 'PENDING';
  const isConfirmed = item.status === 'CONFIRMED';
  const isWaitlist = item.status === 'WAITLIST';

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
              <MoreVertical className="h-4 w-4" />
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
              <DropdownMenuItem
                onClick={() => onCancel?.(item)}
                className="text-red-600 focus:text-red-600"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Annuler
              </DropdownMenuItem>
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
                  className="text-red-600 focus:text-red-600"
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
