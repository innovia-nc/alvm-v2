'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Mail, Phone, User, Pencil, Trash2, MoreHorizontal, Key } from 'lucide-react';
import { useRouter } from 'next/navigation';

// ============================================================================
// TYPES
// ============================================================================

export type StaffMember = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  createdAt: Date;
};

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

export const staffColumns: ColumnDef<StaffMember>[] = [
  {
    accessorKey: 'fullName',
    header: 'Membre',
    cell: ({ row }) => {
      const member = row.original;
      return (
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="font-medium">
              {member.firstName} {member.lastName}
            </div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'email',
    header: 'Contact',
    cell: ({ row }) => {
      const member = row.original;
      return (
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Mail className="h-3 w-3" />
            {member.email}
          </div>
          {member.phone && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Phone className="h-3 w-3" />
              {member.phone}
            </div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Date création',
    cell: ({ row }) => {
      return (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.createdAt).toLocaleDateString('fr-FR')}
        </span>
      );
    },
  },
  {
    id: 'status',
    header: 'Statut',
    cell: () => {
      return <Badge variant="default">Actif</Badge>;
    },
  },
  {
    id: 'actions',
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row }) => {
      return <StaffActions member={row.original} />;
    },
  },
];

// ============================================================================
// ACTIONS COMPONENT
// ============================================================================

interface StaffActionsProps {
  member: StaffMember;
  onResetPassword?: (member: StaffMember) => void;
  onDelete?: (member: StaffMember) => void;
}

export function StaffActions({ member, onResetPassword, onDelete }: StaffActionsProps) {
  const router = useRouter();

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
          <DropdownMenuItem
            onClick={() => router.push(`/dashboard/admin/users/staff/${member.id}/edit`)}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Modifier
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(`/dashboard/staff/users/staff/${member.id}`)}>
            <User className="mr-2 h-4 w-4" />
            Voir détails
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onResetPassword?.(member)}
          >
            <Key className="mr-2 h-4 w-4" />
            Réinitialiser mot de passe
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onDelete?.(member)}
            className="text-red-600"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
