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
import { MoreHorizontal, Eye, Download, Trash2, Check, CreditCard, FileText, Clock, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import Link from 'next/link';

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
  payments?: Array<{
    id: string;
    paymentDate: Date;
    amount: number;
  }>;
  parents: Array<{
    id: string;
    parentId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    isPrimary: boolean;
    relationship: 'mother' | 'father' | 'guardian' | 'step_mother' | 'step_father' | 'grandparent' | 'other' | null;
  }>;
};

// ============================================================================
// HELPERS
// ============================================================================

function getPrimaryParent(child: StaffInvoiceType) {
  return child.parents.find(p => p.isPrimary) || child.parents[0];
}

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

export const staffInvoiceColumns: ColumnDef<StaffInvoiceType>[] = [
  {
    accessorKey: 'parents',
    header: 'Parent',
    cell: ({ row }) => {
      const child = row.original;
      const primaryParent = getPrimaryParent(child);

      return (
        <div>
          {primaryParent ? (
            <>
              <div className="font-medium text-sm">
                {primaryParent.firstName} {primaryParent.lastName}
              </div>
              <div className="text-xs text-muted-foreground">{primaryParent.phone}</div>
              {child.parents.length > 1 && (
                <div className="text-xs text-muted-foreground mt-1">
                  +{child.parents.length - 1} autre{child.parents.length > 2 ? 's' : ''}
                </div>
              )}
            </>
          ) : (
            <span className="text-muted-foreground text-sm">Aucun parent</span>
          )}
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
    cell: ({ row }) => {
      const status = row.original.status;
      const statusInfo = getStatusBadge(status);
      const StatusIcon = statusInfo.icon;
      return (
        <Badge variant={statusInfo.variant}>
          <StatusIcon className="mr-1 h-3 w-3" />
          {statusInfo.label}
        </Badge>
      );
    },
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
// HELPERS
// ============================================================================

function getStatusBadge(status: string) {
  switch (status) {
    case 'DRAFT':
      return { variant: 'outline' as const, label: 'Devis', icon: FileText, color: 'text-gray-600' };
    case 'SENT':
      return { variant: 'secondary' as const, label: 'Émise', icon: Clock, color: 'text-yellow-600' };
    case 'PAID':
      return { variant: 'default' as const, label: 'Payée', icon: CheckCircle, color: 'text-green-600' };
    case 'OVERDUE':
      return { variant: 'destructive' as const, label: 'En retard', icon: AlertCircle, color: 'text-red-600' };
    case 'CANCELLED':
      return { variant: 'outline' as const, label: 'Annulée', icon: XCircle, color: 'text-gray-600' };
    case 'CREDITED':
      return { variant: 'secondary' as const, label: 'Créditée', icon: FileText, color: 'text-purple-600' };
    default:
      return { variant: 'secondary' as const, label: status, icon: AlertCircle, color: 'text-gray-600' };
  }
}

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
            <span className="sr-only">Ouvrir menu</span>
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
                className="text-red-600 focus:text-red-600"
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
