'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { CheckCircle, Clock, AlertTriangle } from 'lucide-react';

interface RegistrationStatusDialogProps {
  registrationId: string;
  childName: string;
  campName: string;
  newStatus: 'CONFIRMED' | 'WAITLIST';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RegistrationStatusDialog({
  registrationId,
  childName,
  campName,
  newStatus,
  open,
  onOpenChange,
}: RegistrationStatusDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const utils = trpc.useUtils();

  const updateMutation = trpc.registrations.updateStatus.useMutation({
    onSuccess: () => {
      toast.success(
        newStatus === 'CONFIRMED'
          ? 'Inscription confirmée avec succès'
          : 'Inscription mise en liste d\'attente'
      );
      utils.registrations.list.invalidate();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message || 'Erreur lors de la mise à jour');
    },
    onSettled: () => {
      setIsLoading(false);
    },
  });

  const handleConfirm = async () => {
    setIsLoading(true);
    updateMutation.mutate({
      id: registrationId,
      status: newStatus,
    });
  };

  const getIcon = () => {
    if (newStatus === 'CONFIRMED') {
      return <CheckCircle className="h-6 w-6 text-green-600" />;
    }
    return <Clock className="h-6 w-6 text-yellow-600" />;
  };

  const getTitle = () => {
    if (newStatus === 'CONFIRMED') {
      return 'Confirmer l\'inscription';
    }
    return 'Mettre en liste d\'attente';
  };

  const getDescription = () => {
    if (newStatus === 'CONFIRMED') {
      return `Êtes-vous sûr de vouloir confirmer l'inscription de ${childName} pour le camp "${campName}" ?`;
    }
    return `Êtes-vous sûr de vouloir mettre en liste d'attente l'inscription de ${childName} pour le camp "${campName}" ?`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            {getIcon()}
            <DialogTitle>{getTitle()}</DialogTitle>
          </div>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>

        {newStatus === 'CONFIRMED' && (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-4 text-sm text-blue-800 dark:text-blue-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium mb-1">Important</p>
                <p className="text-xs">
                  Une fois confirmée, l'inscription sera comptabilisée dans la capacité du camp
                  et pourra être facturée.
                </p>
              </div>
            </div>
          </div>
        )}

        {newStatus === 'WAITLIST' && (
          <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950 p-4 text-sm text-yellow-800 dark:text-yellow-200">
            <div className="flex items-start gap-2">
              <Clock className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium mb-1">Liste d'attente</p>
                <p className="text-xs">
                  L'inscription sera placée en attente et pourra être confirmée ultérieurement si
                  des places se libèrent.
                </p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Annuler
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            variant={newStatus === 'CONFIRMED' ? 'default' : 'secondary'}
          >
            {isLoading ? 'Traitement...' : 'Confirmer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
