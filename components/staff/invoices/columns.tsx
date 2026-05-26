'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Download, Trash2, Check, CreditCard } from 'lucide-react';
import Link from 'next/link';
import { StatusBadge } from '@/components/shared/status-badge';

// ============================================================================
// TYPES
// ============================================================================

export type StaffInvoiceType = {
  id: string;
  invoiceNumber: string;
  parentId: string;
  issueDate: Date;
  dueDate: Date;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'CREDITED';
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  pdfUrl?: string | null;
  parent: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  payments?: Array<{
    id: string;
    paymentDate: Date;
    amount: number;
  }>;
};

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

export const staffInvoiceColumns: ColumnDef<StaffInvoiceType>[] = [
  {
    accessorKey: 'invoiceNumber',
    header: 'N° Facture',
    cell: ({ row }) => {
      return <div className="font-medium">{row.original.invoiceNumber}</div>;
    },
  },
  {
    accessorKey: 'parent',
    header: 'Parent',
    cell: ({ row }) => {
      const { parent } = row.original;
      return (
        <div>
          <div className="font-medium text-sm">
            {parent.firstName} {parent.lastName}
          </div>
          {parent.phone && (
            <div className="text-xs text-muted-foreground">{parent.phone}</div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'issueDate',
    header: 'Date émission',
    cell: ({ row }) => {
      return (
        <div className="text-sm">
          {new Date(row.original.issueDate).toLocaleDateString('fr-FR')}
        </div>
      );
    },
  },
  {
    accessorKey: 'dueDate',
    header: 'Échéance',
    cell: ({ row }) => {
      const invoice = row.original;
      const now = new Date();
      const dueDate = new Date(invoice.dueDate);
      const isOverdue = dueDate < now && invoice.status !== 'PAID' && invoice.status !== 'CANCELLED';

      return (
        <div className={isOverdue ? 'text-red-600 font-medium' : ''}>
          {dueDate.toLocaleDateString('fr-FR')}
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
        <div className="font-medium">
          {parseFloat(amount.toString()).toLocaleString('fr-FR')} XPF
        </div>
      );
    },
  },
  {
    accessorKey: 'paidAmount',
    header: 'Payé',
    cell: ({ row }) => {
      const amount = row.original.paidAmount;
      return (
        <div className="text-sm">
          {parseFloat(amount.toString()).toLocaleString('fr-FR')} XPF
        </div>
      );
    },
  },
  {
    accessorKey: 'remainingAmount',
    header: 'Reste',
    cell: ({ row }) => {
      const amount = row.original.remainingAmount;
      return (
        <div className={amount > 0 ? 'font-medium text-orange-600' : 'text-muted-foreground'}>
          {parseFloat(amount.toString()).toLocaleString('fr-FR')} XPF
        </div>
      );
    },
  },
  {
    accessorKey: 'status',
    header: 'Statut',
    cell: ({ row }) => <StatusBadge type="invoice" status={row.original.status} />,
  },
  {
    id: 'actions',
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row }) => {
      return <StaffInvoiceActions item={row.original} />;
    },
  },
];

// ============================================================================
// ACTIONS COMPONENT
// ============================================================================

export interface StaffInvoiceActionsProps {
  item: StaffInvoiceType;
  onDelete?: (item: StaffInvoiceType) => void;
  onGeneratePDF?: (item: StaffInvoiceType) => void;
  onValidate?: (item: StaffInvoiceType) => void;
  onRecordPayment?: (item: StaffInvoiceType) => void;
  pdfUrl?: string | null;
}

export function StaffInvoiceActions({ item, onDelete, onGeneratePDF, onValidate, onRecordPayment }: StaffInvoiceActionsProps) {
  const remainingAmount = item.remainingAmount;

  const handleDownloadPDF = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!item.pdfUrl) {
      // Si pas de PDF, on génère d'abord
      onGeneratePDF?.(item);
    } else {
      // Si PDF existe, on télécharge directement
      window.open(item.pdfUrl, '_blank');
    }
  };

  return (
    <div className="text-right">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Menu d&apos;actions</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Actions pour statut DRAFT (Brouillon) */}
          {item.status === 'DRAFT' && (
            <>
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/staff/invoices/${item.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  Voir détails
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadPDF}>
                <Download className="mr-2 h-4 w-4" />
                Télécharger PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onValidate?.(item)}>
                <Check className="mr-2 h-4 w-4" />
                Valider
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete?.(item)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Supprimer
              </DropdownMenuItem>
            </>
          )}

          {/* Actions pour statut SENT (Émise) */}
          {item.status === 'SENT' && (
            <>
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/staff/invoices/${item.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  Voir détails
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadPDF}>
                <Download className="mr-2 h-4 w-4" />
                Télécharger PDF
              </DropdownMenuItem>
              {remainingAmount > 0 && (
                <DropdownMenuItem onClick={() => onRecordPayment?.(item)}>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Enregistrer un paiement
                </DropdownMenuItem>
              )}
            </>
          )}

          {/* Actions pour les autres statuts (PAID, OVERDUE, CANCELLED) */}
          {item.status !== 'DRAFT' && item.status !== 'SENT' && (
            <>
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/staff/invoices/${item.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  Voir détails
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadPDF}>
                <Download className="mr-2 h-4 w-4" />
                Télécharger PDF
              </DropdownMenuItem>
              {/* Pour les factures en retard non annulées avec un solde restant */}
              {item.status === 'OVERDUE' && remainingAmount > 0 && (
                <DropdownMenuItem onClick={() => onRecordPayment?.(item)}>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Enregistrer un paiement
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
