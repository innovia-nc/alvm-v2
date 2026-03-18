'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import Link from 'next/link';

// ============================================================================
// TYPES
// ============================================================================

export type StaffCreditNoteType = {
  id: string;
  creditNoteNumber: string;
  creditedInvoiceId: string | null;
  parentId: string;
  issueDate: Date;
  totalAmount: number;
  notes: string | null;
  status: 'DRAFT' | 'SENT' | 'CANCELLED';
  isFutureCredit: boolean;
  originalInvoice: {
    invoiceNumber: string;
    totalAmount: number;
    status: string;
  } | null;
  parent: {
    firstName: string;
    lastName: string;
    email: string;
  };
  lines: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    totalHt: number;
  }>;
};

// ============================================================================
// HELPER: Get Status Badge Info
// ============================================================================

export function getStatusBadge(status: string) {
  switch (status) {
    case 'DRAFT':
      return {
        label: 'Brouillon',
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
      };
    case 'SENT':
      return {
        label: '\u00c9mis',
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      };
    case 'CANCELLED':
      return {
        label: 'Annul\u00e9',
        className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      };
    default:
      return {
        label: status,
        className: '',
      };
  }
}

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

export const staffCreditNoteColumns: ColumnDef<StaffCreditNoteType>[] = [
  {
    accessorKey: 'creditNoteNumber',
    header: 'Num\u00e9ro',
    cell: ({ row }) => {
      return <div className="font-medium">{row.original.creditNoteNumber}</div>;
    },
  },
  {
    accessorKey: 'originalInvoice',
    header: 'Facture',
    cell: ({ row }) => {
      const creditNote = row.original;
      if (!creditNote.originalInvoice || !creditNote.creditedInvoiceId) {
        return <span className="text-muted-foreground">-</span>;
      }
      return (
        <Link
          href={`/dashboard/staff/invoices/${creditNote.creditedInvoiceId}`}
          className="text-blue-600 hover:underline"
        >
          {creditNote.originalInvoice.invoiceNumber}
        </Link>
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
    accessorKey: 'issueDate',
    header: 'Date',
    cell: ({ row }) => {
      return (
        <div className="text-sm">
          {new Date(row.original.issueDate).toLocaleDateString('fr-FR')}
        </div>
      );
    },
  },
  {
    accessorKey: 'totalAmount',
    header: 'Montant',
    cell: ({ row }) => {
      const amount = row.original.totalAmount;
      return (
        <div className="font-medium text-red-600">
          -{parseFloat(amount.toString()).toLocaleString('fr-FR')} XPF
        </div>
      );
    },
  },
  {
    accessorKey: 'notes',
    header: 'Notes',
    cell: ({ row }) => {
      const notes = row.original.notes;
      if (!notes) {
        return <span className="text-muted-foreground">-</span>;
      }
      return (
        <div className="max-w-[200px] truncate text-sm" title={notes}>
          {notes}
        </div>
      );
    },
  },
  {
    accessorKey: 'status',
    header: 'Statut',
    cell: ({ row }) => {
      const statusInfo = getStatusBadge(row.original.status);
      return <Badge className={statusInfo.className}>{statusInfo.label}</Badge>;
    },
  },
  {
    id: 'actions',
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row }) => {
      const item = row.original;
      return (
        <div className="text-right">
          <Link href={`/dashboard/staff/credit-notes/${item.id}`}>
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
