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

export type AdminPaymentType = {
  id: string;
  amount: number;
  paymentDate: Date;
  paymentMethodId: string;
  paymentMethodName: string;
  paymentMethodCode: string;
  reference: string | null;
  notes: string | null;
  invoice: {
    id: string;
    invoiceNumber: string;
  };
  parent: {
    firstName: string;
    lastName: string;
    email: string;
  };
};

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

export const adminPaymentColumns: ColumnDef<AdminPaymentType>[] = [
  {
    accessorKey: 'paymentDate',
    header: 'Date',
    cell: ({ row }) => {
      return (
        <div className="text-sm">
          {new Date(row.original.paymentDate).toLocaleDateString('fr-FR')}
        </div>
      );
    },
  },
  {
    accessorKey: 'invoice',
    header: 'Facture',
    cell: ({ row }) => {
      const payment = row.original;
      return (
        <Button variant="link" asChild className="h-auto p-0 font-medium">
          <Link href={`/dashboard/admin/invoices/${payment.invoice.id}`}>
            {payment.invoice.invoiceNumber}
          </Link>
        </Button>
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
    accessorKey: 'paymentMethodName',
    header: 'Méthode',
    cell: ({ row }) => {
      return (
        <div className="text-sm">
          {row.original.paymentMethodName}
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
        <div className="font-medium text-green-600">
          {parseFloat(amount.toString()).toLocaleString('fr-FR')} XPF
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
      return <AdminPaymentActions item={row.original} onDelete={() => {}} />;
    },
  },
];

// ============================================================================
// ACTIONS COMPONENT
// ============================================================================

interface AdminPaymentActionsProps {
  item: AdminPaymentType;
  onDelete?: (item: AdminPaymentType) => void;
}

export function AdminPaymentActions({ item, onDelete }: AdminPaymentActionsProps) {
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
            <Link href={`/dashboard/admin/payments/${item.id}`}>
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
