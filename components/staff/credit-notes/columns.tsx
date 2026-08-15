'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import Link from 'next/link';
import { StatusBadge } from '@/components/shared/status-badge';

// ============================================================================
// TYPES
// ============================================================================

type StaffCreditNoteType = {
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
// COLUMN DEFINITIONS
// ============================================================================

export const staffCreditNoteColumns: ColumnDef<StaffCreditNoteType>[] = [
  {
    accessorKey: 'creditNoteNumber',
    header: 'Numéro',
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
        <Button variant="link" asChild className="h-auto p-0">
          <Link href={`/dashboard/staff/invoices/${creditNote.creditedInvoiceId}`}>
            {creditNote.originalInvoice.invoiceNumber}
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
    cell: ({ row }) => <StatusBadge type="creditNote" status={row.original.status} />,
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
