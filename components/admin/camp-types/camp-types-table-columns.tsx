'use client';

/**
 * Camp Types Table Columns
 *
 * Définition des colonnes pour la DataTable des types de camps.
 * Inclut les actions : Modifier, Toggle Active, Supprimer
 */

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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MoreHorizontal, Edit, Trash2, Power, PowerOff } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';
import { useState } from 'react';

// Type definition
type CampType = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  accountingCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// Actions cell component
function CampTypeActions({
  campType,
  onEdit,
}: {
  campType: CampType;
  onEdit: (id: string) => void;
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const utils = trpc.useUtils();

  // Toggle active mutation
  const toggleMutation = trpc.campTypes.toggleActive.useMutation({
    onSuccess: (updatedCampType) => {
      utils.campTypes.listAll.invalidate();
      toast.success(
        updatedCampType.active
          ? 'Type de camp activé'
          : 'Type de camp désactivé',
        {
          description: `Le type "${updatedCampType.name}" a été ${updatedCampType.active ? 'activé' : 'désactivé'}.`,
        }
      );
    },
    onError: (error) => {
      toast.error('Erreur lors du changement de statut', {
        description: error.message,
      });
    },
  });

  // Delete mutation
  const deleteMutation = trpc.campTypes.delete.useMutation({
    onSuccess: () => {
      utils.campTypes.listAll.invalidate();
      toast.success('Type de camp supprimé', {
        description: `Le type "${campType.name}" a été supprimé.`,
      });
      setDeleteDialogOpen(false);
    },
    onError: (error) => {
      toast.error('Erreur lors de la suppression', {
        description: error.message,
      });
    },
  });

  const handleToggle = () => {
    toggleMutation.mutate({ id: campType.id });
  };

  const handleDelete = () => {
    deleteMutation.mutate({ id: campType.id });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Ouvrir le menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(campType.id)}>
            <Edit className="mr-2 h-4 w-4" />
            Modifier
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleToggle}>
            {campType.active ? (
              <>
                <PowerOff className="mr-2 h-4 w-4" />
                Désactiver
              </>
            ) : (
              <>
                <Power className="mr-2 h-4 w-4" />
                Activer
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setDeleteDialogOpen(true)}
            className="text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce type de camp ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le type de camp "{campType.name}" sera
              définitivement supprimé.
              <br />
              <br />
              <strong>Note :</strong> Vous ne pouvez pas supprimer un type de camp si des
              camps l'utilisent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Column definitions factory
export function campTypesColumns(
  onEdit: (id: string) => void
): ColumnDef<CampType>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Nom',
      cell: ({ row }) => {
        return <div className="font-medium">{row.getValue('name')}</div>;
      },
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => {
        const description = row.getValue('description') as string | null;
        return (
          <div className="max-w-[500px] truncate text-sm text-muted-foreground">
            {description || '—'}
          </div>
        );
      },
    },
    {
      accessorKey: 'accountingCode',
      header: 'Code Comptable',
      cell: ({ row }) => {
        const code = row.getValue('accountingCode') as string | null;
        return code ? (
          <Badge variant="outline" className="font-mono">
            {code}
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        );
      },
    },
    {
      accessorKey: 'active',
      header: 'Statut',
      cell: ({ row }) => {
        const active = row.getValue('active') as boolean;
        return (
          <Badge variant={active ? 'default' : 'secondary'}>
            {active ? 'Actif' : 'Inactif'}
          </Badge>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const campType = row.original;
        return <CampTypeActions campType={campType} onEdit={onEdit} />;
      },
    },
  ];
}
