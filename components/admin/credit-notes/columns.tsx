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
  MoreHorizontal,
  Eye,
  CheckCircle,
  XCircle,
  Trash2,
  Download,
} from 'lucide-react';
import Link from 'next/link';
import { StatusBadge } from '@/components/shared/status-badge';

// ============================================================================
// TYPES
// ============================================================================

export type AdminCreditNoteType = {
  id: string;
  creditNoteNumber: string;
  creditedInvoiceId: string | null;
  parentId: string;
  issueDate: Date;
  totalAmount: number;
  notes: string | null;
  status: 'DRAFT' | 'SENT' | 'CANCELLED';
  isFutureCredit: boolean;
  /** URL du PDF archivé, `null` tant qu'il n'a pas été généré (TD-007). */
  pdfUrl: string | null;
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

export const adminCreditNoteColumns: ColumnDef<AdminCreditNoteType>[] = [
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
          <Link href={`/dashboard/admin/invoices/${creditNote.creditedInvoiceId}`}>
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
      return (
        <AdminCreditNoteActions
          item={row.original}
          onDelete={() => {}}
          onUpdateStatus={() => {}}
          onGeneratePDF={() => {}}
        />
      );
    },
  },
];

// ============================================================================
// ACTIONS COMPONENT
// ============================================================================

interface AdminCreditNoteActionsProps {
  item: AdminCreditNoteType;
  onDelete?: (item: AdminCreditNoteType) => void;
  onUpdateStatus?: (item: AdminCreditNoteType, status: 'SENT' | 'CANCELLED') => void;
  /** Demande la génération du PDF quand l'avoir n'en a pas encore (TD-007). */
  onGeneratePDF?: (item: AdminCreditNoteType) => void;
}

export function AdminCreditNoteActions({
  item,
  onDelete,
  onUpdateStatus,
  onGeneratePDF,
}: AdminCreditNoteActionsProps) {
  const handleDownloadPDF = () => {
    // PDF déjà archivé : téléchargement direct, sinon on le génère d'abord.
    if (item.pdfUrl) {
      window.open(item.pdfUrl, '_blank');
    } else {
      onGeneratePDF?.(item);
    }
  };

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
            <Link href={`/dashboard/admin/credit-notes/${item.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Voir détails
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleDownloadPDF}>
            <Download className="mr-2 h-4 w-4" />
            Télécharger le PDF
          </DropdownMenuItem>

          {item.status === 'DRAFT' && (
            <DropdownMenuItem onClick={() => onUpdateStatus?.(item, 'SENT')}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Émettre
            </DropdownMenuItem>
          )}

          {(item.status === 'DRAFT' || item.status === 'SENT') && (
            <DropdownMenuItem
              onClick={() => onUpdateStatus?.(item, 'CANCELLED')}
              className="text-orange-600 focus:text-orange-600"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Annuler
            </DropdownMenuItem>
          )}

          {item.status === 'DRAFT' && (
            <DropdownMenuItem
              onClick={() => onDelete?.(item)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Supprimer
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
