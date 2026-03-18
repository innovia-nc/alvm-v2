'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

type Payment = {
  id: string;
  amount: number;
  paymentDate: Date;
  paymentMethodId: string;
  paymentMethodName: string;
  paymentMethodCode: string;
  reference?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
  invoice: {
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    status: string;
    parent: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
  };
  creditNote?: {
    id: string;
    creditNoteNumber: string;
  } | null;
};


export function PaymentDetails({ payment }: { payment: Payment }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const deletePaymentMutation = trpc.payments.delete.useMutation({
    onSuccess: () => {
      toast.success('Paiement supprimé avec succès');
      router.push('/dashboard/admin/payments');
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message || 'Erreur lors de la suppression du paiement');
      setIsDeleting(false);
    },
  });

  const handleDelete = async () => {
    setIsDeleting(true);
    deletePaymentMutation.mutate({ id: payment.id });
  };

  return (
    <div className="space-y-6">
      {/* Informations du paiement */}
      <Card>
        <CardHeader>
          <CardTitle>Informations du paiement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Montant</p>
              <p className="text-2xl font-bold">{payment.amount.toLocaleString()} XPF</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Date de paiement</p>
              <p className="font-medium">
                {new Date(payment.paymentDate).toLocaleDateString('fr-FR')}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Méthode de paiement</p>
              <Badge variant="outline">{payment.paymentMethodName}</Badge>
            </div>
            {payment.reference && (
              <div>
                <p className="text-sm text-muted-foreground">Référence</p>
                <p className="font-medium">{payment.reference}</p>
              </div>
            )}
          </div>

          {payment.notes && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{payment.notes}</p>
            </div>
          )}

          <div className="pt-4 border-t">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Créé le</p>
                <p>{new Date(payment.createdAt).toLocaleString('fr-FR')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Modifié le</p>
                <p>{new Date(payment.updatedAt).toLocaleString('fr-FR')}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Informations de la facture associée */}
      <Card>
        <CardHeader>
          <CardTitle>Facture associée</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div>
                <p className="text-sm text-muted-foreground">Numéro de facture</p>
                <p className="font-semibold text-lg">{payment.invoice.invoiceNumber}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Parent</p>
                <p className="font-medium">
                  {payment.invoice.parent.firstName} {payment.invoice.parent.lastName}
                </p>
                <p className="text-sm text-muted-foreground">{payment.invoice.parent.email}</p>
              </div>
            </div>
            <Link href={`/dashboard/admin/invoices/${payment.invoice.id}`}>
              <Button variant="outline" size="sm">
                <FileText className="mr-2 h-4 w-4" />
                Voir la facture
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div>
              <p className="text-sm text-muted-foreground">Total facture</p>
              <p className="font-semibold">{payment.invoice.totalAmount.toLocaleString()} XPF</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total payé</p>
              <p className="font-semibold">{payment.invoice.paidAmount.toLocaleString()} XPF</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Reste à payer</p>
              <p className="font-semibold text-primary">
                {payment.invoice.remainingAmount.toLocaleString()} XPF
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Avoir associé (si applicable) */}
      {payment.creditNote && (
        <Card>
          <CardHeader>
            <CardTitle>Avoir associé</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Numéro d'avoir</p>
                <p className="font-semibold">{payment.creditNote.creditNoteNumber}</p>
              </div>
              <Link href={`/dashboard/admin/credit-notes/${payment.creditNote.id}`}>
                <Button variant="outline" size="sm">
                  <FileText className="mr-2 h-4 w-4" />
                  Voir l'avoir
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

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
                Êtes-vous sûr de vouloir supprimer ce paiement ? Cette action est irréversible et
                mettra à jour le solde de la facture associée.
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
