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
import { Mail, Phone, User, Eye, Pencil, Trash2, MoreHorizontal, Key } from 'lucide-react';
import { useRouter } from 'next/navigation';

// ============================================================================
// TYPES
// ============================================================================

export type Parent = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  childrenCount?: number;
  deletedAt?: Date | null;
};

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

export const parentsColumns: ColumnDef<Parent>[] = [
  {
    accessorKey: 'fullName',
    header: 'Parent',
    cell: ({ row }) => {
      const parent = row.original;
      return (
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="font-medium">
              {parent.firstName} {parent.lastName}
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
      const parent = row.original;
      return (
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Mail className="h-3 w-3" />
            {parent.email}
          </div>
          {parent.phone && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Phone className="h-3 w-3" />
              {parent.phone}
            </div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'childrenCount',
    header: 'Enfants',
    cell: ({ row }) => {
      const count = row.original.childrenCount || 0;
      return (
        <Badge variant="secondary">
          {count} enfant{count > 1 ? 's' : ''}
        </Badge>
      );
    },
  },
  {
    id: 'status',
    header: 'Statut',
    cell: ({ row }) => {
      const isActive = !row.original.deletedAt;
      return (
        <Badge variant={isActive ? 'default' : 'secondary'}>
          {isActive ? 'Actif' : 'Inactif'}
        </Badge>
      );
    },
  },
  {
    id: 'actions',
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row }) => {
      return <ParentActions parent={row.original} />;
    },
  },
];

// ============================================================================
// ACTIONS COMPONENT
// ============================================================================

interface ParentActionsProps {
  parent: Parent;
  onResetPassword?: (parent: Parent) => void;
  onDelete?: (parent: Parent) => void;
}

export function ParentActions({ parent, onResetPassword, onDelete }: ParentActionsProps) {
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
            onClick={() => router.push(`/dashboard/admin/users/parents/${parent.id}`)}
          >
            <Eye className="mr-2 h-4 w-4" />
            Voir détails
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => router.push(`/dashboard/admin/users/parents/${parent.id}/edit`)}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Modifier
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onResetPassword?.(parent)}
          >
            <Key className="mr-2 h-4 w-4" />
            Réinitialiser mot de passe
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onDelete?.(parent)}
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
