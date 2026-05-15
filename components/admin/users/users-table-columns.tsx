/**
 * Users Table Columns
 *
 * Définition des colonnes pour la DataTable des utilisateurs.
 * Exemple d'utilisation du composant DataTable générique.
 */

'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, Key, User } from 'lucide-react';
import { useRouter } from 'next/navigation';

// ============================================================================
// TYPES
// ============================================================================

export type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: 'PARENT' | 'STAFF' | 'ADMIN';
  createdAt: Date;
};

// ============================================================================
// ACTIONS CELL COMPONENT
// ============================================================================

type UserActionsProps = {
  userId: string;
  userRole: 'PARENT' | 'STAFF' | 'ADMIN';
  onResetPassword?: (userId: string) => void;
  onDelete?: (userId: string) => void;
};

function UserActions({ userId, userRole, onResetPassword, onDelete }: UserActionsProps) {
  const router = useRouter();

  const handleEdit = () => {
    router.push(`/dashboard/admin/users/${userId}/edit`);
  };

  const handleResetPassword = () => {
    if (onResetPassword) {
      onResetPassword(userId);
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(userId);
    }
  };

  // Prevent deletion of admin account
  const canDelete = userRole !== 'ADMIN';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          Modifieeer
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleResetPassword}>
          <Key className="mr-2 h-4 w-4" />
          Réinitialiser mot de passe
        </DropdownMenuItem>
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleDelete} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Supprimer
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================================
// COLUMNS DEFINITION FACTORY
// ============================================================================

type GetColumnsOptions = {
  onResetPassword?: (userId: string) => void;
  onDelete?: (userId: string) => void;
};

export const getUsersColumns = (options?: GetColumnsOptions): ColumnDef<UserRow>[] => [
  {
    accessorKey: 'name',
    header: 'Nom',
    cell: ({ row }) => {
      const name = row.getValue('name') as string | null;
      return (
        <div className="font-medium">{name || 'Non renseigné'}</div>
      );
    },
  },
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ row }) => {
      const email = row.getValue('email') as string;
      return <div className="text-sm text-muted-foreground">{email}</div>;
    },
  },
  {
    accessorKey: 'role',
    header: 'Rôle',
    cell: ({ row }) => {
      const role = row.getValue('role') as 'PARENT' | 'STAFF' | 'ADMIN';

      const roleConfig = {
        PARENT: { label: 'Parent', variant: 'default' as const },
        STAFF: { label: 'Personnel', variant: 'secondary' as const },
        ADMIN: { label: 'Admin', variant: 'destructive' as const },
      };

      const config = roleConfig[role];

      return <Badge variant={config.variant}>{config.label}</Badge>;
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Créé le',
    cell: ({ row }) => {
      const date = row.getValue('createdAt') as Date;
      return (
        <div className="text-sm text-muted-foreground">
          {new Date(date).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })}
        </div>
      );
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const user = row.original;
      return (
        <UserActions
          userId={user.id}
          userRole={user.role}
          onResetPassword={options?.onResetPassword}
          onDelete={options?.onDelete}
        />
      );
    },
  },
];

// Export default columns without callbacks for backward compatibility
export const usersColumns = getUsersColumns();
