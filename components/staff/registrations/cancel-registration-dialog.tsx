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
import { XCircle, AlertTriangle } from 'lucide-react';

interface CancelRegistrationDialogProps {
  registrationId: string;
  childName: string;
  campName: string;
  hasInvoice: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CancelRegistrationDialog({
  registrationId,
  childName,
  campName,
  hasInvoice,
  open,
  onOpenChange,
}: CancelRegistrationDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const utils = trpc.useUtils();

  const updateMutation = trpc.registrations.updateStatus.useMutation({
    onSuccess: () => {
      toast.success('Inscription annul\u00e9e avec succ\u00e8s');
      utils.registrations.list.invalidate();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message || 'Erreur lors de l\'annulation');
    },
    onSettled: () => {
      setIsLoading(false);
    },
  });

  const handleConfirm = async () => {
    setIsLoading(true);
    updateMutation.mutate({
      id: registrationId,
      status: 'CANCELLED',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <XCircle className="h-6 w-6 text-red-600" />
            <DialogTitle>Annuler l'inscription</DialogTitle>
          </div>
          <DialogDescription>
            \u00cates-vous s\u00fbr de vouloir annuler l'inscription de {childName} pour le camp "{campName}" ?
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-red-50 dark:bg-red-950 p-4 text-sm text-red-800 dark:text-red-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium mb-1">Attention</p>
              <p className="text-xs">
                Cette action marquera l'inscription comme annul\u00e9e. La place sera lib\u00e9r\u00e9e dans la
                capacit\u00e9 du camp.
              </p>
              {hasInvoice && (
                <p className="text-xs mt-2 font-medium">
                  Une facture existe pour cette inscription. Vous devrez cr\u00e9er un avoir si
                  n\u00e9cessaire.
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Retour
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            variant="destructive"
          >
            {isLoading ? 'Annulation...' : 'Confirmer l\'annulation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
