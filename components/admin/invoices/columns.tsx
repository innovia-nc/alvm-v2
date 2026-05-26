'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Download, Trash2, Check, CreditCard, Mail } from 'lucide-react';
import Link from 'next/link';
import { StatusBadge } from '@/components/shared/status-badge';

// ============================================================================
// TYPES
// ============================================================================

export type AdminInvoiceType = {
  id: string;
  invoiceNumber: string;
  parentId: string;
  issueDate: Date;
  dueDate: Date;
  totalAmount: number;
  paidAmount: number;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'CREDITED';
  pdfUrl: string | null;
  parent: {
    firstName: string;
    lastName: string;
    email: string;
  };
  remainingAmount: number;
};

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

export const adminInvoiceColumns: ColumnDef<AdminInvoiceType>[] = [
  {
    accessorKey: 'parent',
    header: 'Parent',
    cell: ({ row }) => {
      const parent = row.original.parent;
      return (
        <div>
          <div className="font-medium">
            {parent.lastName.toUpperCase()} {parent.firstName}
          </div>
          <div className="text-xs text-muted-foreground">{parent.email}</div>
        </div>
      );
    },
  },
  {
    accessorKey: 'invoiceNumber',
    header: 'N° Facture',
    cell: ({ row }) => {
      return <div className="font-medium">{row.original.invoiceNumber}</div>;
    },
  },
  {
    accessorKey: 'issueDate',
    header: 'Émission',
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
      const isOverdue = invoice.status === 'SENT' && new Date(invoice.dueDate) < new Date();

      return (
        <div className={`text-sm ${isOverdue ? 'text-red-600 font-semibold' : ''}`}>
          {new Date(invoice.dueDate).toLocaleDateString('fr-FR')}
          {isOverdue && ' (échue)'}
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
    accessorKey: 'status',
    header: 'Statut',
    cell: ({ row }) => <StatusBadge type="invoice" status={row.original.status} />,
  },
  {
    id: 'actions',
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row }) => {
      return <AdminInvoiceActions item={row.original} onDelete={() => {}} onGeneratePDF={() => {}} />;
    },
  },
];

// ============================================================================
// ACTIONS COMPONENT
// ============================================================================

interface AdminInvoiceActionsProps {
  item: AdminInvoiceType;
  onDelete?: (item: AdminInvoiceType) => void;
  onGeneratePDF?: (item: AdminInvoiceType) => void;
  onSendEmail?: (item: AdminInvoiceType) => void;
  onValidate?: (item: AdminInvoiceType) => void;
  onRecordPayment?: (item: AdminInvoiceType) => void;
}

export function AdminInvoiceActions({ item, onDelete, onGeneratePDF, onSendEmail, onValidate, onRecordPayment }: AdminInvoiceActionsProps) {
  const remainingAmount = item.totalAmount - item.paidAmount;

  const handleDownloadPDF = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!item.pdfUrl) {
      // Si pas de PDF, on génère d'abord avec le dialog de confirmation
      onGeneratePDF?.(item);
    } else {
      // Si PDF existe, on télécharge directement SANS dialog
      window.open(item.pdfUrl, '_blank');
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
          {/* Actions pour statut DRAFT (Devis) */}
          {item.status === 'DRAFT' && (
            <>
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/admin/invoices/${item.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  Voir détails
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadPDF}>
                <Download className="mr-2 h-4 w-4" />
                Télécharger le devis
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onValidate?.(item)}>
                <Check className="mr-2 h-4 w-4" />
                Valider en facture
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSendEmail?.(item)}>
                <Mail className="mr-2 h-4 w-4" />
                Envoyer le devis
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
                <Link href={`/dashboard/admin/invoices/${item.id}`}>
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
                <Link href={`/dashboard/admin/invoices/${item.id}`}>
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
