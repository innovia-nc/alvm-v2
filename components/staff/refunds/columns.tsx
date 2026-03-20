'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Pencil } from 'lucide-react';
import Link from 'next/link';

// ============================================================================
// TYPES
// ============================================================================

export type StaffRefundType = {
  id: string;
  amount: number | string;
  refundDate: Date;
  refundMethod: string;
  reference: string | null;
  payment: {
    invoice: {
      invoiceNumber: string;
      parent: {
        firstName: string;
        lastName: string;
      };
    };
  };
};

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

export const staffRefundColumns: ColumnDef<StaffRefundType>[] = [
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
    header: 'N° Facture',
    cell: ({ row }) => {
      const refund = row.original;
      return (
        <div className="font-medium">
          {refund.payment.invoice.invoiceNumber}
        </div>
      );
    },
  },
  {
    accessorKey: 'parent',
    header: 'Parent',
    cell: ({ row }) => {
      const parent = row.original.payment.invoice.parent;
      return (
        <div className="text-sm">
          {parent.firstName} {parent.lastName}
        </div>
      );
    },
  },
  {
    accessorKey: 'amount',
    header: 'Montant',
    cell: ({ row }) => {
      const amount = parseFloat(row.original.amount.toString());
      return (
        <div className="font-bold text-red-600">
          {amount.toLocaleString('fr-FR')} XPF
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
    accessorKey: 'reference',
    header: 'Référence',
    cell: ({ row }) => {
      const ref = row.original.reference;
      return (
        <div className="text-sm text-muted-foreground">
          {ref || '—'}
        </div>
      );
    },
  },
  {
    id: 'actions',
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row }) => {
      return <StaffRefundActions item={row.original} />;
    },
  },
];

// ============================================================================
// ACTIONS COMPONENT
// ============================================================================

interface StaffRefundActionsProps {
  item: StaffRefundType;
}

function StaffRefundActions({ item }: StaffRefundActionsProps) {
  return (
    <div className="text-right">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Ouvrir menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/staff/refunds/${item.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Voir détails
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/staff/refunds/${item.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Modifier
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
