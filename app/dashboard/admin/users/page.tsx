'use client';

import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { getUsersColumns } from '@/components/admin/users/users-table-columns';
import { trpc } from '@/lib/trpc/client';
import { useRouter } from 'next/navigation';
import { useState, useMemo, useCallback } from 'react';
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

export default function AdminUsersPage() {
  const router = useRouter();
  const utils = trpc.useUtils();

  // State for dialogs
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string>('');

  // Fetch users with tRPC
  const { data, isLoading } = trpc.users.list.useQuery({
    limit: 100,
    offset: 0,
  });

  // Mutations
  const deleteMutation = trpc.users.delete.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      setDeleteUserId(null);
      alert('Utilisateur supprimé avec succès');
    },
    onError: (error) => {
      alert(`Erreur: ${error.message}`);
    },
  });

  const resetPasswordMutation = trpc.users.resetPassword.useMutation({
    onSuccess: (data) => {
      setTempPassword(data.tempPassword);
    },
    onError: (error) => {
      alert(`Erreur: ${error.message}`);
      setResetPasswordUserId(null);
    },
  });

  // Handlers
  const handleResetPassword = useCallback((userId: string) => {
    setResetPasswordUserId(userId);
    resetPasswordMutation.mutate({ userId });
  }, [resetPasswordMutation]);

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
    () => getUsersColumns({
      onResetPassword: handleResetPassword,
      onDelete: handleDelete,
    }),
    [handleResetPassword, handleDelete]
  );

  return (
    <>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Gestion des Utilisateurs"
          description="Gérez les comptes utilisateurs et leurs permissions"
          actions={
            <Button onClick={() => router.push('/dashboard/admin/users/new')}>
              <UserPlus className="mr-2 h-4 w-4" />
              Nouvel utilisateur
            </Button>
          }
        />

        {/* Liste des utilisateurs avec DataTable */}
        <Card>
          <CardContent className="pt-6">
            <DataTable
              columns={columns}
              data={data?.users ?? []}
              isLoading={isLoading}
              searchKey="name"
              searchPlaceholder="Rechercher par nom ou email..."
              pageSize={20}
            />
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteUserId !== null} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer cet utilisateur ? Cette action est irréversible.
              Toutes les données associées (profil, inscriptions) seront également supprimées.
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
              Le mot de passe de l'utilisateur a été réinitialisé. Voici le mot de passe temporaire :
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
