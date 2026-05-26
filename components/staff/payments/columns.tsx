'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import Link from 'next/link';

// ============================================================================
// TYPES
// ============================================================================

export type StaffPaymentType = {
  id: string;
  amount: number | string;
  paymentDate: Date;
  paymentMethodId: string;
  paymentMethodName: string;
  paymentMethodCode: string;
  reference: string | null;
  invoice: {
    invoiceNumber: string;
  };
  parent: {
    firstName: string;
    lastName: string;
  };
};

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

export const staffPaymentColumns: ColumnDef<StaffPaymentType>[] = [
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
          <Link href={`/dashboard/staff/invoices/${payment.invoice.invoiceNumber}`}>
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
        <div className="font-medium">
          {parent.firstName} {parent.lastName}
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
      const item = row.original;
      return (
        <div className="text-right">
          <Link href={`/dashboard/staff/payments/${item.id}`}>
            <Button variant="ghost" size="sm">
              <Eye className="h-4 w-4 mr-2" />
              Voir
            </Button>
          </Link>
        </div>
      );
    },
  },
];
