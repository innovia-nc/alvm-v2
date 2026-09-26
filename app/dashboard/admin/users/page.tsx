'use client';

import { getUsersColumns } from '@/components/admin/users/users-table-columns';
import { PageHeader } from '@/components/shared/page-header';
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
import { Button } from '@/components/ui/button';
import { FilterBar } from '@/components/shared/filter-bar';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTableServer } from '@/components/ui/data-table-server';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

export default function AdminUsersPage() {
  const router = useRouter();
  const utils = trpc.useUtils();

  // State for dialogs
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string>('');

  // Fetch users with tRPC
  const pagination = useServerPagination();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'all' | 'PARENT' | 'STAFF' | 'ADMIN'>('all');
  const { data, isLoading, error, refetch } = trpc.users.list.useQuery({
    limit: pagination.limit,
    offset: pagination.offset,
    search: search || undefined,
    role: role === 'all' ? undefined : role,
  });

  // Mutations
  const deleteMutation = trpc.users.delete.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      setDeleteUserId(null);
      toast.success('Utilisateur désactivé avec succès');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetPasswordMutation = trpc.users.resetPassword.useMutation({
    onSuccess: (data) => {
      setTempPassword(data.tempPassword);
    },
    onError: (error) => {
      toast.error(error.message);
      setResetPasswordUserId(null);
    },
  });

  // Handlers
  const handleResetPassword = useCallback(
    (userId: string) => {
      setResetPasswordUserId(userId);
      resetPasswordMutation.mutate({ userId });
    },
    [resetPasswordMutation],
  );

  const handleDelete = useCallback((userId: string) => {
    setDeleteUserId(userId);
  }, []);

  const confirmDelete = useCallback(() => {
    if (deleteUserId) {
      deleteMutation.mutate({ id: deleteUserId });
    }
  }, [deleteUserId, deleteMutation]);

  // Columns with callbacks
  const columns = useMemo(
    () =>
      getUsersColumns({
        onResetPassword: handleResetPassword,
        onDelete: handleDelete,
      }),
    [handleResetPassword, handleDelete],
  );

  return (
    <>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Comptes et habilitations"
          description="Gérez les comptes utilisateurs et leurs permissions"
          actions={
            <Button onClick={() => router.push('/dashboard/admin/users/new')}>
              <UserPlus className="mr-2 h-4 w-4" />
              Nouvel utilisateur
            </Button>
          }
        />

        {/* Liste des utilisateurs avec DataTable */}
        <FilterBar>
          <div className="w-full sm:w-56">
            <Label htmlFor="user-role" className="mb-2 block">
              Rôle
            </Label>
            <Select
              value={role}
              onValueChange={(value: typeof role) => {
                setRole(value);
                pagination.resetToFirstPage();
              }}
            >
              <SelectTrigger id="user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les rôles</SelectItem>
                <SelectItem value="PARENT">Parents</SelectItem>
                <SelectItem value="STAFF">Personnel</SelectItem>
                <SelectItem value="ADMIN">Administrateurs</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(role !== 'all' || search) && (
            <Button
              variant="outline"
              onClick={() => {
                setRole('all');
                setSearch('');
                pagination.resetToFirstPage();
              }}
            >
              Réinitialiser
            </Button>
          )}
        </FilterBar>
        <DataTableServer
          columns={columns}
          data={data?.users ?? []}
          isLoading={isLoading}
          searchKey="name"
          searchPlaceholder="Nom ou email…"
          totalCount={data?.total ?? 0}
          pagination={pagination}
          error={error}
          onRetry={refetch}
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            pagination.resetToFirstPage();
          }}
        />
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteUserId !== null} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Le compte sera désactivé et ses sessions seront révoquées. Les pièces comptables et
              les liens familiaux seront conservés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <AlertDialog
        open={resetPasswordUserId !== null && tempPassword !== ''}
        onOpenChange={() => {
          setResetPasswordUserId(null);
          setTempPassword('');
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mot de passe temporaire</AlertDialogTitle>
            <AlertDialogDescription>
              Le mot de passe de l'utilisateur a été réinitialisé. Voici le mot de passe temporaire
              :
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
                setResetPasswordUserId(null);
                setTempPassword('');
              }}
            >
              Copier et fermer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
