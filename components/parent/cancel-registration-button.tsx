'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { X, Loader2 } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface CancelRegistrationButtonProps {
  registrationId: string;
  childName: string;
  campName: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CancelRegistrationButton({
  registrationId,
  childName,
  campName,
}: CancelRegistrationButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const cancelMutation = trpc.registrations.updateStatus.useMutation({
    onSuccess: () => {
      toast.success('Inscription annul\u00e9e', {
        description: `L'inscription de ${childName} au camp "${campName}" a \u00e9t\u00e9 annul\u00e9e avec succ\u00e8s.`,
      });
      setOpen(false);
      router.refresh();
    },
    onError: (error) => {
      toast.error('Erreur lors de l\'annulation', {
        description: error.message,
      });
    },
  });

  const handleCancel = () => {
    cancelMutation.mutate({
      id: registrationId,
      status: 'CANCELLED',
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="w-full">
          <X className="mr-2 h-4 w-4" />
          Annuler l'inscription
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmer l'annulation</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              \u00cates-vous s\u00fbr de vouloir annuler l'inscription de{' '}
              <strong>{childName}</strong> au camp{' '}
              <strong>"{campName}"</strong> ?
            </p>
            <p className="text-destructive font-medium">
              Cette action est irr\u00e9versible.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancelMutation.isPending}>
            Non, garder l'inscription
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCancel}
            disabled={cancelMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {cancelMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Annulation...
              </>
            ) : (
              <>
                Oui, annuler l'inscription
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
