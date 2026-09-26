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
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);

  const cancelMutation = trpc.registrations.requestCancellation.useMutation({
    onSuccess: async (result) => {
      await utils.dashboard.summary.invalidate(undefined, { refetchType: 'all' });
      toast.success(result.cancelled ? 'Inscription annulée' : 'Demande d’annulation transmise', {
        description: result.cancelled
          ? 'Votre désistement est enregistré.'
          : 'Le secrétariat traitera votre demande et sa compensation éventuelle.',
      });
      setOpen(false);
      router.refresh();
    },
    onError: (error) => {
      toast.error("Erreur lors de l'annulation", {
        description: error.message,
      });
    },
  });

  const handleCancel = () => {
    cancelMutation.mutate({
      id: registrationId,
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="text-destructive">
          <X className="mr-2 h-4 w-4" />
          Annuler l'inscription
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmer l'annulation</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Êtes-vous sûr de vouloir annuler l'inscription de <strong>{childName}</strong> au
                camp <strong>"{campName}"</strong> ?
              </p>
              <p className="text-destructive font-medium">
                Une inscription confirmée ou facturée fera l’objet d’une demande au secrétariat.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancelMutation.isPending}>
            Non, garder l'inscription
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              handleCancel();
            }}
            disabled={cancelMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {cancelMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Annulation...
              </>
            ) : (
              <>Oui, annuler l'inscription</>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
