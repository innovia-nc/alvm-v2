'use client';

import type { Row } from '@tanstack/react-table';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { DataTableServer } from '@/components/ui/data-table-server';
import { staffColumns, type StaffMember, StaffActions } from './columns';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function StaffTableClient() {
  const router = useRouter();
  const [deletingStaff, setDeletingStaff] = useState<StaffMember | null>(null);
  const [resetPasswordStaff, setResetPasswordStaff] = useState<StaffMember | null>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Terme de recherche soumis (validation « Entrée » / bouton — US-UX-01).
  const [search, setSearch] = useState('');

  const pagination = useServerPagination({ defaultPageSize: 20 });

  const { data, isLoading } = trpc.staff.list.useQuery({
    limit: pagination.limit,
    offset: pagination.offset,
    search,
  });

  const resetPasswordMutation = trpc.users.resetPassword.useMutation({
    onSuccess: (data) => {
      setTempPassword(data.tempPassword);
    },
    onError: (err) => {
      toast.error(err.message || 'Impossible de réinitialiser le mot de passe');
      setResetPasswordStaff(null);
    },
  });

  const deleteMutation = trpc.staff.delete.useMutation({
    onSuccess: () => {
      toast.success('Membre du personnel supprimé avec succès');
      setDeletingStaff(null);
      router.refresh();
    },
    onError: (err) => {
      setError(err.message || 'Impossible de supprimer ce membre du personnel');
      setDeletingStaff(null);
    },
  });

  function handleResetPassword(member: StaffMember) {
    setResetPasswordStaff(member);
    resetPasswordMutation.mutate({ userId: member.id });
  }

  async function handleDelete() {
    if (!deletingStaff) return;

    try {
      setError(null);
      await deleteMutation.mutateAsync({ id: deletingStaff.id });
    } catch {
      // Erreur déjà gérée par onError
    }
  }

  const columnsWithActions = staffColumns.map((col) => {
    if (col.id === 'actions') {
      return {
        ...col,
        cell: ({ row }: { row: Row<StaffMember> }) => (
          <StaffActions
            member={row.original}
            onResetPassword={handleResetPassword}
            onDelete={setDeletingStaff}
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

      <DataTableServer
        columns={columnsWithActions}
        data={data?.staff || []}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="email"
        searchPlaceholder="Rechercher par nom, email ou téléphone..."
        onSearchChange={setSearch}
      />

      <AlertDialog
        open={!!deletingStaff}
        onOpenChange={(open) => !open && setDeletingStaff(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le membre{' '}
              <strong>
                {deletingStaff?.firstName} {deletingStaff?.lastName}
              </strong>{' '}
              ?
              <br />
              <br />
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={resetPasswordStaff !== null && tempPassword !== ''}
        onOpenChange={(open) => {
          if (!open) {
            setResetPasswordStaff(null);
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
                {resetPasswordStaff?.firstName} {resetPasswordStaff?.lastName}
              </strong>{' '}
              a été réinitialisé. Voici le mot de passe temporaire :
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg bg-muted p-4">
            <code className="text-lg font-mono font-bold">{tempPassword}</code>
          </div>
          <AlertDialogDescription className="text-sm text-destructive">
            Copiez ce mot de passe maintenant, il ne sera plus affiché.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                navigator.clipboard.writeText(tempPassword);
                setResetPasswordStaff(null);
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
