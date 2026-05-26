'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Trash2 } from 'lucide-react';
import Link from 'next/link';

// ============================================================================
// TYPES
// ============================================================================

export type AdminRefundType = {
  id: string;
  amount: number;
  refundDate: Date;
  refundMethod: string;
  reference: string | null;
  reason: string | null;
  payment: {
    invoice: {
      id: string;
      invoiceNumber: string;
      parent: {
        firstName: string;
        lastName: string;
        email: string;
      };
    };
  };
};

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

export const adminRefundColumns: ColumnDef<AdminRefundType>[] = [
  {
    accessorKey: 'refundDate',
    header: 'Date',
    cell: ({ row }) => {
      return (
        <div className="text-sm">
          {new Date(row.original.refundDate).toLocaleDateString('fr-FR')}
        </div>
      );
    },
  },
  {
    accessorKey: 'invoice',
    header: 'Facture',
    cell: ({ row }) => {
      const invoice = row.original.payment.invoice;
      return (
        <Button variant="link" asChild className="h-auto p-0 font-medium">
          <Link href={`/dashboard/admin/invoices/${invoice.id}`}>
            {invoice.invoiceNumber}
          </Link>
        </Button>
      );
    },
  },
  {
    accessorKey: 'parent',
    header: 'Parent',
    cell: ({ row }) => {
      const parent = row.original.payment.invoice.parent;
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
    accessorKey: 'refundMethod',
    header: 'Méthode',
    cell: ({ row }) => {
      return (
        <div className="text-sm">
          {row.original.refundMethod}
        </div>
      );
    },
  },
  {
    accessorKey: 'amount',
    header: 'Montant',
    cell: ({ row }) => {
      const amount = row.original.amount;
      return (
        <div className="font-medium text-orange-600">
          -{parseFloat(amount.toString()).toLocaleString('fr-FR')} XPF
        </div>
      );
    },
  },
  {
    accessorKey: 'reason',
    header: 'Raison',
    cell: ({ row }) => {
      const reason = row.original.reason;
      return (
        <div className="max-w-[200px] truncate text-sm" title={reason || ''}>
          {reason || '-'}
        </div>
      );
    },
  },
  {
    accessorKey: 'reference',
    header: 'Référence',
    cell: ({ row }) => {
      const ref = row.original.reference;
      return (
        <div className="text-sm text-muted-foreground">
          {ref || '-'}
        </div>
      );
    },
  },
  {
    id: 'actions',
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row }) => {
      return <AdminRefundActions item={row.original} onDelete={() => {}} />;
    },
  },
];

// ============================================================================
// ACTIONS COMPONENT
// ============================================================================

interface AdminRefundActionsProps {
  item: AdminRefundType;
  onDelete?: (item: AdminRefundType) => void;
}

export function AdminRefundActions({ item, onDelete }: AdminRefundActionsProps) {
  return (
    <div className="text-right">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <span className="sr-only">Menu d&apos;actions</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/admin/refunds/${item.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Voir détails
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onDelete?.(item)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
