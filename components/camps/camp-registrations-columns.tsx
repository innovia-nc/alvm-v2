'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreHorizontal,
  Eye,
  FileText,
  Trash2,
  Check,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { StatusBadge } from '@/components/shared/status-badge';

export type CampRegistrationType = {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'WAITLIST';
  createdAt: Date;
  updatedAt: Date;
  child: {
    id: string;
    firstName: string;
    lastName: string;
    birthDate: Date;
  };
  parent: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  camp: {
    id: string;
    name: string;
    location: string;
    daysCount: number;
  };
  totalAmount: number;
  invoiceId: string | null;
};

function calculateAge(birthDate: Date): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

interface CampRegistrationActionsProps {
  item: CampRegistrationType;
  registrationsPath: string;
  onConfirm?: (item: CampRegistrationType) => void;
  onDelete?: (item: CampRegistrationType) => void;
  onCancel?: (item: CampRegistrationType) => void;
  onCreateInvoice?: (item: CampRegistrationType) => void;
}

export function CampRegistrationActions({
  item,
  registrationsPath,
  onConfirm,
  onDelete,
  onCancel,
  onCreateInvoice,
}: CampRegistrationActionsProps) {
  const isPending = item.status === 'PENDING';
  const isConfirmed = item.status === 'CONFIRMED';
  const canCreateInvoice = !item.invoiceId && isConfirmed;

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
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link href={`${registrationsPath}/${item.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Voir détails
            </Link>
          </DropdownMenuItem>

          {isPending && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onConfirm?.(item)}
                className="text-green-600 focus:text-green-600"
              >
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

          {isConfirmed && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onCancel?.(item)}
                className="text-orange-600 focus:text-orange-600"
              >
                <X className="mr-2 h-4 w-4" />
                Annuler
              </DropdownMenuItem>
              {canCreateInvoice && (
                <DropdownMenuItem onClick={() => onCreateInvoice?.(item)}>
                  <FileText className="mr-2 h-4 w-4" />
                  Créer facture
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function createCampRegistrationColumns(
  basePath: string
): ColumnDef<CampRegistrationType>[] {
  // Derive registrations path from camp basePath (e.g. /dashboard/admin/camps -> /dashboard/admin/registrations)
  const registrationsPath = basePath.replace('/camps', '/registrations');

  return [
    {
      accessorKey: 'child',
      header: 'Enfant',
      cell: ({ row }) => {
        const child = row.original.child;
        const age = calculateAge(child.birthDate);
        return (
          <div>
            <div className="font-medium">
              {child.firstName} {child.lastName}
            </div>
            <div className="text-xs text-muted-foreground">{age} ans</div>
          </div>
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
      accessorKey: 'totalAmount',
      header: 'Montant',
      cell: ({ row }) => {
        const amount = parseFloat(row.original.totalAmount.toString());
        return (
          <div className="font-medium">
            {amount.toLocaleString('fr-FR')} XPF
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      cell: ({ row }) => <StatusBadge type="registration" status={row.original.status} />,
    },
    {
      accessorKey: 'createdAt',
      header: 'Date inscription',
      cell: ({ row }) => {
        return (
          <div className="text-sm">
            {new Date(row.original.createdAt).toLocaleDateString('fr-FR')}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        return (
          <CampRegistrationActions
            item={row.original}
            registrationsPath={registrationsPath}
          />
        );
      },
    },
  ];
}
