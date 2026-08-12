'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
import Link from 'next/link';
import { useDashboardBasePath } from '@/lib/hooks/use-dashboard-base-path';
import { StatusBadge } from '@/components/shared/status-badge';

type Refund = {
  id: string;
  amount: number;
  refundDate: Date;
  refundMethod: 'IMMEDIATE_REFUND' | 'FUTURE_CREDIT';
  reason: string;
  reference?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
  payment: {
    id: string;
    amount: number;
    paymentDate: Date;
    paymentMethodId?: string;
    paymentMethodName?: string;
    paymentMethodCode?: string;
    invoice: {
      id: string;
      invoiceNumber: string;
      parent: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
      };
    };
  };
};

export function RefundDetails({ refund }: { refund: Refund }) {
  const router = useRouter();
  const basePath = useDashboardBasePath();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteRefundMutation = trpc.refunds.delete.useMutation({
    onSuccess: () => {
      toast.success('Remboursement supprimé avec succès');
      router.push(`${basePath}/refunds`);
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message || 'Erreur lors de la suppression du remboursement');
      setIsDeleting(false);
    },
  });

  const handleDelete = async () => {
    setIsDeleting(true);
    deleteRefundMutation.mutate({ id: refund.id });
  };

  return (
    <div className="space-y-6">
      {/* Informations du remboursement */}
      <Card>
        <CardHeader>
          <CardTitle>Informations du remboursement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Montant remboursé</p>
              <p className="text-2xl font-bold">{refund.amount.toLocaleString()} XPF</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Date de remboursement</p>
              <p className="font-medium">
                {new Date(refund.refundDate).toLocaleDateString('fr-FR')}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Méthode de remboursement</p>
              <StatusBadge type="refund" status={refund.refundMethod} />
            </div>
            {refund.reference && (
              <div>
                <p className="text-sm text-muted-foreground">Référence</p>
                <p className="font-medium">{refund.reference}</p>
              </div>
            )}
          </div>

          <div>
            <p className="text-sm text-muted-foreground mb-1">Raison du remboursement</p>
            <p className="text-sm">{refund.reason}</p>
          </div>

          {refund.notes && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{refund.notes}</p>
            </div>
          )}

          <div className="pt-4 border-t">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Créé le</p>
                <p>{new Date(refund.createdAt).toLocaleString('fr-FR')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Modifié le</p>
                <p>{new Date(refund.updatedAt).toLocaleString('fr-FR')}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Informations du paiement associé */}
      <Card>
        <CardHeader>
          <CardTitle>Paiement remboursé</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div>
                <p className="text-sm text-muted-foreground">Montant du paiement original</p>
                <p className="font-semibold text-lg">{refund.payment.amount.toLocaleString()} XPF</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date de paiement</p>
                <p className="font-medium">
                  {new Date(refund.payment.paymentDate).toLocaleDateString('fr-FR')}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Méthode de paiement</p>
                <p className="font-medium">{refund.payment.paymentMethodName || 'Non spécifiée'}</p>
              </div>
            </div>
            <Link href={`${basePath}/payments/${refund.payment.id}`}>
              <Button variant="outline" size="sm">
                <FileText className="mr-2 h-4 w-4" />
                Voir le paiement
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Informations de la facture */}
      <Card>
        <CardHeader>
          <CardTitle>Facture associée</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div>
                <p className="text-sm text-muted-foreground">Numéro de facture</p>
                <p className="font-semibold text-lg">{refund.payment.invoice.invoiceNumber}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Parent</p>
                <p className="font-medium">
                  {refund.payment.invoice.parent.firstName} {refund.payment.invoice.parent.lastName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {refund.payment.invoice.parent.email}
                </p>
              </div>
            </div>
            <Link href={`${basePath}/invoices/${refund.payment.invoice.id}`}>
              <Button variant="outline" size="sm">
                <FileText className="mr-2 h-4 w-4" />
                Voir la facture
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={() => router.back()}>
          Retour
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={isDeleting}>
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Supprimer
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer ce remboursement ? Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
