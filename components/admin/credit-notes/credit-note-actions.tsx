'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { CheckCircle, XCircle, Trash2, MoreVertical, Loader2 } from 'lucide-react';
import { useDashboardBasePath } from '@/lib/hooks/use-dashboard-base-path';

interface CreditNote {
  id: string;
  creditNoteNumber: string;
  status: 'DRAFT' | 'SENT' | 'CANCELLED';
  isFutureCredit: boolean;
}

interface CreditNoteActionsProps {
  creditNote: CreditNote;
}

export function CreditNoteActions({ creditNote }: CreditNoteActionsProps) {
  const router = useRouter();
  const basePath = useDashboardBasePath();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<'SENT' | 'CANCELLED' | null>(null);

  const updateStatusMutation = trpc.creditNotes.updateStatus.useMutation({
    onSuccess: () => {
      toast.success('Statut mis à jour avec succès');
      setStatusDialogOpen(false);
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message || 'Erreur lors de la mise à jour');
      setStatusDialogOpen(false);
    },
  });

  const deleteMutation = trpc.creditNotes.delete.useMutation({
    onSuccess: () => {
      toast.success('Avoir supprimé avec succès');
      router.push(`${basePath}/credit-notes`);
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message || 'Erreur lors de la suppression');
      setDeleteDialogOpen(false);
    },
  });

  const handleUpdateStatus = (status: 'SENT' | 'CANCELLED') => {
    setTargetStatus(status);
    setStatusDialogOpen(true);
  };

  const confirmUpdateStatus = () => {
    if (targetStatus) {
      updateStatusMutation.mutate({ id: creditNote.id, status: targetStatus });
    }
  };

  const confirmDelete = () => {
    deleteMutation.mutate({ id: creditNote.id });
  };

  const getStatusActionLabel = (status: 'SENT' | 'CANCELLED') => {
    switch (status) {
      case 'SENT':
        return 'émettre';
      case 'CANCELLED':
        return 'annuler';
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {creditNote.status === 'DRAFT' && (
              <DropdownMenuItem onClick={() => handleUpdateStatus('SENT')}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Émettre
              </DropdownMenuItem>
            )}

            {(creditNote.status === 'DRAFT' || creditNote.status === 'SENT') && (
              <DropdownMenuItem
                onClick={() => handleUpdateStatus('CANCELLED')}
                className="text-orange-600 focus:text-orange-600"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Annuler
              </DropdownMenuItem>
            )}

            {creditNote.status === 'DRAFT' && (
              <DropdownMenuItem
                onClick={() => setDeleteDialogOpen(true)}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Supprimer
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Status Update Dialog */}
      <AlertDialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer le changement de statut</AlertDialogTitle>
            <AlertDialogDescription>
              {targetStatus && (
                <>
                  Voulez-vous {getStatusActionLabel(targetStatus)} l'avoir{' '}
                  <strong>{creditNote.creditNoteNumber}</strong> ?
                  {targetStatus === 'SENT' && (
                    <div className="mt-2 rounded-lg bg-yellow-50 p-3 text-yellow-900">
                      <strong>Attention :</strong> Une fois émis, l'avoir ne pourra plus être
                      modifié.
                    </div>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateStatusMutation.isPending}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmUpdateStatus}
              disabled={updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer l'avoir{' '}
              <strong>{creditNote.creditNoteNumber}</strong> ?
              <div className="mt-2 rounded-lg bg-red-50 p-3 text-red-900">
                <strong>Attention :</strong> Cette action est irréversible.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
