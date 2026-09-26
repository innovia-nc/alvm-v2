'use client';

import { FilterBar } from '@/components/shared/filter-bar';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { DataTableServer } from '@/components/ui/data-table-server';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { trpc } from '@/lib/trpc/client';
import type { Row } from '@tanstack/react-table';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ParentActions, parentsColumns, type Parent } from './columns';

export function ParentsTableClient() {
  const router = useRouter();
  const [deletingParent, setDeletingParent] = useState<Parent | null>(null);
  const [resetPasswordParent, setResetPasswordParent] = useState<Parent | null>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('active');

  // Hook de pagination server-side
  const pagination = useServerPagination({ defaultPageSize: 20 });

  // Query tRPC avec pagination, recherche et filtre de statut
  const {
    data,
    isLoading,
    error: listError,
    refetch: retryList,
  } = trpc.parents.list.useQuery({
    sortBy: pagination.sortBy as 'lastName' | 'firstName' | 'createdAt' | undefined,
    sortOrder: pagination.sortOrder,
    limit: pagination.limit,
    offset: pagination.offset,
    search,
    status,
  });

  const resetPasswordMutation = trpc.users.resetPassword.useMutation({
    onSuccess: (data) => {
      setTempPassword(data.tempPassword);
    },
    onError: (err) => {
      toast.error(err.message || 'Impossible de réinitialiser le mot de passe');
      setResetPasswordParent(null);
    },
  });

  const deleteMutation = trpc.parents.delete.useMutation({
    onSuccess: () => {
      toast.success('Parent supprimé avec succès');
      setDeletingParent(null);
      router.refresh();
    },
    onError: (err) => {
      setError(err.message || 'Impossible de supprimer ce parent');
      setDeletingParent(null);
    },
  });

  function handleResetPassword(parent: Parent) {
    setResetPasswordParent(parent);
    resetPasswordMutation.mutate({ userId: parent.id });
  }

  async function handleDelete() {
    if (!deletingParent) return;

    try {
      setError(null);
      await deleteMutation.mutateAsync({ id: deletingParent.id });
    } catch {
      // Erreur déjà gérée par onError
    }
  }

  // Enrichir les colonnes avec le callback de suppression
  const columnsWithActions = parentsColumns.map((col) => {
    if (col.id === 'actions') {
      return {
        ...col,
        cell: ({ row }: { row: Row<Parent> }) => (
          <ParentActions
            parent={row.original}
            onResetPassword={handleResetPassword}
            onDelete={setDeletingParent}
          />
        ),
      };
    }
    return col;
  });

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filtre de statut */}
      <FilterBar>
        <div className="grid w-full gap-2 sm:w-56">
          <Label htmlFor="list-status-filter">Statut</Label>
          <Select
            value={status}
            onValueChange={(value: 'all' | 'active' | 'inactive') => {
              setStatus(value);
              pagination.resetToFirstPage();
            }}
          >
            <SelectTrigger className="w-full" id="list-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Actifs</SelectItem>
              <SelectItem value="inactive">Inactifs</SelectItem>
              <SelectItem value="all">Tous</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FilterBar>

      <DataTableServer
        error={listError}
        onRetry={retryList}
        sortableColumns={['lastName', 'firstName', 'createdAt']}
        columns={columnsWithActions}
        data={data?.parents || []}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="email"
        searchPlaceholder="Rechercher par nom, email ou téléphone..."
        search={search}
        onSearchChange={(value) => setSearch(value)}
      />

      {/* Dialog de confirmation de suppression */}
      <AlertDialog
        open={!!deletingParent}
        onOpenChange={(open) => !open && setDeletingParent(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le parent{' '}
              <strong>
                {deletingParent?.firstName} {deletingParent?.lastName}
              </strong>{' '}
              ?
              <br />
              <br />
              Cette action est irréversible. Tous les enfants, inscriptions et factures associés
              seront également supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog mot de passe temporaire */}
      <AlertDialog
        open={resetPasswordParent !== null && tempPassword !== ''}
        onOpenChange={(open) => {
          if (!open) {
            setResetPasswordParent(null);
            setTempPassword('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mot de passe temporaire</AlertDialogTitle>
            <AlertDialogDescription>
              Le mot de passe de{' '}
              <strong>
                {resetPasswordParent?.firstName} {resetPasswordParent?.lastName}
              </strong>{' '}
              a été réinitialisé. Voici le mot de passe temporaire :
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg bg-muted p-4">
            <code className="text-lg font-mono font-bold">{tempPassword}</code>
          </div>
          <AlertDialogDescription className="text-sm text-destructive">
            ⚠️ Copiez ce mot de passe maintenant, il ne sera plus affiché.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                navigator.clipboard.writeText(tempPassword);
                setResetPasswordParent(null);
                setTempPassword('');
              }}
            >
              Copier et fermer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
